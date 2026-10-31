import { test } from "node:test";
import assert from "node:assert/strict";

import { parseDesignParams } from "../lib/design-params";
import { DEMO_PRESETS } from "../lib/demo-config";

function getter(entries: Record<string, string>): {
  get: (key: string) => string | null;
} {
  return { get: (key: string) => entries[key] ?? null };
}

test("design params prefer run, then custom, then preset", () => {
  const preset = DEMO_PRESETS[0];
  assert.ok(preset !== undefined);
  assert.deepEqual(
    parseDesignParams(
      getter({
        run: "00000000-0000-0000-0000-000000000001",
        custom: "colitis",
        target: preset.id,
      })
    ),
    { runId: "00000000-0000-0000-0000-000000000001" }
  );
  assert.deepEqual(
    parseDesignParams(getter({ custom: "  colitis ", target: preset.id })),
    { custom: "colitis" }
  );
  assert.deepEqual(
    parseDesignParams(getter({ target: preset.id })),
    { presetId: preset.id }
  );
});

test("design params reject bad ids and fall through to idle", () => {
  assert.deepEqual(parseDesignParams(getter({ run: "nope" })), {});
  assert.deepEqual(parseDesignParams(getter({ target: "nope" })), {});
  assert.deepEqual(parseDesignParams(getter({ custom: "   " })), {});
  assert.deepEqual(parseDesignParams(getter({})), {});
  const long = parseDesignParams(
    getter({ custom: `colitis ${"x".repeat(500)}` })
  );
  assert.ok((long.custom ?? "").length <= 200);
});
