# FREAK Event POS — קופת הדוכן

The till the shop takes to conventions. Three parts, one workbook.

| Part | Where | Notes |
|---|---|---|
| Till (PWA) | `index.html`, `sw.js`, `manifest.webmanifest` → GitHub Pages https://epic-pita.github.io/freak-pos/ | Built from `main` of `Epic-pita/freak-pos`. **A push to `main` is a release to the team's phones.** Bump `BUILD` in index.html and `CACHE` in sw.js together. |
| Event report + Caspit-fix checklist | `report.html` (same site) | Linked from the till's start screen. Prints the checklist only. |
| Staff guide | `guide.html` (full, 12 sections) + `quickstart.html` (one page) + `guide/*.jpg` | Both linked from the start screen. The images are real screenshots with numbered markers — regenerate with `tools/test/make_guide_shots.py` after any screen change (staff name in the pictures: `STAFF` at the top of that script). |
| Stock count page | `count.html` | Separate backend ("FREAK Count API" script); untouched by this project. |
| Backend | `Code.gs` → Apps Script project "FREAK Event POS", bound to the workbook | `clasp push` updates HEAD only. The live address is a **versioned deployment**; after a push run `clasp redeploy <deploymentId> -d "..."` (or Deploy → Manage deployments → New version). `index.html` and `report.html` must point at that deployment's `/exec` URL. |
| Data | Google Sheet `FREAK_Event_POS` (the address is in `Code.gs` and `tools/pos-sync.ts`, which stay out of this public repo) | Owner: the shop Gmail account. |
| Morning catalog | `tools/pos-sync.ts` via Windows task **FREAK POS Catalog** (daily 06:30, `tools/pos-sync.cmd` through `pos-sync-hidden.vbs`) | Log: `tools/logs/<date>.log` + `last-run.txt`. Backups of the previous catalog: `tools/backup/` (last 10). |

## Workbook tabs

| Tab | Who writes | Columns |
|---|---|---|
| `קטלוג פריטים` | the morning job, every day | `קוד פריט · ברקוד · שם פריט · קטגוריה ראשית · מחיר לצרכן` — read **by header name**, so column order does not matter. One row per barcode (an item with two barcodes appears twice). |
| `עובדים` | by hand | `שם · פעיל · הערות`. `פעיל = לא` hides a name from the till. Seeded once from the ERP's active floor staff + names already used at the stall. |
| `אירועים` | by hand, before the event | `שם אירוע · התחלה · סיום · מקום · פעיל · הערות`. The till offers events from 3 days before `התחלה` to the day after `סיום`; when none is current it offers the upcoming ones. `פעיל = לא` hides an event. |
| `Sales`, `Sale_Lines` | the till | **Column order is a contract** — the inventory sheet (`FREAK_Inventory_Live`) reads both tabs by position every hour. Never reorder. |
| `תיקוני_כספיט` | the report page | one row per item ticked as keyed into Caspit: `event · item_key · item_id · barcode · name · qty · done_by · done_at`. Unticking deletes the row. |
| `Returns`, `Return_Lines` | the report page | one return or cancellation per row, linked to its sale by `sale_id`; `cancelled_at` marks one that was undone. Never edited by hand. |
| `Tender_Changes` | the report page | what a sale's tender was before it was changed, who changed it and when. The sale row itself carries the current tender. |
| `Live Dashboard` | formulas | untouched. **It does not know about returns** — the report page is the net figure. |

## Which items reach the phones

Everything Caspit still lists: an item with a stock snapshot in the ERP in the last 3 days, or an active item with a barcode or a price. Rows with no barcode and no price (register plumbing) are left out. Names, categories and prices are the ERP's daily copy of Caspit. Safety: the job refuses to write fewer than 3,000 rows or fewer than 70 % of the previous count, backs the old tab up first, and writes the whole tab in one request.

Run by hand (dry run first):

```
node "D:\Deasktop\FREAK TLV ERP\inventory\node_modules\tsx\dist\cli.mjs" tools\pos-sync.ts catalog --dry
node "D:\Deasktop\FREAK TLV ERP\inventory\node_modules\tsx\dist\cli.mjs" tools\pos-sync.ts catalog
```

`tools\pos-sync.ts seed` creates the three hand-kept tabs if missing and seeds them only when empty.

## API (Apps Script)

`GET ?token=…&action=` `catalog` (rows + staff + events) · `ping` · `events` · `staff` · `report&event=` · `fixes&event=`
`POST` text/plain JSON `{token, action:'commit', sales:[…]}` or `{token, action:'fix_tick', event, item_key, item_id, barcode, name, qty, done, by}`

The token in `Code.gs`, `index.html` and `report.html` must match. It filters crawlers; it is not authentication (the page is public).

## History

- 2026-07-15 v4: till moved off Apps Script HtmlService (camera), service worker, split tender, idempotent queue.
- 2026-09-06: catalog tab re-pasted with `שם` and `ברקוד` swapped → the till showed codes instead of names until v5.
- 2026-09-27 v5: catalog columns by header name; daily catalog from the ERP; staff and event pickers; search by item code; `report.html` (event summary per day/hour, top items, categories, staff) with the Caspit-fix checklist; report fills unreadable sold names from today's catalog.
- 2026-09-28 v6 (camera): one-tap `החלף מצלמה` with friendly names (back cameras first), list rebuilt after permission so the picker shows on the first open, remembered lens with a safe fallback when it vanished, continuous autofocus, the phone's built-in barcode detector where it exists, restart after the phone was locked, clear Hebrew messages for blocked/busy/missing camera, scan flash + vibration, and a `פרטי מצלמה` support line with copy. Tests: `tools/test/scan_test.py` (fake camera showing an EAN-13 → item sheet) and `tools/test/switch_test.py` (two cameras, denied permission), run with the caspit-scraper venv's Python.
- 2026-09-28 v7: built-in staff guide (`guide.html`, 12 sections, annotated screenshots generated from the app); report tables scroll inside their cards on phones.
- 2026-09-28 v8: quick-start page; guide pictures redone (Chris as the staff name, real barcode in the camera picture, markers on the empty top-left corner and clamped to the frame, tighter crops).
- 2026-09-30 (during ICON, till untouched): report page shows one day or the whole event from one sale list (`salesList` in `?action=report`, backend deployment version 6), sale-by-sale list with seller filter, money sold below list price, checklist rows reopen when a ticked item sells again. Rollout rule for the backend: `clasp push` → `clasp deploy` to a separate TEST deployment → verify → `clasp redeploy <live id> -V <n>` → `clasp undeploy <test id>`. Test: `tools/test/report_test.py [test-deployment-id]`.
- 2026-09-30 evening: report page made tolerant of a slow Apps Script backend (measured: 1–5 s usually, 20–110 s now and then, with 0–4 s of our own work; an empty ping waited up to 40 s). One request instead of two, last report kept in the browser and drawn at once, three patient tries, plain-language status. Average discount per day / event / seller. Backend version 8: `ms` server timing in replies, catalog rows cached 10 min (`flush_cache` called by the morning job), workbook opened once per request, `report` without `event` picks today's event, `with_events=1` adds the lists.
- 2026-10-02 v9/v10: corrections. `report.html` has a `תיקון` button on every sale (any event, any date): change of tender (total kept, old tender logged), return (lines and quantities, refund by cash / card on the terminal / other with a note, back on the shelf or not, dated now or retroactively), cancellation of a whole sale, undo of a return. Nothing is deleted. All report numbers are net: a return counts on the day it was processed, the original seller loses the revenue, a fully returned sale is not counted, a unit back on the shelf leaves the Caspit list. Every write is repeat-safe (one id per return form) and retried on a stalled reply, including a false `BAD_TOKEN` when Google re-dispatches a POST as a bare GET. The till links to that screen and now retries its catalog (8/20/45/60 s) so new events and staff reach a phone even when Google is slow. Backend version 9. Tests: `tools/test/fix_test.py [test-deployment-id]` (needs the test event; see its header), `apply_icon_fixes.py` records how the two ICON corrections were made.
