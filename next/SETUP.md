# The Dojo next — first phase

The new app is in `next/index.html`. The original app is unchanged. Google Sheet Dojo_Master remains authoritative. This phase implements workout capture, reviewed AI parsing, journal writes with linked techniques/pearls, local draft/audio recovery, pending saves, and recent sessions. It does not yet implement full-history Sensei search, Class Prep, the strategy map, editing saved entries, or a service worker for cold-start offline access.

## Current evidence

- Local Chromium integration checks passed using simulated Google and AI services.
- Worker unit checks passed using simulated identity/provider responses.
- Simulated microphone test passed for recognition restart and transcript/audio recovery across reload.
- No real Sheet records were read or changed during development. No real AI request was made.
- The user reports deploying the Worker and its settings. Direct checks from this cloud environment were blocked by its egress proxy (tunnel HTTP 403); the Worker response, real AI operation, and iPad behavior remain unverified. The frontend has not been published.

## Preview and verify locally

From the repository root:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open the `/next/` path on that local server in a development browser. For actual Google sign-in, the OAuth client must authorize that exact local origin (for example `http://localhost:8000`). The existing production origin is `https://cscourtney.github.io`. This cloud onboarding chat does not provide a user-facing localhost preview.

Checks (Node 24, Python Playwright, and `/usr/bin/chromium` are available here):

```sh
node --test tests/worker.test.mjs
python tests/browser_smoke.py
python tests/recording_smoke.py
```

## Connect the new AI Worker

Deploy this as a NEW Worker; do not overwrite the old service used by the original app.

1. In Cloudflare, use `worker/worker.mjs` and `worker/wrangler.toml`. The deployed Worker name is `yhe-dojo-next`, at `https://yhe-dojo-next.livingthesearch1.workers.dev`.
2. Set the secret `ANTHROPIC_API_KEY` securely in Cloudflare. Do not paste it into chat or source files.
3. Set the variable `MODEL` to a current model enabled on your Anthropic account. The Worker fails closed if it is missing; the configuration now matches the dashboard value `claude-sonnet-4-6`. No model is hardcoded into the app.
4. Confirm `ALLOWED_EMAILS` contains only your Google account(s). The supplied configuration lists the two accounts in the handoff. Confirm the right account during sign-in.
5. Keep the `AI_RATE_LIMITER` binding from the configuration (10 requests per 60 seconds per account, with Cloudflare's per-location rate-limit semantics). Origin checks are an additional browser restriction, not the authentication mechanism. This rate limit is not a global billing cap; configure provider spending limits separately if desired.
6. In the new app's Connection settings, enter the new Worker's HTTPS origin. No key or shared token is entered in the app.

For a developer using the Cloudflare CLI, from `worker/`:

```sh
npx --yes wrangler@4.151.0 login
npx --yes wrangler@4.151.0 secret put ANTHROPIC_API_KEY
# Add MODEL in the Cloudflare dashboard or as a non-secret var in wrangler.toml.
npx --yes wrangler@4.151.0 deploy
```

Review deployment before running it. Deployment requires Cloudflare account access, which is not available in the current cloud task. The public app supplies a Google OAuth access token with `openid email spreadsheets` scopes; the Worker checks Google's verified email and its server-side allowlist. Do not connect the old pass-through Worker to this new app.

## Publish the separate test app

Review the new files first. When approved, publish the repository changes through GitHub Pages. The intended separate test address is the existing Pages site plus `/next/`; it is not live until the files are published. Keep `The Dojo.html` and its current address unchanged. No production entry-point or Pages setting needs changing if the current Pages build publishes the repository root.

## First live iPad check — the finish line

1. Open the new test app over HTTPS and connect the correct Google account. Confirm recent entries match Dojo_Master.
2. Record a three-minute recap with pauses. Stop, replay the retained audio, and inspect the transcript. Background/screen-off recording is not promised; keep the app open.
3. Organize the recap. Confirm dates, BJJ terms, and meaning; correct fields before saving. AI never saves automatically.
4. Save a clearly labeled test entry including a pearl and technique name. Confirm the entry and linked rows in the actual Sheet, then refresh on the other device.
5. Interrupt the network during a save, reconnect, and finish using Refresh & sync. Confirm one journal row and the applicable linked rows.
6. If a step fails, use Connection settings → Copy diagnostics. The report excludes tokens and training content.

This phase is not complete until these real-service checks pass. Native speech recognition accuracy and simultaneous audio-recording behavior vary on iOS. If live transcription is unavailable, the app retains audio for download and permits typed/native keyboard dictation; it does NOT yet upload audio to a transcription API.

## Data details and limitations

- Reads and appends use the current header row. Missing/duplicate headers stop a write rather than silently losing fields. Required `data` headers are documented in `docs/GOOGLE_SHEET.md`. The app does not add headers or change the Sheet schema automatically.
- Original recap text is preserved in `notes`, alongside reviewed notes, with an `Original recap:` marker. No new Sheet column is required.
- Stable IDs reconcile retry-after-timeout and partial subsidiary writes. Pearls are identified by `(entry_id, pearl)` because the existing schema has no pearl ID.
- Sheets has no atomic unique constraint. Simultaneous retries of the same pending entry in multiple open tabs/devices are not guaranteed duplicate-free. Pending drafts are device-local, so cross-device testing should read a completed Sheet save rather than copy a pending queue.
- Local audio is not uploaded to Sheets or AI. It is retained for the current draft, can be downloaded, and is removed when that draft is completed or replaced. Browser storage can still be cleared or run out of space.
- Opening the app does not request Google login. No long-lived Google token is stored. Organize and Refresh request a replacement token from their own click when the in-memory session is missing or expired, without forcing account selection. Google may still show a popup. This is not a persistent backend session across visits.
- Existing old files may still contain historical credentials. They were not copied into the new code; revocation and legacy-file cleanup remain a separate security task from the handoff.
