# IMS UI/UX Critique & Roast

> Senior front-end review of the IMS web app (`apps/web`).
> Method: source review (`styles.css`, feature pages, shared components) **plus** live walkthrough of the running app across desktop, mobile, light, and dark.
> Date: 2026-11-06 · Branch: `UI-UX-Improvement`

## Verdict

It's an internal ERP admin tool, and it's **already competent** — themeable (light/dark/auto), keyboard-escapable modals with focus trap and dirty-guard, a skip link, a genuinely good card-table transformation on mobile, sticky modal footers, and skeleton loaders. So this isn't a teardown; it's the list of things stopping it from being *tight*.

---

## Critical Issues

- **Column sorting lies.** `DynamicTable.sortItems` and `PartiesPage`'s `sortRows` sort **client-side on the current page only**, while both lists are server-paginated. Past page 1, clicking "Qty" sorts the 20 visible rows, not the dataset — the user believes they're seeing the global lowest/highest and they are not. Move sorting server-side (the API already accepts `sort=` — it's used for item history).
- **Sorting is mouse-only.** `DynamicTable` headers are `<th onClick>` with no `role`, `tabindex`, or `onKeyDown`. Keyboard and screen-reader users cannot sort at all. The shared `SortableTh` component handles this correctly — `DynamicTable` just doesn't use it.
- **The closed mobile drawer is a keyboard trap.** When the nav is shut it's only translated off-screen (`transform: translateX(-105%)`) — still in the DOM and in the tab order, with no `inert`/`hidden`. Keyboard users tab into an invisible menu. Apply `inert` (or `hidden`) when closed.
- **The mid-width dead zone hides the action buttons.** Card mode stops at 640px, but the columns don't fit until ~820px. Between those widths the table scrolls horizontally and the first thing pushed off the right edge is **Edit / Delete / History** — the most important controls get hidden. Verified live at ~800px.

## Fixable Issues

- **`--accent-soft` is undefined.** Used at `styles.css:889` and `:901` but never declared, so the selected-row highlight and the pressed `type-select` state render with **no background**. Define the token (dark + light).
- **Required marking is inconsistent.** SKU and Name show no `*` in the item form (`ItemsPage.tsx:514`) while dynamic attributes do. Mark all required fields the same way.
- **Numbers are left-aligned.** Qty/Min already use `tabular-nums` but sit left-aligned, defeating scan-and-compare. Right-align numeric columns.
- **Delete is the loudest control in every row** (danger-colored border) while Edit is near-invisible — the destructive action out-shouts the common one. Make Delete a quiet default that turns danger on hover.
- **Label drift.** Nav says "Items", the page heading says "Inventory Items" — pick one. The schema page has both a breadcrumb **and** a "← Inventory Types" back link — drop one.
- **Minor theming/consistency.** Toast "info" uses a hardcoded `#334155` instead of a token; `DynamicTable` silently drops attribute columns past 4 (`.slice(0, 4)`) with no "+N more" affordance.

## Improvement Suggestions

- **Two modals, two sort headers, three empty states.** `ItemsPage` hand-rolls its own modal; `PartiesPage` uses the shared `FormModal`. Consolidate on `FormModal`. Same for sort headers (inline vs shared `SortableTh`/`useClientSort`). The nice `.empty-state` CSS is **dead code** — pages use plain `<p class="muted">` or a `colSpan` cell instead; wire the component in everywhere.
- **Unify loading states.** Dashboard shows a "Loading…" text line; Items/Parties show skeleton rows. Standardize on skeletons.
- **Attributes are invisible on "All types."** Dynamic columns only appear when a single type is filtered. Add a column picker so the default view isn't attribute-blind.
- **Dashboard bars over-stretch.** Counts of 1–3 stretch to ~1000px bars on wide screens; cap the track width and run `bar-count` through `formatNumber` like every other number.
- **Revisit the responsive column strategy.** Content caps at 1280px (dead right margin on 1440+), yet tables overflow at mid widths. A single coherent plan (priority columns / column hiding) would fix both ends.

---

### Suggested priority order

1. Critical #1 (server-side sort) and #2 (keyboard sort) — correctness + accessibility.
2. Critical #3 (drawer `inert`) and #4 (mid-width action overflow).
3. Fixable list (`--accent-soft`, required `*`, number alignment, Delete emphasis).
4. Consolidation/refactors (shared modal, shared sort header, `.empty-state`).

---

## Per-Page UI Notes (visual inspection — mobile, tablet, desktop)

UI-only observations from walking each page in the browser at phone (375px), tablet (768px), and desktop (1440px) widths. Every suggestion below is intended to hold across all three sizes.

### Global / App shell (applies to every page)
- The row action buttons place the destructive **Delete** as the most visually prominent control (coloured outline) while **Edit** is nearly borderless — on every screen size the eye lands on the dangerous action first. Quiet Delete down to match Edit and let colour appear on hover/focus.
- Numeric columns (Qty, Min, counts) sit left-aligned at all widths, so magnitudes don't line up for scanning — right-align them.
- Tables drop to a stacked "card" layout only at the smallest width; at tablet and small-desktop widths they overflow sideways and the right-most columns (including the action buttons) disappear behind a horizontal scrollbar. Give tables a consistent priority-column or earlier card-switch treatment so the actions are always reachable.
- Navigation label "Items" doesn't match the page heading "Inventory Items"; align the wording so the active nav item and the page title read the same on every size.

### Login Page
- The card is cleanly centred at all sizes, but the surrounding space is almost entirely empty on tablet and desktop — consider a brand mark, product line, or subtle illustration so the page doesn't read as unfinished on larger screens while staying compact on mobile.
- The password field has no show/hide affordance; add a reveal toggle that stays inside the field at every width.
- The "Dev login" hint and the floating theme toggle are the only secondary elements; keep their visual weight low so they don't compete with the Sign in button on small screens where everything is close together.

### Dashboard
- The stat cards are a clear top row, but the "Items by type" bars stretch small counts (1–3) across the full card width on tablet and desktop while looking proportionate on mobile — cap the bar track width so the chart reads consistently at all sizes.
- The low-stock table and the bar list are visually similar cards stacked together; add a little more separation or sectioning so the two blocks don't blur into one at any width.
- Count values in the bar list render without the thousands/locale formatting used elsewhere; make number styling uniform across breakpoints.

### Inventory Types (list)
- Each row packs the type name and an inline "Manage fields" affordance into one cell, which feels cramped on mobile and leaves a large empty gap before the actions on desktop — give the "Manage fields" entry a clearer, consistent placement across sizes.
- The gap between the Code column and the Edit/Delete actions grows large on desktop while the same columns crowd on mobile; balance the column widths so the layout reads evenly at all sizes.

### Type Schema / Manage fields
- The screen shows both a breadcrumb and a separate "← Inventory Types" back link; keep a single, consistent back affordance at every width.
- The field rows carry drag handles, order numbers, and a flags column — a dense layout that holds up on desktop but needs the same clarity when it narrows; ensure the handle and order indicators stay legible and tappable on mobile and tablet.

### Inventory Items
- Required markers are inconsistent in the add/edit form: dynamic attributes show an asterisk while the core SKU and Name fields do not — make the required indicator consistent across all fields and all sizes.
- Attribute columns only appear once a single type is filtered; on the default "All types" view the table looks sparse with wide empty space on desktop. Provide a column choice or placeholder so the table feels intentional at every width.
- Selected-row and pressed filter states are meant to show a soft highlight but currently render flat; make the selection state clearly visible in both light and dark and at all sizes.

### Stock
- The toolbar mixes several control shapes in one row — a segmented Buy/Sell/Adjust switch, a pill "Filters" button, and filter chips — which reads busy on desktop and can wrap awkwardly on tablet/mobile. Unify the control styling so the toolbar stays tidy as it reflows.
- The transaction log's numeric columns (Qty, Before, After) are left-aligned and get pushed off-screen at tablet width; right-align them and keep them visible as the table narrows.

### Suppliers & Buyers
- These two pages are visually identical apart from the title, which is good for consistency; keep the empty-state and row styling matched across both at every size.
- Long names/emails are truncated with ellipsis — confirm the truncation point adapts sensibly from mobile up to desktop rather than cutting very short on narrow screens.

### Audit Logs
- The action badges (Created / Updated / Deleted) are a strong, colour-coded touch; carry that same clarity to the "Type" column, which is the first thing clipped when the table overflows at tablet width.
- Timestamps are shown in full on every row, and the "Who" value repeats identically down the list; consider grouping by day or de-emphasising repeated actors so the log stays scannable from mobile to desktop.

### Settings
- The editable form exposes Organization name and Default unit, but the "All settings" panel also surfaces a locale value that isn't editable in the form — align what the form shows with what the panel lists so the page reads consistently at all sizes.
- On wide screens the single-column form inputs stretch nearly the full card width, which is hard to scan; cap the input line length so the form stays comfortable on desktop while still filling the width on mobile.
- "Default unit" is a free-text field; a constrained picker would read more intentionally and behave the same across sizes.

