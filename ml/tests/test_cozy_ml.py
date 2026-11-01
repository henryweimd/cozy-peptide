"""Zero-dependency smoke tests: `cd ml && python3 -m unittest discover -s tests`."""

import json
import os
import unittest

from cozy_ml.data.datasets import build_pairs, build_user_prompt, train_eval_split
from cozy_ml.data.export import export_hash, join_records
from cozy_ml.eval.evaluate import evaluate, parse_sequence, validity_issues
from cozy_ml.models.muse import (
    PLACEHOLDER_BASE_MODEL,
    resolve_base_model,
)

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "data", "synthetic")


def load_fixture(name):
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as handle:
        return json.load(handle)


class ExportTest(unittest.TestCase):
    def test_join_keeps_cc0_with_sequence(self):
        assays = load_fixture("assays.json")
        runs = load_fixture("runs.json")
        joined = join_records(assays, run_resolver=runs.get)
        # assay-4 is non-CC0 and must be dropped; the rest join.
        self.assertEqual([r.assay_id for r in joined], ["assay-1", "assay-2", "assay-3"])
        self.assertEqual(joined[0].sequence, runs["run-1"]["candidateSequence"])
        self.assertEqual(joined[0].target, runs["run-1"]["target"])

    def test_join_drops_missing_run(self):
        assays = load_fixture("assays.json")
        joined = join_records(assays, run_resolver=lambda _run_id: None)
        self.assertEqual(joined, [])

    def test_export_hash_stable_and_sensitive(self):
        assays = load_fixture("assays.json")
        runs = load_fixture("runs.json")
        first = join_records(assays, run_resolver=runs.get)
        second = join_records(assays, run_resolver=runs.get)
        self.assertEqual(export_hash(first), export_hash(second))
        self.assertNotEqual(export_hash(first), export_hash(first[1:]))


class DatasetsTest(unittest.TestCase):
    def test_pairs_use_passed_validated_sequences(self):
        assays = load_fixture("assays.json")
        runs = load_fixture("runs.json")
        pairs = build_pairs(join_records(assays, run_resolver=runs.get))
        # assay-3 failed, so only two teacher pairs survive.
        self.assertEqual(len(pairs), 2)
        for pair in pairs:
            roles = [m["role"] for m in pair["messages"]]
            self.assertEqual(roles, ["system", "user", "assistant"])
            self.assertEqual(pair["meta"]["teacher"], "muse-spark-pipeline")
            self.assertEqual(pair["meta"]["consent_license"], "CC0")

    def test_pairs_deduplicate_sequences(self):
        assays = load_fixture("assays.json")
        runs = load_fixture("runs.json")
        doubled = assays + [dict(assays[0], id="assay-1-dup")]
        pairs = build_pairs(join_records(doubled, run_resolver=runs.get))
        self.assertEqual(len(pairs), 2)

    def test_prompt_carries_target_and_constraints(self):
        assays = load_fixture("assays.json")
        runs = load_fixture("runs.json")
        record = join_records(assays, run_resolver=runs.get)[0]
        prompt = build_user_prompt(record)
        self.assertIn("Clostridioides difficile", prompt)
        self.assertIn("knottin-6c", prompt)
        self.assertIn("4", prompt)

    def test_split_is_deterministic_and_complete(self):
        assays = load_fixture("assays.json")
        runs = load_fixture("runs.json")
        pairs = build_pairs(
            join_records(assays, run_resolver=runs.get), passed_only=False
        )
        train_a, eval_a = train_eval_split(pairs)
        train_b, eval_b = train_eval_split(pairs)
        self.assertEqual(train_a, train_b)
        self.assertEqual(eval_a, eval_b)
        self.assertEqual(len(train_a) + len(eval_a), len(pairs))
        self.assertGreaterEqual(len(eval_a), 1)


class EvaluateTest(unittest.TestCase):
    def test_parse_extracts_peptide_run(self):
        self.assertEqual(
            parse_sequence("Here is your peptide:\nACDEFGHIKLMN\nGood luck."),
            "ACDEFGHIKLMN",
        )
        self.assertIsNone(parse_sequence("no sequence here!"))

    def test_validity_flags_length_cysteine_charge(self):
        good = "CAAACCCAAAEKKRKKTTSSGGHHRRCCDD"
        self.assertEqual(validity_issues(good, "knottin target"), [])
        self.assertTrue(validity_issues("ACDE", "target"))
        self.assertTrue(validity_issues("A" * 30, "knottin target"))
        self.assertTrue(validity_issues("D" * 30, "target"))

    def test_metrics_reward_valid_novel(self):
        train = {"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}
        refs = ["CAAACCCAAAEKKRKKTTSSGGHHRRCCDD"]
        completions = [
            {
                "messages": [{"role": "user", "content": "knottin target"}],
                "completion": "CAAACCCAAAEKKRKKTTSSGGHHRRCCDD",
            },
            {
                "messages": [{"role": "user", "content": "knottin target"}],
                "completion": "CCKKRRAACCTTGGHHKKSSRRCCAAMMDD",
            },
        ]
        report = evaluate(completions, train, refs)
        self.assertEqual(report["n_valid"], 2)
        self.assertEqual(report["validity_rate"], 1.0)
        self.assertEqual(report["novelty_rate"], 1.0)
        self.assertTrue(report["passes_gate"])


class ConfigTest(unittest.TestCase):
    def test_placeholder_base_model_rejected(self):
        with self.assertRaises(ValueError):
            resolve_base_model(PLACEHOLDER_BASE_MODEL)
        with self.assertRaises(ValueError):
            resolve_base_model(None)
        self.assertEqual(
            resolve_base_model("meta-muse/muse-8b"), "meta-muse/muse-8b"
        )

    def test_training_config_parses(self):
        try:
            import yaml  # noqa: F401
        except ImportError:
            self.skipTest("pyyaml not installed")
        import yaml

        config_path = os.path.join(
            os.path.dirname(__file__), "..", "configs", "sft_muse.yaml"
        )
        with open(config_path, encoding="utf-8") as handle:
            config = yaml.safe_load(handle)
        self.assertIn("base_model", config)
        self.assertIn("lora", config)
        self.assertIn("training", config)
        self.assertTrue(config["data"]["cc0_only"])


if __name__ == "__main__":
    unittest.main()
