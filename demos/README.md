# Demo videos

`cozy-2min/` is the 2-minute hackathon walkthrough, built with
[aidemo](https://github.com/tandryukha/aidemo) using **local models + offline
rendering** (Kokoro TTS, no video API spend). The storyboard is the source of
truth; the MP4 is a build artifact (git-ignored — upload it to video hosting
and point `https://www.youtube.com/watch?v=zxj1aQAsXQ0` at it).

## Re-render

```bash
# 1. Engine lives OUTSIDE this repo (it needs kokoro-js + browsers):
git clone --depth 1 --branch stable https://github.com/tandryukha/aidemo.git /tmp/aidemo-engine
cd /tmp/aidemo-engine && npm install && npm install --no-save kokoro-js

# 2. Serve this repo's production build (the storyboard films :3000):
npm run build && npm start -- --port 3000 --hostname 127.0.0.1

# 3. Validate, then render (first run downloads the ~90MB Kokoro model):
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
