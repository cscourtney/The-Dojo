# The Dojo test app — training workspace

Live test address: https://cscourtney.github.io/The-Dojo/next/?v=5

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
- **Class Prep**: a sourced briefing built from active goals/mistakes, latest training, pearls, and fundamentals. One-tap native speech playback includes voice selection, Pause/Resume, Stop, and source links. Missing/cached sources are disclosed. No AI cost. It rebuilds from the latest loaded records when opened, including after journal saves.
- **Strategy links**: a pannable/zoomable read-only diagram adapted from the supplied standalone map's layout. Tapping a node opens descriptions from linked Sheet journal/technique rows. Historical aliases (gpass, side-top, back, etc.) map to the existing canonical IDs without changing stored cells. The diagram does NOT yet save edits or render the gameplan tab's arbitrary schema.
- **Resources**: reads the library tab; opens specific lessons/videos at saved timestamps. Bare-domain and invalid YouTube links show a correction notice instead of opening a homepage. No placeholder links are invented or deleted from the Sheet.
- **Search history**: keyword/relevance retrieval across all successfully interpreted workbook tabs, with source links and dates. It can find old entries and mistakes; it is explicitly NOT an AI interpretation. The generated readable tab is excluded from search to avoid duplicating the journal, but included in the notebook.
- **Notebook**: complete-workbook PDF and HTML exports generated privately in the browser. See below.

Opening these sections does not request Google sign-in. Connect/Refresh reads the core journal tabs; Refresh all sources reads every tab using Sheets metadata and batchGet, preserving original cells for export. This also updates the device cache. No training content is inserted as HTML.

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
node tests/insights.test.mjs
node tests/book_model.test.mjs
python tests/browser_smoke.py
python tests/workspace_smoke.py
```

The prepared environment has Node, Python Playwright, and `/usr/bin/chromium`. Browser process sandbox permission may be required in a restricted task. The previous microphone simulation is removed because recording is no longer part of the product flow.

## First real-use check

1. Refresh the live test page; the recording button should be gone and Journal / Techniques / Pearls / Fundamentals / Strategy links should appear.
2. Connect the correct Google account. Open a historical journal entry and verify all its fields.
3. Dictate a real recap using the keyboard microphone. Organize, review, and correct it.
4. If it introduces a new technique, explicitly select New Technique and supply its name/position. Otherwise link an existing technique if desired.
5. Save. Verify the journal, applicable technique/pearl rows, and Fundamentals view. Refresh on another device to verify cross-device access.
6. If linking a map reference, open Strategy links, select the matching node, and confirm the intended description. The read-only diagram is available; editing is not.
7. For a failure use Settings → Copy diagnostics. Tokens and training content are excluded.

## Recovery and limitations

- The current header row drives every read and append. Blank headings are ignored during reads while physical column positions are retained. Harmless duplicate headings can be read; conflicting duplicate values report the exact heading and columns. Missing or duplicated required writable headings stop a save before any write. The app does not change Sheet schemas automatically.
- Original recap text is appended to `notes` with an `Original recap:` marker.
- Pending entry and subsidiary writes are completed only after read-back of every affected tab. IDs reconcile retries; pearls use `(entry_id, pearl)`.
- Google Sheets has no atomic unique constraint. Simultaneous creation/retry in multiple tabs/devices is not guaranteed duplicate-free. The local pending queue is device-specific.
- Pending saves from before explicit creation flags existed retain their old intended subsidiary writes. They are not silently discarded during this update.
- Any audio from the earlier prototype is retained under Settings → Earlier recording. It can be downloaded or explicitly deleted. New input never requests microphone permission from the app.
- Google tokens stay in memory. User actions request renewal when needed; Google may show a popup. This is not a persistent backend login across visits.
- Not yet implemented: diagram node/edge editing/gameplan-layout sync, AI interpretation of full-history search, saved-entry editing, resource editing, or a service worker for cold-start offline access.
- Historical credentials in legacy root HTML files remain a separate security-cleanup task. No credentials were added to the new app.

## Cloudflare configuration (already completed by the user)

`worker/wrangler.toml` matches the Worker name `yhe-dojo-next`, model `claude-sonnet-4-6`, allowed Google account emails, and `AI_RATE_LIMITER` binding (10 requests per 60 seconds per account, with Cloudflare's per-location rate-limit semantics). `ANTHROPIC_API_KEY` is a Cloudflare secret; never place it in Git or chat. Authentication checks Google's verified email against the server-side allowlist. Origin checks are supplemental, not authentication. No Worker redeployment is required for this journal update.

## Notebook / digital book

Use **Notebook → Build my PDF notebook**. The button renews Google access if needed, finishes pending saves, reads a fresh complete workbook, and builds a PDF download locally. It does not depend on the AI Worker. PDF code and Unicode fonts load from this app's own origin only when needed.

- Each Sheet tab becomes a chapter; unrecognized/custom tabs are included too. Fundamentals also has a derived chapter, with the original column retained in Training Journal. Readable/generated tabs are included and labeled, so they may duplicate source material.
- The book includes all nonempty formatted data cells, including unnamed columns and repeated headings. It does not export Sheet formulas, formatting, cell comments, or Apps Script source. No data rows are silently omitted because the app cannot parse their headers.
- Searchable text, internal linked table of contents, PDF chapter bookmarks, a linked index, page numbers, and Letter-size print margins are provided. Index references point to entry start pages. Use the PDF viewer's Find function for full-text search.
- The **searchable HTML notebook** has chapter/index links, a built-in search box, and print styling. It remains a standalone local file.
- The approved notebook style uses Patrick Hand body text, Caveat headings, and subtle warm unlined paper. Every PDF page links back to Contents. Choose White background for printing before building either export to omit the paper texture. Downloaded HTML embeds its fonts for offline use.
- DejaVu Sans provides metadata and a fallback for characters outside the handwriting fonts. The embedded DejaVu font covers Latin accents and many Unicode symbols. Unsupported glyphs are represented as `[U+code]` rather than silently dropped. Source text is not editorially rewritten by AI.
- A partial cache cannot be exported as a complete book. Every export re-reads all tabs; a failed read blocks the export rather than presenting an incomplete snapshot as complete.
- The developer has no live user Sheet session here. The generated 16-page validation PDF is explicitly a test fixture, NOT the user's personal book. The user's actual book is produced when they click the live Notebook button while signed in.
- New verification checks PDF searchable content (including long entries and accented text), valid internal page targets, bookmarks, index, and text staying inside page bounds. It also checks the HTML search and phone/iPad layouts. All source data in those checks are test fixtures.
- PDF dependencies are pinned local vendor bundles (pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1); notices and font licenses are shipped beside them. No third-party PDF service receives the workbook.

## Remaining real-device checks

Class Prep playback, audio interruption/screen-off behavior, workbook API reads against the real Sheet, large real-book export performance, Safari downloads, and map touch navigation require actual iPad/phone verification. Do not describe Chromium viewport tests as iOS testing. Complex AI Sensei synthesis needs a new authenticated Worker operation and deployment; the current deployed Worker only parses workout recaps.

## Direct library additions and section recovery

- Techniques, Pearls, and Fundamentals each provide an Add button. Strategy links provides Add technique here and Link existing technique; select a map position first to prefill the map reference. New techniques append to `techniques`, direct pearls append to `pearls`, and fundamentals append to the existing `data.fundamentals` column as `entry_type=fundamental` reference notes. No fundamentals tab is created.
- Linking an existing technique to another map position appends a `data` reference row (`entry_type=reference`). It does not duplicate the technique or replace its original map link. Reference rows stay out of workout history and last-session Class Prep; they remain in notebook/search exports and appear as actual map links. Node positions and edges remain the supplied reference layout; this is not a diagram editor or `gameplan` layout sync.
- A direct pearl's `entry_id` is its stable `direct:` UUID; it is not presented as a workout hyperlink. Direct additions preserve local drafts and uncertain saves. Use Resume pending save to retry the same record. A confirmed duplicate technique is rejected before append and its draft becomes editable again. Google Sheets still has no atomic cross-device uniqueness guarantee.
- Writes read fresh headers, validate every populated supported field, build values by physical column, and confirm the result by read-back. Case, spaces, and known legacy names such as Technique Name / Pearls / Danaher Category are normalized in memory; headers and Sheet columns are never automatically changed. Ambiguous duplicate writable headings stop a save.
- Each source tab loads independently; a failed journal read does not block techniques or pearls. Read errors remain visible in the section, cached data is labeled, and shared section searches reset when navigating to another section.
- Existing named journal techniques and journal pearls are projected into their library views when missing from the subsidiary tabs, without writing inferred library records. Technique names and positions are used for matching; descriptions are not guessed from unstructured prose.
- Technique category buttons use actual `danaher_category` values from the Sheet, with Submissions, Self Defense, and Needs review. The supplied handoff says the historical 15-skills restructure was never committed and does not list the exact 15 labels; this release preserves stored categories rather than fabricating or reclassifying that taxonomy. If the category column is absent, additions stay unclassified and the form explains why. Adding a category requires that column already exist.
- `node tests/library.test.mjs` and `python tests/library_smoke.py` cover header aliases, journal fallback, category filtering, direct additions, interrupted-write reconciliation, duplicate prevention, missing-category-header protection, multiple map links, second-browser read-back, and phone/tablet form widths. All workbook data in tests are synthetic; actual Google Sheets and iPad Safari still require user verification.
