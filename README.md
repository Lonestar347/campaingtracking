# Campaign Tracker

Visual team tool for planning, organising and tracking marketing campaigns
(dashboard → campaign → funnel stage → channel → asset). Project brief: see `CLAUDE.md`.

## Setup

Requirement: Node.js 20+.

```bash
npm install            # installs dependencies and generates the Prisma client
cp .env.example .env   # local settings (SQLite file, storage, dev user)
npm run db:push        # creates the database schema (SQLite: prisma/dev.db)
npm run db:seed        # loads master data + 3 fictional sample campaigns (wipes existing data)
npm run dev            # http://localhost:3000
```

More commands:

| Command | Purpose |
| --- | --- |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:reset` | Wipe the database, recreate the schema, load the seed |
| `npm run db:studio` | Prisma Studio (browse data in the browser) |

> **Upgrading from a German version of the app:** stored status values and labels were renamed
> (e.g. `IDEE` → `IDEA`). Run `npm run db:reset` once to recreate the local database.

## Structure

```
prisma/
  schema.prisma          data model (SQLite locally, Postgres-compatible)
  seed.ts                master data, demo users, sample campaigns
src/
  app/                   Next.js App Router (pages)
    page.tsx             dashboard (stats, filters, campaign cards, critical section)
    compare/             compare campaigns side by side (?c=slug-a,slug-b)
    campaigns/new        launch charter wizard (new campaign)
    campaigns/[slug]     mind map (core view), funnel, charter and performance views, edit charter
    campaigns/actions.ts         server actions: create campaign from charter, versioned charter edits
    campaigns/entity-actions.ts  server actions: create/update/delete channels and assets, set status
    campaigns/link-actions.ts    server actions: create/update/delete links on campaign/channel/asset
    campaigns/import-actions.ts  server actions: analyse report, check/import, delete
    api/reports/[id]/file        download of a report's original file
  components/            UI components (shadcn/ui conventions, components.json)
    ui/                  base components (Button, Input, Select, Field …)
    charter/             wizard and its steps
    dashboard/           filter bar, campaign card, comparison selection, critical list
    kpi-import/          import wizard, target achievement chart, delete report
    links/               link management (list, form, preview image) and type icons
    mindmap/             React Flow mind map, nodes, detail panel, channel/asset forms
  lib/
    config.ts            central thresholds (e.g. "due within 7 days"), time zone, locale
    dates.ts             day comparison in Europe/Berlin, formatting DD/MM/YYYY / EUR
    domain/              fixed value sets (funnel stages, statuses, roles …) and channel types
    status/              derived status logic (progress, traffic light, phase, rollup) + tests
    validation/          Zod schemas (charter data, KPI targets, markets …), shared field schemas
    charter/             wizard form (Zod), creating campaign/channels/assets from the charter + tests
    dashboard/           filters (URL parameters), sorting, critical lists, stats, timeline + tests
    entities/            channel/asset forms (Zod), change detection for the activity log + tests
    mindmap/             graph building with status rollup and tree layout + tests
    kpi-import/          report import: table detection, numbers/dates, mapping, target vs. actual + tests;
                         parse-file.ts reads .xlsx (exceljs) and .csv (papaparse) – server only
    links.ts             link type detection, Looker Studio embed URL, link form + tests
    format.ts            number input, cent conversion, slugs, date fields
    queries.ts           data access for the pages
    auth/                auth abstraction (today: dev user, later Auth.js + Entra ID)
    storage/             storage abstraction (today: local file system)
    db.ts                Prisma client
```

## Design decisions

- **Language and formats:** UI in English (British). Dates as DD/MM/YYYY, amounts as `€12,345.00`,
  numbers typed as `25,000` / `1,500.50`. The locale is set in one place (`src/lib/config.ts`).
- **Postgres compatibility:** fixed value sets (funnel stage, asset status, role, link type …) are
  stored as strings and validated with Zod (SQLite has no enums in Prisma). Lists and key/value
  data (markets, partners, KPI targets, charter content) are `Json`. Amounts are integer cents (EUR).
- **Derived status is never stored**, it is computed in `src/lib/status`:
  - Progress = assets in `DONE`/`LIVE` ÷ all assets; `CANCELLED` does not count.
  - Traffic light **red**: an asset is overdue (due before today) and not done; `PAUSED` counts as
    not done, `CANCELLED` is ignored.
  - Traffic light **yellow**: an asset is due today or within the next 7 days and not yet in
    `APPROVAL` or later.
  - Phase: `Completed` after the end date; `Live` from the start date or as soon as an asset is live;
    `In progress` once an asset has moved beyond `IDEA`; otherwise `Planning`.
  - "Today" and due dates are compared as calendar days in Europe/Berlin.
- **Launch charter** is versioned: `LaunchCharter.data` holds the current state, every change also
  writes an immutable `LaunchCharterVersion`.
- **Launch charter → campaign:** on creation, `buildCampaignPlan` (tested) turns the charter into the
  campaign, channels (with KPI targets and, if changed, funnel stage), assets (status `IDEA`) and
  links – all in one transaction, plus an activity log entry. The basics (name, period, markets …)
  are also stored as a snapshot in every charter version.
- **Editing the charter** changes basics, strategy, budget, links and stakeholders and creates a new
  version (with an optional change note; the history shows the changed sections). Channels and
  assets are managed in the mind map.
- An unsaved wizard draft is kept in the browser (localStorage) and can be restored.
- **Mind map layout:** own, tested tree layout (`src/lib/mindmap/graph.ts`) instead of dagre/elk –
  the structure is a fixed four levels (campaign → stage → channel → asset), so the arrangement stays
  stable and predictable: tree from left to right, funnel stages from top to bottom, each node
  centred on its children. Nodes cannot be dragged.
- **Dashboard filters** live in the URL (e.g. `/?market=DE,AT&phase=LIVE&status=RED&sort=urgency`),
  so filtered views can be shared as links. Market: the campaign runs in at least one of the
  selected markets. Period: the campaign period overlaps the selected period. Stats and the critical
  section refer to the filtered campaigns.
- **Links:** the type is detected from the URL (`*.frontify.com`, `*.sharepoint.com`,
  `lookerstudio.google.com`) but can be overridden. Icons are neutral symbols, not vendor logos.
  Preview images are optional image URLs. Looker Studio links with `Link.embed = true` are embedded
  in the performance tab via iframe (`…/reporting/<id>` → `…/embed/reporting/<id>`); whether that
  works depends on the report's sharing settings in Looker Studio, so the link to open it is always
  shown next to it.
- **Report import:** upload → analysis (sheet, header row below title rows, total rows skipped,
  number format detected) → mapping → check (dry run, nothing is saved) → import. Two table
  layouts: "wide" (one column per KPI) and "long" (KPI + value columns). Channel names from the file
  are matched against channel name/type; unknown names are mapped once and the mapping is saved
  with the source. Saved mappings are recognised on the next upload by their columns. Errors
  (missing columns, invalid numbers/dates) come with row numbers and block the import.
  English **and** German reports are understood (column names such as "Datum"/"Kanal", number
  formats `1,234.5` and `1.234,5`, Windows-1252 CSV exports).
  The original file is kept in storage (`storage/uploads/reports/<campaign>/…`).
  Libraries: exceljs + papaparse instead of SheetJS – the npm package `xlsx` is outdated (0.18.5,
  known vulnerability when parsing files), current SheetJS versions are only available from their
  CDN. Legacy `.xls` files are therefore not supported (save as `.xlsx`).
- **Target vs. actual:** actuals from all reports of a channel: counts are summed, rates and averages
  (%, CTR, CPM, ROAS, time on page …) are averaged. For cost KPIs (CPM, CPC, CPA …) lower is better
  and achievement is target ÷ actual. KPI names are matched case-insensitively. If reports overlap
  (same source and period), the import warns about values being counted twice.
- **Activity log:** creating, updating (with the changed fields), moving, deleting and status changes
  (`status_changed` with from/to) of channels and assets are logged, as are link changes
  (`link_added`, `link_updated`, `link_removed`) on the respective object.
- **Links** are attached to campaign, channel or asset via real foreign keys (cascade delete).
  **Comments** and the **activity log** attach generically to any object via `entityType` + `entityId`.
- **Colours:** Josera Gold/Ruby only as UI accents. Traffic light colours are separate tokens
  (`status-red/yellow/green`); Ruby is never used as an error red. Each funnel stage has a calm
  colour (`stage-awareness/consideration/sales`), validated for colour-vision deficiencies, contrast
  and chroma in light and dark mode. Light/dark mode follows the system setting.

## Status

### Phase 1 – Foundation ✅

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4, shadcn/ui base (`components.json`, `cn`)
- Prisma schema with all entities from the brief (User, Campaign, LaunchCharter incl. versions,
  ChannelType, Channel, Asset, Link, KpiReport, KpiValue, KpiImportMapping, Comment, ActivityLog)
- Seed: 16 channel types with default funnel stage, 6 demo users (all roles), 3 fictional campaigns
  that together cover all traffic light and phase states (dates relative to the seed date)
- Tested status and rollup logic (Vitest), central thresholds in `src/lib/config.ts`
- Auth and storage abstractions as swappable layers

### Phase 2 – Launch charter ✅

- Wizard `/campaigns/new` with 7 steps + review: basics, strategy, budget (incl. split by funnel
  stage), channels (grouped by funnel stage, KPI targets, changeable stage, duplicate e.g. per
  market), assets, links, stakeholders/approval process
- Validation per step; the server validates again (incl. permissions and existing users/channel types)
- Automatic creation of campaign, channels, assets, links and charter version 1
- Charter view: readable, printable summary (sections 1–7) with version history
- Edit charter → new version, changes to the campaign record and charter links
- Draft restore, warning when leaving with unsaved changes

### Phase 3 – Mind map ✅

- `/campaigns/[slug]` shows the mind map (React Flow): campaign → Awareness / Consideration /
  Sales → channels → assets; edges in the funnel stage colour
- Nodes coloured by status: campaign, stages and channels with traffic light and progress (x/y),
  assets by asset status, overdue assets outlined in red, due-soon ones marked in orange
- Zoom, pan, "Fit view", collapsing stages and channels (remembered per campaign in the browser),
  "Expand all" / "Collapse assets", legend
- Detail panel on click: campaign (stages, overdue assets, links), stage (channels), channel (edit
  incl. moving stage and KPI targets, delete, assets), asset (quick status, edit, delete, links);
  navigation between levels in the panel
- "+" on a stage or channel creates a channel or asset directly
- Deep links: `/campaigns/<slug>?asset=<id>` or `?channel=<id>` opens the item (expanding its branch)
- Viewers see everything but cannot change anything; server actions check permissions as well
- The column view is the "Funnel" tab

### Phase 4 – Dashboard ✅

- Stats: campaigns, live, critical (red), overdue and due-soon assets
- Filters: search (name/brand/product line), market, phase, status (multi-select), brand, product
  line, owner, execution, period; sort by start, end, urgency or name; "Reset filters"
- Campaign cards with traffic light, phase, period, progress, market badges, funnel rollup and open
  deadlines; click opens the mind map
- "Critical" section with tabs "Overdue" / "Due soon" across all (filtered) campaigns; each entry
  jumps straight to the asset in the mind map
- Comparison: select up to 4 campaigns via "Compare" → `/compare` with a shared timeline (incl.
  today marker) and side-by-side key facts, budget per stage, progress and traffic light per funnel
  stage, overdue/due-soon assets

### Phase 5 – Links & integrations ✅

- Create, edit and remove links on campaigns, channels and assets in the mind map detail panel
  (URL, detected or chosen type, label, optional preview image)
- Display with type icon or preview image; link count on channel and asset nodes
- "Performance" tab: Looker Studio reports of the campaign and its channels, embedded if enabled,
  with a hint and link as fallback
- Looker links from the launch charter are marked for embedding automatically

### Phase 6 – Excel import ✅

- Import wizard under Performance → "Import report": Excel (.xlsx) or CSV up to 10 MB, sheet
  selection, preview with marked columns, source, reporting period (suggested from the date column),
  channel column or default channel, wide or long layout, KPI name per column (suggestions from the
  KPI targets), number format
- Check with clear error messages (row + column) and a summary per channel/KPI; map unknown channel
  names directly; warnings (total rows, values outside the period, possible double import)
- Save the mapping per source and recognise recurring reports automatically
- The original file is stored and can be downloaded from the report list; reports can be deleted
- Performance tab: target vs. actual per channel/KPI (sum or average, achievement), chart "Target
  achievement per KPI" (Recharts, shared % axis, colour = funnel stage), values without a channel
- Fictional sample reports for trying it out in `docs/sample-reports/`

### English UI ✅

- The whole app is in English: texts, error messages, URLs (`/campaigns/…`, `/compare`, filter
  parameters), stored status values (`IDEA`, `IN_PRODUCTION`, `APPROVAL`, `DONE` …), seed data and
  sample reports. The report import still understands German reports.

### Next

Phase 7 – Team features: comments, activity log, roles.
