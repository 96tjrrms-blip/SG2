# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step. Open `index.html` directly in a browser, or serve locally:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Architecture

Pure vanilla JS/HTML/CSS frontend backed by Supabase. No framework, no bundler, no package.json.

**File layout:**
- `index.html` — SPA shell with four page divs (`#page-dashboard`, `#page-field`, `#page-alarm`, `#page-regulation`) and a sidebar nav
- `supabase.js` — Supabase client init, DB constants (`SITE_NAMES`, `DEFAULT_PROCESS`, `DEFAULT_SAFETY`), hardcoded `REGULATIONS` array (local data, no DB call), and all async DB API functions
- `app.js` — All UI logic: navigation, rendering, state (`currentSite`, `currentItemId`, `siteMap`, `fieldCache`), and event handlers
- `style.css` — All styles

**Supabase schema (4 tables):**
- `sites` — fixed rows for 115정거장, 15환기구, 16환기구
- `field_items` — one row per pipe/valve item per site; columns: `item_name`, `category`, `spec`, `due_date`, `memo`, `status`, `process_checked`, `safety_checked`, `site_id`
- `checklist_items` — child rows of `field_items`; `type` is `'process'` | `'safety'` | `'custom'`; `checked` boolean
- `sms_logs` — audit log of SMS sends with `field_item_id`, `phone`, `message`, `sent_at`

**State and caching:**
- `siteMap` is loaded once at `DOMContentLoaded` via `getSiteMap()` and maps site name → DB id
- `fieldCache[siteId]` caches field items with their nested checklist_items; call `invalidateCache(siteId)` after any write before re-rendering
- New `field_items` rows get default checklist items seeded lazily in `renderChecklist()` when `checklist_items` is empty

**Key flows:**
- Field table row click → `selectItem()` → `renderChecklist()` opens the side panel
- Panel save → `savePanel()` derives `status` from progress % and due date, then upserts `field_items`
- SMS send uses the device native `sms:` URI scheme; logs the send to `sms_logs`
- Dashboard progress is calculated from `checklist_items.checked` counts, not from the `status` column
