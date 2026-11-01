"""Pull lab-loop assay data and join it to designed sequences.

Contract (web side, do not drift without a matching web change):
  GET {base}/api/assay-export?format=json&limit=N  (Bearer token)
    -> {success, data: {count, max_limit, rows: CommunityAssayRow[]}}
  GET {base}/api/peptide-run?id=<uuid>  (public)
    -> {success, data: {target, modality, chargeTarget,
                        candidateId, candidateSequence, ...}}

Consent rule: community training keeps ONLY rows whose consent_license
is exactly "CC0". Anything else is dropped, never trained on.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import urllib.request
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class JoinedRecord:
    assay_id: str
    run_id: str
    assay_type: str
    template_version: str
    passed: bool | None
    value_num: float | None
    value_unit: str | None
    organism_or_cells: str | None
    consent_license: str
    sequence: str
    target: str
    modality: str | None
    charge_target: float | None


def _get_json(url: str, token: str | None = None, timeout_s: int = 30) -> dict:
    request = urllib.request.Request(url)
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=timeout_s) as response:
        return json.load(response)


def fetch_assays(base_url: str, token: str, limit: int = 200) -> list[dict]:
    """Fetch consented community assay rows (newest first)."""
    envelope = _get_json(
        f"{base_url.rstrip('/')}/api/assay-export?format=json&limit={limit}",
        token=token,
    )
    if not envelope.get("success"):
        raise RuntimeError(f"assay-export failed: {envelope.get('error')}")
    rows = envelope["data"]["rows"]
    if not isinstance(rows, list):
        raise RuntimeError("assay-export returned a non-list rows payload")
    return rows


def fetch_run(base_url: str, run_id: str) -> dict | None:
    """Fetch one run's design record; None when missing/unreadable."""
    try:
        envelope = _get_json(
            f"{base_url.rstrip('/')}/api/peptide-run?id={run_id}"
        )
    except Exception:
        return None
    if not envelope.get("success"):
        return None
    data = envelope.get("data")
    return data if isinstance(data, dict) else None


def join_records(
    assay_rows: list[dict],
    run_resolver,
    cc0_only: bool = True,
    require_sequence: bool = True,
) -> list[JoinedRecord]:
    """Join assay rows to their run's designed sequence.

    run_resolver(run_id) -> run dict | None (injectable for tests).
    Rows that fail consent, lack a sequence, or lack a run are dropped.
    """
    joined: list[JoinedRecord] = []
    run_cache: dict[str, dict | None] = {}
    for row in assay_rows:
        if cc0_only and row.get("consent_license") != "CC0":
            continue
        run_id = row.get("run_id")
        if not isinstance(run_id, str) or not run_id:
            continue
        if run_id not in run_cache:
            run_cache[run_id] = run_resolver(run_id)
        run = run_cache[run_id]
        if not isinstance(run, dict):
            continue
        sequence = run.get("candidateSequence")
        target = run.get("target")
        if require_sequence and (
            not isinstance(sequence, str) or not sequence
        ):
            continue
        if not isinstance(target, str) or not target:
            continue
        joined.append(
            JoinedRecord(
                assay_id=str(row.get("id", "")),
                run_id=run_id,
                assay_type=str(row.get("assay_type", "")),
                template_version=str(row.get("template_version", "")),
                passed=row.get("passed"),
                value_num=row.get("value_num"),
                value_unit=row.get("value_unit"),
                organism_or_cells=row.get("organism_or_cells"),
                consent_license=str(row.get("consent_license", "")),
                sequence=sequence,
                target=target,
                modality=run.get("modality"),
                charge_target=run.get("chargeTarget"),
            )
        )
    return joined


def export_hash(records: list[JoinedRecord]) -> str:
    """Stable sha256 over the joined records for training provenance."""
    canonical = json.dumps(
        [asdict(r) for r in records], sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export CC0 assays joined to run sequences"
    )
    parser.add_argument("--base-url", required=True)
    parser.add_argument(
        "--token", default=os.environ.get("API_BEARER_TOKEN", "")
    )
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--out", required=True, help="joined records JSON")
    cli = parser.parse_args()
    if not cli.token:
        raise SystemExit("missing Bearer [REDACTED] --token or API_BEARER_TOKEN")

    def resolver(run_id: str) -> dict | None:
        return fetch_run(cli.base_url, run_id)

    rows = fetch_assays(cli.base_url, cli.token, limit=cli.limit)
    records = join_records(rows, run_resolver=resolver)
    payload = {
        "export_hash": export_hash(records),
        "fetched_rows": len(rows),
        "joined_records": len(records),
        "records": [asdict(r) for r in records],
    }
    with open(cli.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(
        f"joined {len(records)}/{len(rows)} rows "
        f"(hash {payload['export_hash'][:12]}) -> {cli.out}"
    )


if __name__ == "__main__":
    main()
