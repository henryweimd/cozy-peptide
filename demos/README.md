# Demo videos

`cozy-2min/` is the original 2-minute hackathon walkthrough, built with
[aidemo](https://github.com/tandryukha/aidemo) using **local models + offline
rendering** (Kokoro TTS, no video API spend). Superseded by `cozy-150s/` below;
kept for its storyboard and take history.

`cozy-150s/` is the current walkthrough (146s cut, published as the ~3-minute
video at `https://www.youtube.com/watch?v=5MatuocaAJk`), voiced with
**ElevenLabs TTS** (`AIDEMO_TTS_PROVIDER=elevenlabs` + `ELEVENLABS_API_KEY` in
repo-root `.env`; the storyboard keeps the `marin` default, which the engine
resolves to `AIDEMO_ELEVENLABS_VOICE`). Its signature beat is scene `s4-hero`,
which parks on the Design page's inverted hero panel (peptide sequence, Copy
peptide / Copy DNA / DNA (.fasta)) with word-anchored callouts. Captions are
offline/script-timed (no `OPENAI_API_KEY` needed). The MP4 is a build artifact
(git-ignored — re-render and re-upload to update the published video).

## Re-render (cozy-150s)

```bash
# 1. Engine lives OUTSIDE this repo:
git clone --depth 1 --branch stable https://github.com/tandryukha/aidemo.git /tmp/aidemo-engine
cd /tmp/aidemo-engine && npm install
# If tsx can't start in your sandbox, transpile once and use dist/ instead:
./node_modules/.bin/esbuild "src/*.ts" --outdir=dist --format=esm --platform=node
AIDEMO="node /tmp/aidemo-engine/dist/cli.js"  # else: node /tmp/aidemo-engine/bin/aidemo.mjs

# 2. Serve this repo's production build (the storyboard films :3000),
#    restarted fresh so the /api/demo-stream cooldown is clear:
npm run build && npm start -- --port 3000 --hostname 127.0.0.1

# 3. Staged render (full `render` needs an OpenAI key for captions; with
#    ElevenLabs TTS + no OpenAI key, run captions --offline between record
#    and compose). Cwd must be the repo root so .env (ElevenLabs) loads:
$AIDEMO validate <repo>/demos/cozy-150s
$AIDEMO voice <repo>/demos/cozy-150s                      # ElevenLabs; skips unchanged scenes
$AIDEMO record --fresh --headless <repo>/demos/cozy-150s
$AIDEMO captions --offline <repo>/demos/cozy-150s
$AIDEMO compose <repo>/demos/cozy-150s
```

Output: `cozy-150s/output/final-demo.mp4` (+ `.srt`/`.vtt` captions).

## Re-render (cozy-2min, legacy Kokoro cut)

```bash
# Same engine + server as above, plus kokoro-js in the engine:
cd /tmp/aidemo-engine && npm install --no-save kokoro-js
node bin/aidemo.mjs validate <repo>/demos/cozy-2min
AIDEMO_TTS_PROVIDER=local AIDEMO_TTS_MODEL_CACHE=/tmp/aidemo-models \
  PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright \
  node bin/aidemo.mjs render --headless --fresh <repo>/demos/cozy-2min
```

Output: `cozy-2min/output/final-demo.mp4` (+ `.srt`/`.vtt` captions).

## Gotchas

- The storyboard's live design run hits `/api/demo-stream` (60s per-IP
  cooldown, in-memory). **Restart the :3000 server right before each take** or
  the run errors and the take fails on the Lab-handoff assert.
- Deep links (`/design?target=c-diff`) auto-run — the storyboard does not click
  any run button.
- `voiceId: af_heart` is a Kokoro voice; the `marin` default also maps to local
  TTS when `AIDEMO_TTS_PROVIDER=local`.
- Committed: `generated/storyboard.json`, captions, this README. Ignored:
  `output/*.mp4`, `recordings/`, `audio/`, `logs/`, Chrome profiles.
