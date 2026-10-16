# The Dojo test app — journal and connected sections

Live test address: https://cscourtney.github.io/The-Dojo/next/

The original root `The Dojo.html` is unchanged. Google Sheet Dojo_Master remains the source of truth across devices. Browser storage holds drafts, pending saves, and cached Sheet snapshots only.

## Input and journal structure

The user chose native keyboard dictation or typing. There is no app microphone recorder, audio upload, or transcription-service dependency. Dictate into **Your words**, choose **Organize my recap**, review, then save. Manual entry is available without using AI.

Journal fields retain the original structure: Date, Session type, Gi/No-gi, Lesson/Focus, Standup, Technique (detailed description), Rolls, Pearls, Fundamentals, Notes. Home drill and Technique session types show the relevant subset. Switching types retains hidden draft text for convenience, but irrelevant fields are not sent to Sheets.

- **New Technique** is an explicit checkbox. Name, position, and detailed description are required to create a library entry.
- **New Takedown** explicitly creates a takedown from its name and Standup description.
- Existing techniques/takedowns can be linked without creating another library record.
- A same-name/position entry already present in the library is reused even if New Technique is selected again. Matching ignores case/spacing and normalizes the old position aliases. This is not fuzzy matching of different technique names.
- **Link to Strategy Map** explicitly persists the selected map reference. There is no automatic map link from a position or from AI suggestions.
- AI only fills the prose/date/session fields. It cannot select library creation or map linking.

## Connected sections

- **Journal**: all loaded records, sorted by date; searchable, filterable by session type, with full details and links. Twelve shown initially; Show more reveals additional records.
- **Techniques**: reads the Sheet's `techniques` tab, groups historical instances by name/position, shows all their descriptions and linked sessions.
- **Pearls**: reads `pearls`; journal saves append applicable pearls and links lead back to the source session.
- **Fundamentals**: projects the existing `data.fundamentals` field. No new fundamentals tab or schema is introduced.
- **Strategy links**: groups the persisted `map_node` references and opens linked descriptions. This is a useful list of strategy links, NOT a rebuilt interactive map. The original interactive map remains a later phase.

Opening these sections does not request Google sign-in. Connect or Refresh reads the Sheet and refreshes the device cache. No training content is inserted as HTML.

## Verification and release status

- Comprehensive local Chromium integration checks use simulated Google/AI services; they never read or change the actual Sheet.
- Checks cover native text-input draft recovery, original journal fields/history, explicit library creation, repeated-technique reuse, cancelled toggles, map/pearl/fundamental cross-links, session types, reordered headers, interrupted subsidiary writes, retry without duplication in the tested scenario, Google-session renewal, bad AI responses, missing headers, mobile/tablet width, and legacy audio recovery.
- Six Worker unit checks use simulated identity/provider responses.
- The user previously confirmed the live page loads, Google connects, and AI parsing fills the review fields. The new journal/connected-section update still needs live save/read-back and iPad dictation verification.
- Cloudflare service and settings were deployed by the user. Worker address: `https://yhe-dojo-next.livingthesearch1.workers.dev`. Source/config are in `worker/` and are unchanged by this frontend update.
- Direct live-site/Worker checks from the development environment were blocked by its egress proxy. A successful Git push is not proof GitHub Pages has finished deploying; allow the Pages deployment to complete before checking the new version.

## Local development

From the repository root:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open `/next/` in a development browser. Google OAuth must authorize the exact origin for real sign-in; the existing production origin is `https://cscourtney.github.io`.

Run:

```sh
node tests/worker.test.mjs
node tests/sheet_headers.test.mjs
python tests/browser_smoke.py
```

The prepared environment has Node, Python Playwright, and `/usr/bin/chromium`. Browser process sandbox permission may be required in a restricted task. The previous microphone simulation is removed because recording is no longer part of the product flow.

## First real-use check

1. Refresh the live test page; the recording button should be gone and Journal / Techniques / Pearls / Fundamentals / Strategy links should appear.
2. Connect the correct Google account. Open a historical journal entry and verify all its fields.
3. Dictate a real recap using the keyboard microphone. Organize, review, and correct it.
4. If it introduces a new technique, explicitly select New Technique and supply its name/position. Otherwise link an existing technique if desired.
5. Save. Verify the journal, applicable technique/pearl rows, and Fundamentals view. Refresh on another device to verify cross-device access.
6. If linking a map reference, open Strategy links and confirm it leads to the intended description. No interactive map behavior is claimed.
7. For a failure use Settings → Copy diagnostics. Tokens and training content are excluded.

## Recovery and limitations

- The current header row drives every read and append. Blank headings are ignored during reads while physical column positions are retained. Harmless duplicate headings can be read; conflicting duplicate values report the exact heading and columns. Missing or duplicated required writable headings stop a save before any write. The app does not change Sheet schemas automatically.
- Original recap text is appended to `notes` with an `Original recap:` marker.
- Pending entry and subsidiary writes are completed only after read-back of every affected tab. IDs reconcile retries; pearls use `(entry_id, pearl)`.
- Google Sheets has no atomic unique constraint. Simultaneous creation/retry in multiple tabs/devices is not guaranteed duplicate-free. The local pending queue is device-specific.
- Pending saves from before explicit creation flags existed retain their old intended subsidiary writes. They are not silently discarded during this update.
- Any audio from the earlier prototype is retained under Settings → Earlier recording. It can be downloaded or explicitly deleted. New input never requests microphone permission from the app.
- Google tokens stay in memory. User actions request renewal when needed; Google may show a popup. This is not a persistent backend login across visits.
- Not yet implemented: interactive map, full-history AI Sensei, Class Prep, editing saved entries, or a service worker for cold-start offline access.
- Historical credentials in legacy root HTML files remain a separate security-cleanup task. No credentials were added to the new app.

## Cloudflare configuration (already completed by the user)

`worker/wrangler.toml` matches the Worker name `yhe-dojo-next`, model `claude-sonnet-4-6`, allowed Google account emails, and `AI_RATE_LIMITER` binding (10 requests per 60 seconds per account, with Cloudflare's per-location rate-limit semantics). `ANTHROPIC_API_KEY` is a Cloudflare secret; never place it in Git or chat. Authentication checks Google's verified email against the server-side allowlist. Origin checks are supplemental, not authentication. No Worker redeployment is required for this journal update.
