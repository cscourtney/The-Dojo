# GOOGLE_SHEET.md — the data layer

The Google Sheet is the single source of truth for everything Chuck records. The app reads it, writes to it, and mirrors it locally. Chuck also edits it by hand. Treat it as a database whose user sometimes walks in and rearranges the furniture.

## 1. Identity and access

| Item | Value |
|---|---|
| Name | Dojo_Master |
| Sheet ID | `11qPTV7nS28ZdK0Yd1kTAZVMot30lLA9024N1JeYlgwc` |
| URL | https://docs.google.com/spreadsheets/d/11qPTV7nS28ZdK0Yd1kTAZVMot30lLA9024N1JeYlgwc/edit |
| Owner | livingthesearch1@gmail.com |
| Shared to (editor) | cscourtneymd@gmail.com — the account that owns the OAuth app |
| GCP project | `the-dojo-500602` (under cscourtneymd@gmail.com) |
| OAuth client ID | `766609056854-bdk65cprg46q2sni85pr2kges9u18mfl.apps.googleusercontent.com` (public by design; safe in client code) |
| Scope | `https://www.googleapis.com/auth/spreadsheets` |
| OAuth publishing status | Production (switched July 2026; Testing forces re-consent every 7 days) |
| Authorized JavaScript origin | `https://cscourtney.github.io` (add `http://localhost:<port>` for local dev on the Mac mini) |

An older sheet, `1WS_96zDuWp-t4j3PdbCLvXs5DQet8rtbFdjrQvuXgno` ("The Dojo Journal"), is **retired**. Don't use it.

**Do not put the OAuth client secret anywhere.** The browser token flow doesn't use it.

## 2. Rules every reader/writer must follow

1. **Row 1 of every tab is the header row.** Read by header name (`rowsAsObjects(headers, rows)`), never by column index. Chuck re-sorts and reorders columns by hand.
2. **Never trust row order.** Sort by `date` (then `created_at`) in code.
3. **Append, don't overwrite.** New rows via `values/{tab}!A:Z:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`. Edits locate the row by `id` (search the column whose header is `id`), never by a cached row number.
4. **Writes still go by column order** (the append API is positional). So the write code must build the row from the tab's *current* header row, not a hardcoded array. Recommended helper: read headers once per session (they're in the mirror), then `buildRow(tab, obj) => headers.map(h => obj[h] ?? '')`. This is the fix that makes rule 1 true for writes as well as reads. Currently writes are hardcoded arrays (see per-tab notes).
5. **After any write, refresh that tab's mirror** (`refreshMirrorTab(tab)`). Full refresh every 5 min while online, on the `online` event, and before Sensei's first reply.
6. **Apps Script `onEdit` never fires on API writes.** Anything derived (techniques, pearls rows from a journal entry) the app writes itself, in the same save.
7. Dates are ISO `YYYY-MM-DD`. `created_at` is a full ISO timestamp. Store `id` as text.

## 3. Tabs (as of Oct 2026)

Column order below is what the live code currently writes. Header names marked † are inferred from the code — **confirm against the Sheet's real row 1 before relying on them**, and update this file.

### `data` — the journal (one row per session)
Written by the journal form and Log Your Workout. Code range is `data!A:M` but rows have **17 columns** → fix to `data!A:Q` (HANDOFF P0-6).

| Col | Header | Content |
|---|---|---|
| A | id | unique id (timestamp-based) |
| B | date | YYYY-MM-DD of the training session |
| C | entry_type | `class` / `drill` (home drill) / `technique` (single technique) |
| D | gi | `gi` / `nogi` |
| E | lesson | session theme |
| F | standup | takedown/standup notes |
| G | technique | technique(s) drilled, described |
| H | rolls | live rolling notes (partners, positions, what happened) |
| I | drillwork | home drill notes |
| J | pearls | one or more insights, one per line |
| K | fundamentals | core principles noted (the Fundamentals page filters on this — there is **no** separate fundamentals tab, by design) |
| L | notes | anything else |
| M | created_at | ISO timestamp |
| N | position † | position page key (e.g. `butterfly`, `back`) |
| O | technique_label † | short name for the technique → triggers a `techniques` row |
| P | takedown_label † | short name for the takedown → triggers a `techniques` row with position `takedowns` |
| Q | map_node † | game plan map node this relates to |
| — | danaher_category † | added by the July "Reclassify" Apps Script; may or may not exist — check |

### `techniques` — technique library (one row per technique instance)
Auto-written on journal save when `technique_label` or `takedown_label` is filled. Range `techniques!A:H`.

| Col | Header † | Content |
|---|---|---|
| A | label | technique name |
| B | position | position key (`takedowns` for takedowns) |
| C | map_node | game plan node |
| D | description | the technique / standup text from the entry |
| E | date | session date |
| F | gi | gi / nogi |
| G | id | `{entry_id}_tech` or `{entry_id}_td` (links back to `data`) |
| H | created_at | ISO timestamp |
| — | danaher_category † | possibly added by Reclassify script |

Position pages' "From Your Training" sections read from this tab.

### `pearls` — one row per pearl
Auto-written on journal save: the `pearls` field is split on newlines, numbering stripped, one row each. Range `pearls!A:E`.

| A date | B gi | C pearl | D entry_id | E created_at |
|---|---|---|---|---|

### `mistakes` — mistake audit
Written by the Mistakes page form. Range `mistakes!A:E`.

| A mistake | B position | C fix | D notes | E date |
|---|---|---|---|---|

Recommended additions: `id`, `status` (active/fixed), `principle`.

### `goals`
Written by the Goals page. Range `goals!A:E`.

| A goal | B priority (`30-day` / `90-day` / `long-term`) | C target (date) | D notes | E status (`active` / `done`) |
|---|---|---|---|---|

Recommended addition: `id` (status updates currently have no reliable row key).

### `library` — resource library
Currently written as a **backup only**; the Library page reads browser localStorage and never reads this tab (HANDOFF P0-5). Current range `library!A:E`:

| A title | B type | C url | D notes | E tags (comma-separated) |
|---|---|---|---|---|

`type` codes: `gu` Gracie University, `vid` video, `art` article, `doc` document, `upl` upload.

**Target schema (P0-5)** — make this the source of truth:

| Header | Content |
|---|---|
| id | unique id |
| title | |
| type | gu / vid / art / doc / upl / own (Chuck's own training video) |
| url | **exact** page — specific video or lesson, never a bare domain |
| start_seconds | optional; YouTube opens at this point |
| source | YouTube channel / instructor / Gracie University / BJJ Fanatics … |
| techniques | technique labels this covers (comma-separated) — links library to journal |
| principles | 32-Principles numbers it relates to (comma-separated) |
| tags | free tags |
| notes | why it matters / what to watch for |
| added | YYYY-MM-DD |

Validation on save: reject or warn when `url` is only a domain (`^https?://[^/]+/?$`), or a YouTube URL without a video id.

### `chains` — chains & sequences
Read-only from the app (mirror → Sensei context, Chains page). Chuck maintains by hand. Confirm headers.

### `gameplan` — game plan map
Read by mirror for Sensei context. Intended to back the interactive Game Plan Map (nodes, connections, pearls per node) once it's re-merged (HANDOFF P2-5). Confirm headers before building.

### `privates` — private lesson notes (with Dan and others)
Read-only from the app (mirror). Confirm headers.

### `readable` — human-readable formatted journal
Generated from `data` by Apps Script ("v3", installed July 2026). The app never writes here. Because onEdit doesn't fire on API writes, the script needs a **time-driven trigger** (e.g. every 15 min) or a "Rebuild" menu item.

### Recommended new tab: `principles`
For the 32 Principles framework (HANDOFF P3).

| number | name | chuck_notes | applies_to_positions | linked_pearls | linked_mistakes | resource_url |
|---|---|---|---|---|---|---|

Chuck writes `chuck_notes` himself (the source material is behind his Gracie University login and is copyrighted).

## 4. Apps Scripts living in the Sheet

Bound to the Sheet (Extensions → Apps Script). Their source is **not** in the repo — copy it in (`/apps-script/*.gs`) so it's version-controlled.
- **v3 setup/sync script** — creates subsidiary tabs and formats `readable`. `setup()` may hit Google's 6-minute limit on big batches; tabs still get created.
- **Reclassify script** — added `danaher_category` to `techniques` and `data`.
- `createTrigger()` requires clicking OK on a dialog that appears in the Sheet itself, or the trigger isn't registered.

## 5. Mirror (IndexedDB)

- DB `DojoJournalBackup`, store `mirror` (schema v2), one record per tab: `{ tab, headers, rows, syncedAt }`.
- Tabs mirrored: `data, techniques, pearls, mistakes, goals, library, chains, gameplan, privates, readable` (`MIRROR_TABS`). Add `principles` when created.
- Each refresh **replaces** the whole tab snapshot. That's why hand edits and re-sorts can't corrupt it.
- Offline: journal saves queue locally and replay on reconnect, including their techniques/pearls sub-writes.

## 6. Setting it up from scratch (if ever needed)

1. Create a Sheet; add the tabs above with header rows exactly as listed.
2. Share it with the Google account that owns the OAuth client (editor).
3. GCP → APIs & Services → enable Google Sheets API → OAuth consent screen (External, Production) → Credentials → OAuth client ID (Web) → add authorized JS origins.
4. Put the Sheet ID and client ID in the app's config constants (`GS_SHEET_ID`, `GS_CLIENT_ID`).
5. Open the app on the https URL, sign in with the right Google account, save a test entry, confirm it lands in `data`, `techniques`, `pearls`.
