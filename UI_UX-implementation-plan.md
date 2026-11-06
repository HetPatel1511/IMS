# IMS UI Redesign — Design & Implementation Plan

> **Stance:** the current UI is a mockup. A **complete visual redesign is in scope** — new design language, layout, components, and styling are all acceptable. The one hard rule is that **functionality must not change**: every route, API call, parameter, permission, piece of state, and interaction behaviour must survive the redesign unchanged.
> **Scope of issues addressed:** everything in `UI_UX-roast-review.md` (Critical / Fixable / Improvement + Per-Page UI Notes). A redesign resolves most of these implicitly; this plan still lists each one so none is lost in the rebuild.
> Target: `apps/web` (React 19 + Vite). Date: 2026-11-06.

---

## 1. Overview

The goal is to replace the current look with a cohesive, accessible, responsive design system while keeping the application's behaviour byte-for-byte equivalent from the user's and the API's point of view. Because the UI is a mockup, we are not constrained to the existing sage/cream + serif + pill language — we can adopt a new one. We **are** constrained by the functional contract in §2: the redesign is a re-skin and re-layout, not a re-architecture of data flow.

Three principles:
- **Functionality is the invariant.** Pages keep their routes, data queries, mutations, validation, permissions, deep-links, and local state. UI work changes presentation and interaction affordances only.
- **Design once, apply everywhere.** Introduce a small component library (buttons, inputs, table/cards, modal, toast, empty/loading states, nav) and build every page from it, so consistency is structural rather than per-page discipline.
- **Fix the roast issues by construction.** The redesign's components bake in the accessibility and consistency fixes (keyboard-operable sorting, honest sort, reachable actions at every width, one required-field convention, sane action hierarchy) so they can't regress page-by-page.

**Roles**
- **FE** — Frontend engineer (React/CSS). **API** — Backend engineer (only to confirm existing contracts, not to change them). **Design** — UI/UX designer (owns the new design system). **QA** — Tester (functional parity + cross-viewport + accessibility).

---

## 2. Functional Contract — MUST be preserved

The redesign must keep all of the following identical. QA signs off against this list.

**Routing & navigation**
- Routes: `/` (Dashboard), `/login`, `/inventory-types`, `/inventory-types/:id` (schema builder), `/items`, `/stock`, `/suppliers`, `/buyers`, `/settings`, `/audit`.
- Auth redirect: unauthenticated → `/login`; authenticated hitting `/login` → `/`.
- Breadcrumb/title logic and the dashboard deep-links (stat cards link to their pages) keep working.

**Auth, roles & session state**
- Session restored from `localStorage` key `ims_user`; access token fetched asynchronously after restore (settings query must stay gated on both `user` and `token`).
- Role gating via `hasMinRole(role, 'ADMIN')`: ADMIN/SUPER_ADMIN can write; VIEWER is read-only (no Add/Edit/Delete/Save controls rendered).
- Logout behaviour unchanged.

**Persistent UI state keys** (keep the keys, even if the control looks different)
- `ims_theme` (auto / light / dark), `ims_sidebar_rail` (desktop collapse). Dark/light support must remain, including `prefers-color-scheme`.

**Data layer (react-query + API envelope `{data, meta, error}`)**
- All existing endpoints and query params stay: pagination `page` / `pageSize`; search `q`; sort `sort=<key>:<dir>`; list filters on Stock (`type`, `inventoryTypeId`, `inventoryItemId`, `supplierId`, `buyerId`, `quantity`, `quantityMin`, `quantityMax`, `q`); low-stock filter `belowReorder=1`.
- Query-key structure and cache-invalidation on mutations stay (items/dashboard/settings/stock-transactions/suppliers/buyers).

**Per-screen behaviours**
- **Items:** per-type dynamic schema fields; attribute defaults seeding; client-side required validation mapping API `details[].path` to inline field errors; CSV export (pages through `pageSize=100`); movement-history drawer with "Load more"; unsaved-changes discard guard; Escape/backdrop close.
- **Stock:** Buy/Sell/Adjust mutations and their payload shapes; deep-link `/stock?buy=<itemId>` preselects the item in Buy; filter chips synced to URL `searchParams`; server-side sort already in place.
- **Inventory Types / Schema:** type CRUD; field CRUD with drag-reorder order; flags (required/unique/options).
- **Settings:** save payload `{key:'org', value:{name, defaultUnit, locale}}`; "All settings" listing.
- **Audit:** segmented action filter, type filter, search.
- **Global:** toasts (success/error/info), confirm dialog, focus trap + return-focus in modals, skeleton loaders, Escape-to-close, skip link.

> Rule of thumb: if a change alters a network request, a stored key, a validation outcome, a permission check, or a deep-link, it is **out of scope** for this redesign.

---

## 3. List of Issues to Resolve (from the review)

Grouped by how the redesign handles them. All trace to `UI_UX-roast-review.md`.

### Group A — Resolved by the new component system (Critical + consistency)
- **A1. Honest sorting** — list sorting spans the dataset via the existing `sort` param (Stock already does this; Items/Parties adopt it).
- **A2. Keyboard-operable sorting** — the new table/sort-header component is a real focusable control with `aria-sort`.
- **A3. Mobile nav focus** — the redesigned nav removes closed off-canvas items from the tab order and a11y tree.
- **A4. Reachable actions at every width** — the new table/record component never hides row actions between mobile and desktop.
- **A5. One table/record pattern** — replaces the duplicated table + two sort-header + two modal implementations.
- **A6. Required-field convention, action hierarchy, numeric alignment, selection highlight** — defined once in the design system (covers review items: missing `--accent-soft`, unmarked SKU/Name, left-aligned numbers, Delete over-emphasis).

### Group B — Carried into the redesign explicitly
- **B1.** Label consistency (nav vs page heading; single back affordance on the schema page).
- **B2.** Themed status colours for all toasts (no hardcoded values).
- **B3.** Attribute visibility on the Items "All types" view (column control / "+N more").
- **B4.** Unified empty states and loading states across every screen.
- **B5.** Dashboard chart: counts formatted; bars don't over-stretch small values.

### Group C — Per-page design intentions (from the appendix)
- **C1. Login** — a finished large-screen layout; password reveal.
- **C2. Inventory Types** — clear "Manage fields" affordance; balanced columns.
- **C3. Stock** — one coherent toolbar instead of mixed control shapes.
- **C4. Suppliers & Buyers** — adaptive truncation across widths.
- **C5. Audit** — readable at tablet width; day grouping; de-emphasised repeated actor.
- **C6. Settings** — form matches the settings it displays (locale); comfortable input width; constrained unit input.

---

## 4. Implementation Steps

### Phase 0 — Design system foundation (prerequisite for everything)
- **Steps:**
  1. **Design** defines the new language: palette (with light + dark), type scale, spacing, radius, elevation, and states (hover/focus/active/disabled/selected/invalid).
  2. Build it as **design tokens** (CSS custom properties) plus a small set of primitives: `Button` (primary/secondary/destructive hierarchy), form controls (`Input`/`Select`/`Textarea`/`Checkbox`/`Chip`), `DataView` (the responsive table-or-cards record list with built-in sort header), `Modal`, `Toast`, `EmptyState`, `Skeleton`, `Nav`/`AppShell`, `Breadcrumb`, `Pagination`.
  3. Primitives are presentation-only; they receive data and callbacks. **No primitive calls the API** — pages keep owning data (preserves §2).
- **Resources:** design mockups for the primitives in both themes; agreement on whether to keep hand-rolled CSS or adopt a styling approach — **no change to the data/query stack**.
- **Roles:** Design (lead), FE.

### Phase 1 — App shell & navigation (A3, B1)
- **Files:** `app/AppLayout.tsx`, nav/theme/sidebar markup, global styles.
- **Steps:** rebuild the shell (sidebar/drawer, mobile header, breadcrumb, theme toggle) on the new `AppShell`/`Nav`; mark the closed mobile drawer `inert`/`aria-hidden` so its links leave the tab order; align nav labels with page headings; keep `ims_theme` and `ims_sidebar_rail`, the skip link, Escape-to-close, and role-gated controls.
- **Roles:** FE, QA (keyboard/SR pass).

### Phase 2 — Record list (DataView): Items, Parties, Audit, Stock log (A1, A2, A4, A5, B3, B4, C4, C5)
- **Files:** new `DataView` component; `DynamicTable.tsx`, `ItemsPage.tsx`, `PartiesPage.tsx`, `AuditPage.tsx`, `StockPage.tsx`; remove `SortHeader.tsx`'s mouse-only header once migrated.
- **Steps:**
  1. `DataView` renders a table on wide screens and stacked record cards on narrow screens, with **actions always reachable** and a **focusable, `aria-sort` sort header**.
  2. Wire sorting to the server `sort` param on every list (Stock is the reference; Items/Parties stop sorting a single page locally).
  3. Built-in `EmptyState` and `Skeleton` loading for all lists.
  4. Items: add the attribute column control / "+N more" for the "All types" view; keep dynamic columns, CSV export, and the history drawer behaviour.
  5. Audit: keep the Type column legible when narrow; optional day grouping and quieter repeated-actor treatment.
- **Resources:** API confirmation that `/inventory-items`, `/suppliers`, `/buyers` honour `sort` as Stock uses it.
- **Roles:** FE, API (confirm only), Design, QA.

### Phase 3 — Forms & modals (A5, A6): Items, Parties, Stock, Settings, Schema
- **Files:** `FormModal.tsx` (becomes the single modal), `ItemsPage.tsx` (drop its hand-rolled modal), the form bodies; `DynamicForm.tsx`, `TypeSchemaPage.tsx`.
- **Steps:** every create/edit flow uses the one `Modal`/form system with a consistent required-field marker, field-error display, dirty-guard, focus trap, and submit/cancel footer. **Preserve** validation mapping, the type-fixed-on-edit rule, immutable `code` on party edit, drag-reorder on schema fields, and the Settings save payload.
- **Roles:** FE, Design, QA (create/edit/discard/validation regression).

### Phase 4 — Page-specific layouts (C1, C2, C3, C6, B5)
- **Login (C1):** finished large-screen layout + password reveal; keep email/password submit, error display, dev hint, redirect.
- **Inventory Types (C2):** clear "Manage fields" affordance and balanced columns; keep type CRUD and navigation to the schema route.
- **Stock (C3):** one coherent filter toolbar (search + type filter + advanced toggle + chips); keep all filter params, URL sync, chips, and the Buy/Sell/Adjust form.
- **Dashboard (B5):** redesigned stats + chart; counts formatted, bars sensible; keep the stat deep-links and the low-stock list.
- **Settings (C6):** align the form with displayed settings (locale), comfortable input width, constrained Default unit; keep the save payload and the listing.
- **Roles:** FE, Design, QA.

### Phase 5 — Theming, polish, cleanup (A6, B2)
- **Files:** token files, `Toast`.
- **Steps:** finalise light/dark tokens including `prefers-color-scheme`; themed status colours for all toasts; remove dead styles from the old system; a11y + contrast pass.
- **Roles:** FE, Design, QA.

---

## 5. New Design Proposals

Because the whole UI can change, the proposals describe **intent and behaviour**, leaving exact visuals to Design. Each must satisfy §2.

### 5.1 Design system (new)
A token-driven system with light/dark parity and a documented component set (see Phase 0). This is the central deliverable; every page is assembled from it. Deliverable includes a primitives mockup sheet in both themes.

### 5.2 `DataView` — responsive record list (replaces all tables)
- **Behaviour:** one component for every list. Above a breakpoint it is a sortable table; below it, stacked record cards (label:value, full-width action area). Row actions are always visible at every width. Sort headers are focusable, show direction, expose `aria-sort`, and drive the **server** `sort` param.
- **Why:** resolves the mid-width action-clipping, mouse-only sort, page-local sort, and table/sort-header duplication in one place.
- **Sketch reference:** desktop = columned table with a pinned/always-visible actions column; mobile/tablet = cards with a bottom action row.

### 5.3 Record editor — single modal/form system
- **Behaviour:** one modal with consistent header (create vs edit), required markers, inline errors, dirty-guard, focus trap/return, and footer. Hosts the Items dynamic schema form, party forms, and schema-field editor.
- **Sketch reference:** centred dialog on desktop; full-height sheet on mobile; sticky footer actions.

### 5.4 App shell & navigation
- **Behaviour:** persistent sidebar (with optional collapse) on desktop, off-canvas drawer on mobile that is fully removed from the tab order when closed. Theme toggle, breadcrumb, skip link retained.

### 5.5 Login
- **Behaviour:** compact centred card on mobile; a finished, anchored layout on larger screens (brand area + form). Password reveal at all sizes. Same submit/redirect/error behaviour.

### 5.6 Stock toolbar
- **Behaviour:** a single coherent filter bar — search, type filter, advanced-filters toggle, and removable active-filter chips with "Clear all" — unified in height/shape. Same filters, same URL sync.

### 5.7 Dashboard
- **Behaviour:** redesigned KPI tiles and a type-distribution chart that formats counts and keeps bar sizing sensible on wide screens. Same deep-links and low-stock table data.

### 5.8 Settings
- **Behaviour:** the editable form reflects exactly the settings shown (including locale, currently fixed); constrained Default unit; comfortable input width. Same save payload.

---

## 6. Dependencies & Risks

**Dependencies / prerequisites**
- **Phase 0 (design system) gates all page work** — pages are rebuilt from the primitives, so the primitives and tokens come first.
- **A1 relies on the existing list-sort API contract** for `/inventory-items`, `/suppliers`, `/buyers` (Stock proves it exists). Confirm with API before Phase 2 — this is a confirmation, not a backend change.
- **Design mockups** for primitives and each page are needed ahead of the matching phase.

**Risks**
- **Functional regression is the primary risk.** A full re-skin touches every page; the §2 contract is the guardrail. Mitigate by (a) keeping all data/query/mutation code in the pages and only swapping presentation, (b) migrating one page at a time behind the new primitives, (c) a QA parity pass per page against §2.
- **Behaviour-visible sort change (A1):** ordering will span the dataset instead of the current page; intended, but note in QA/release.
- **Role-gated controls:** easy to drop a permission check when rebuilding markup — explicitly re-verify VIEWER vs ADMIN on every page.
- **Deep-links & URL state:** `/stock?buy=`, Stock filter chips in `searchParams`, and dashboard stat links must be re-tested after layout changes.
- **Dynamic schema forms (Items):** the most complex surface (per-type fields, defaults, API error mapping, history drawer) — regression-test thoroughly after moving to the new form system.
- **Theme parity:** the new tokens must cover light, dark, and `prefers-color-scheme`; validate every primitive in all three.

**Suggested sequencing**
1. Phase 0 — design system + tokens.
2. Phase 1 — shell/nav.
3. Phase 2 — `DataView` across lists (biggest consistency + accessibility win).
4. Phase 3 — forms/modals.
5. Phase 4 — page-specific layouts.
6. Phase 5 — theming/polish/cleanup.
Each phase is independently shippable and verified for functional parity (§2) and across mobile, tablet, and desktop in both themes.
