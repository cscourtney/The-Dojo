# The Dojo — working agreement

Chuck is building a personal BJJ app and is not a developer. Keep explanations short and plain. Protect his time: one useful phase at a time, clear finish lines, no unsupported time promises. If a fix fails twice, reassess the cause before another attempt.

## Current direction (user-approved)
- A staged fresh build in `next/`, starting with workout logging. The original root `The Dojo.html` remains available and unchanged.
- Google Sheet Dojo_Master is the source of truth, across devices. Do not replace it with a database. IndexedDB is only a local draft, pending-save, and mirror cache.
- Preserve the user's real sensei/ninja/warrior artwork. The user explicitly requested a fresh visual direction; the legacy handoff's typography/palette restrictions are historical, not requirements for `next/`.
- Native keyboard dictation or typing is the approved journal input. Do not restore app audio capture or add a transcription API without a new request. Earlier saved audio must remain recoverable until explicitly deleted.
- Preserve the original journal labels/order and class/home drill/technique session structure. New Technique and New Takedown must be explicit choices; AI must never opt in to creation or map linking.
- Repeating or linking an existing technique must not create a new library record. Name/position aliases are normalized for duplicate detection; do not merge differently named techniques by guesswork.
- Pearls read the existing pearls tab; Fundamentals projects journal data. No new fundamentals tab. Strategy links group stored map references; the interactive map is not rebuilt yet.
- Next phases (not implemented): full-history smart search, Class Prep, interactive strategy map, saved-entry editing. Do not add unrelated features during the logging phase.
- Sheet contract: `docs/GOOGLE_SHEET.md`. The uploaded handoff is historical context, not proof of deployed behavior; its private planning notes are not part of the public test release.

## Data and infrastructure
- Read AND write Sheets by freshly read header names. Sort records by date, not row order. IDs are stable; never use cached row numbers for edits.
- Journal saves include applicable `techniques` and `pearls` writes. Apps Script onEdit does not fire for API writes.
- Partial writes must stay pending. Re-read and reconcile stable IDs before retrying; never claim Sheets provides atomic uniqueness across devices.
- Never put credentials in Git. The new Worker verifies a Google identity against server-side allowed emails and rate limits AI calls. Browser code contains no API key or shared secret.
- Cloudflare is the chosen AI backend. Model selection is server-side. Avoid navigator.onLine as a gate; try the operation and handle errors.
- No automatic Google sign-in on opening a page. Access tokens stay in memory. Users choose the Google account explicitly.
- Never print tokens, transcripts, or private journal data in diagnostics.

## Verification and release
- Keep the old app usable. The user authorized publishing updates to the separate `/next/` test app. Run checks first; do not change the original app or Cloudflare service as part of frontend updates.
- Local checks: serve repo with `python -m http.server 8000 --bind 127.0.0.1 --directory /workspace/The-Dojo`.
- `node tests/worker.test.mjs`
- `python tests/browser_smoke.py`
- Python browser checks require Playwright and Chromium, available in the prepared cloud environment. External APIs in these tests are mocked; never describe them as live validation.
- After HTML structure changes, check div balance and JavaScript syntax. Browser interactions must also pass.
- Final completion requires live HTTPS/iPad Safari testing by Chuck: native dictation, real AI interpretation, Sheet read-back, cross-device visibility. Distinguish implemented, locally tested, deployed, and iPad-verified.
- Cloud tasks are already isolated. Use the current checkout; do not create a worktree unless asked.
