# Stock & Inventory — Screen Redesign

> Senior design review and redesign proposal for the **Items** and **Stock** screens of the IMS web app (`apps/web`).
> Scope: information architecture ("what goes where"), layout, and interaction. New API endpoints are **in scope** — where the ideal UX needs data the API doesn't expose yet, this document names the endpoint to add.
> Date: 2026-11-06 · Branch: `UI-UX-Improvement-2`
> Files in play: [`StockPage.tsx`](apps/web/src/features/stock/StockPage.tsx), [`ItemsPage.tsx`](apps/web/src/features/inventory-items/ItemsPage.tsx), [`DynamicTable.tsx`](apps/web/src/features/inventory-items/DynamicTable.tsx), [`DashboardPage.tsx`](apps/web/src/features/dashboard/DashboardPage.tsx).

---

## 1. The core problem: the two screens don't have clear jobs

Today the work is split across two tabs that overlap and leave gaps:

| | **Items** (`/items`) | **Stock** (`/stock`) |
|---|---|---|
| Shows | SKU, name, type, **quantity + low badge**, dynamic attributes | A big always-open Buy/Sell/Adjust form, then a transaction log |
| Lets you do | Add / edit / delete item metadata, view per-item history | Record a movement, search/filter the ledger |
| The gap | Shows quantity but you can't *act* on it here | Shows a log of the past, but **no view of current stock state** |

The two pain points you named map exactly to this:

1. **"Items displays quantity, Stock shows nothing."** Quantity *lives* on the Items screen (as a read-only number) but can only be *changed* on the Stock screen. So the number and the lever that moves it are on different tabs. Meanwhile Stock — the screen literally named after stock — never tells you how much stock you have. It only shows history.
2. **"The Buy/Sell/Adjust card is just open, and it's a card I think is not required like this."** The transaction form is a permanently-expanded card pinned to the top of the page. It takes the most valuable screen real-estate, is shown even when you only came to *read* the log, and it's a different interaction pattern from the rest of the app (everywhere else — Items, Parties — creating a record opens a **modal**).

The fix is to give each screen one clear job:

> **Items = the catalog.** *What do we stock, and what is each thing?* (identity, attributes, reorder level)
>
> **Stock = the ledger + live levels.** *How much do we have right now, and what has moved?* (current on-hand, valuation, movements)

Quantity is **owned** by Stock (it's the running total of movements) and **reflected read-only** on Items. Every action that changes a quantity lives on Stock, reachable in one click from wherever you see a quantity.

---

## 2. Redesigned Stock screen

The Stock screen becomes the operational home for inventory levels. Replace the single long page with a header + a summary strip + two sub-views: **Levels** and **Movements**.

### 2.1 Kill the always-open form → a "Record movement" modal

Remove the pinned Buy/Sell/Adjust card entirely. Replace it with a primary button in the page header that opens a modal (the same `FormModal` pattern used by Add Item and Parties, so the app has one way to create things).

```
┌─────────────────────────────────────────────────────────────┐
│  Stock                                   [ + Record movement ]│
│  Track levels, record purchases and sales, review movements.  │
└─────────────────────────────────────────────────────────────┘
```

The modal keeps the existing segmented control and all current fields/validation — nothing about the transaction logic changes, only where it lives:

```
┌──────────────  Record movement  ──────────────┐
│  [ Buy ]  [ Sell ]  [ Adjust ]                 │   ← existing seg control
│                                                │
│  Item *            ▸ SKU — Name (on hand: 42)  │
│  Supplier/Buyer *  ▸ …                          │
│  Quantity *        [        ]                   │
│  Unit price        [        ]                   │
│  Notes / Reason    [                      ]     │
│                                                │
│  Current on hand: 42  →  After: 54  (preview)   │   ← new: live result preview
│                         [ Cancel ] [ Confirm ]  │
└────────────────────────────────────────────────┘
```

Wins:
- The log and levels are visible the moment you land — reading no longer costs a scroll past a form you didn't want.
- Consistent with the rest of the app (one creation pattern).
- Room for a **before → after preview** so people see the consequence before confirming (today the "Current stock" hint is static; show the *resulting* number too).
- The modal can be opened **pre-filled** from anywhere (a Levels row, the dashboard Restock link, an item's page), so the three verbs don't need a permanent home.

### 2.2 Add a summary strip (answers "Stock shows nothing")

A row of compact KPI tiles at the top of Stock, so the screen opens with the state of the business, not a blank form:

```
┌───────────┬───────────┬───────────┬───────────┬───────────┐
│ On-hand   │ Stock     │ Low / out │ Movements │ Net qty   │
│ value     │ units     │ of stock  │ today     │ this week │
│ $128,400  │ 3,120     │ 7 ⚠       │ 14        │ +240 ▲    │
└───────────┴───────────┴───────────┴───────────┴───────────┘
```

Clicking a tile scopes the view below (e.g. "Low / out of stock" → Levels filtered to below-reorder).

> **New endpoint:** `GET /stock/summary` → `{ onHandValue, totalUnits, lowStockCount, outOfStockCount, movementsToday, netQtyThisWeek }`. Valuation needs a unit-cost basis (latest purchase price or moving average) — decide the rule server-side and document it so the number is trustworthy.

### 2.3 Sub-view A — "Levels" (the current-state table that's missing today)

A per-item table of **current stock**, sorted/filterable, with the three actions inline on each row. This is the piece that makes Stock feel like stock, not a logbook.

```
Levels | Movements                                   [search] [type ▾] [Low only ☐]
┌──────────┬──────────────┬────────┬──────────┬───────────┬──────────────────────────┐
│ SKU      │ Name         │ Type   │ On hand  │ Reorder @ │ Status  │ Actions         │
├──────────┼──────────────┼────────┼──────────┼───────────┼─────────┼─────────────────┤
│ BOLT-M6  │ M6 Bolt      │ Fastnr │      42  │       50  │ ⚠ Low   │ Buy · Sell · Adj│
│ WIRE-2.5 │ 2.5mm Wire   │ Cable  │   1,200  │      200  │ ● OK    │ Buy · Sell · Adj│
│ SEAL-22  │ O-ring 22mm  │ Seal   │       0  │       25  │ ✕ Out   │ Buy · Sell · Adj│
└──────────┴──────────────┴────────┴──────────┴───────────┴─────────┴─────────────────┘
```

- **On hand** right-aligned, `tabular-nums`, with the low/out badge (reuse the existing `.low-badge`).
- Row actions open the **same modal** from §2.1, pre-filled with that item and the chosen verb — so you act where you see the number.
- A **Status** column turns the raw qty-vs-reorder comparison into a legible state (OK / Low / Out), which scans far faster than two numbers.
- Server-side sort and pagination (the roast flagged client-only sort as a correctness bug — fix it here by construction).

> **New endpoint (or extend the existing one):** `GET /stock/levels?q=&inventoryTypeId=&status=low|out&sort=&page=` returning each item with `onHand`, `minQuantity`, `status`, and optionally `lastMovementAt` + `onHandValue`. This can be a thin projection over `inventory-items`; the point is a purpose-named endpoint so the Stock screen isn't piggy-backing on the Items list semantics.

### 2.4 Sub-view B — "Movements" (today's transaction log, kept)

The existing transaction log is good — keep it almost as-is: the search, the type segmented filter (All / Purchases / Sales / Adjustments), the removable filter chips, advanced filters, the columns (When, Type, Item, Party, Qty, Before, After, Value, By), and pagination. Only changes:

- It becomes the **Movements** tab rather than the whole lower half of the page.
- Add a **date-range** filter and an **Export CSV** button (the ledger is the thing people reconcile against; Items already exports, the ledger should too).
- Keep the colored type badges (Buy/Sell/Adjust) — they work well.

### 2.5 Stock page — final shape

```
Stock                                            [ + Record movement ]
──────────────────────────────────────────────────────────────────────
[ KPI strip: value · units · low/out · movements today · net this week ]

[ Levels ]  [ Movements ]          ← sub-tabs (URL: /stock?view=levels|movements)

   …selected view (Levels table  OR  Movements log)…
```

---

## 3. Redesigned Items screen

Items stays the **catalog**, but gets sharpened so its job is unmistakably "define things," not "manage quantity."

### 3.1 What stays
- SKU / Name / Type / dynamic attribute columns, the type filter, column picker, search, Add/Edit/Delete, CSV export, per-item movement-history drawer. All good.

### 3.2 What changes

- **Quantity becomes a clearly read-only, linked reflection.** Keep the Qty column + low badge, but present it as a *status* that points to Stock rather than something you'd expect to edit here. Clicking the quantity (or a small "Manage stock" row action) jumps to `/stock` for that item with the movement modal ready. This resolves the "quantity is here but I can't do anything with it" confusion — the number is now a doorway, not a dead end.
- **Drop Quantity / Min from the Add/Edit *metadata* form, or clearly fence them off.** Letting people type an opening quantity into the item form competes with the ledger as the source of truth (an edit that sets qty = 100 leaves no movement record). Two clean options:
  - *Preferred:* the create form captures an **"opening stock"** that the API records as an initial `ADJUSTMENT` movement, so every quantity change — including the first — has a ledger entry. Min quantity stays (it's catalog config, not stock).
  - *Minimum:* keep the fields but label the section "Opening balance" and visually separate it from identity/attributes.
- **Row actions, re-ordered by how destructive they are:** `Manage stock` · `History` · `Edit` · `Delete`. Today Delete is the loudest control in the row (danger border) while Edit is nearly invisible — quiet Delete to a neutral default that turns red on hover (also in the roast).
- **Add a "Status" / low-stock filter** so you can answer "what's running out?" from the catalog too, consistent with the dashboard.

### 3.3 Items page — final shape

```
Items                                   [ Export CSV ]  [ + Add item ]
──────────────────────────────────────────────────────────────────────
[search]  [type ▾]  [Columns (3/8) ▾]  [Low only ☐]

┌────────┬──────────┬───────┬────────────┬─ attrs… ─┬──────────────────────────┐
│ SKU    │ Name     │ Type  │ On hand →   │ …        │ Manage · History · Edit · ⋯│
├────────┼──────────┼───────┼────────────┼──────────┼──────────────────────────┤
│ BOLT-M6│ M6 Bolt  │ Fastnr│  42  ⚠ low  │ …        │ …                        │
└────────┴──────────┴───────┴────────────┴──────────┴──────────────────────────┘
```

(On hand is a link to Stock; it reads as "reflected from the ledger," not an editable cell.)

---

## 4. How the three screens relate (the mental model)

| Screen | Question it answers | Owns | Reflects |
|---|---|---|---|
| **Items** | *What do we stock?* | Identity, attributes, reorder level | On-hand (read-only, links to Stock) |
| **Stock** | *How much, and what moved?* | Quantity (via movements), valuation | — |
| **Dashboard** | *What needs attention?* | Nothing (pure summary) | Low-stock, counts, distribution |

One consistent flow for "something is low": **Dashboard** flags it → **Restock** link → **Stock** movement modal, pre-filled. That path already half-exists (the dashboard `Restock` link deep-links to `/stock?buy=<id>`); this redesign makes it the same mechanism everywhere a quantity appears.

---

## 5. Component & interaction notes

- **One creation pattern.** The movement form moves into `FormModal` (already used by Items/Parties). Delete the always-open `.card` block from `StockPage.tsx`. This also fixes the inconsistency the roast called out (Items hand-rolls a modal; standardize).
- **Pre-fillable modal.** The movement modal takes `{ itemId?, mode? }` so it can be opened empty (header button), or targeted (Levels row, Items row, dashboard link, `?buy=` deep-link). Keep the existing `/stock?buy=<id>` deep-link working — it just opens the modal now instead of pre-selecting an inline form.
- **Before → after preview** in the modal, computed from the selected item's current on-hand and the typed quantity/new value. Small reassurance, no new endpoint.
- **Sub-tabs via URL** (`/stock?view=levels|movements`) so the view is linkable and survives refresh, matching how filters already persist to the query string.
- **Right-align every numeric column** (On hand, Reorder, Qty, Before, After, Value) with `tabular-nums` for scan-and-compare.
- **Server-side sort + pagination** on the Levels table from day one — don't inherit the client-only-sort bug.
- **Status as a word, not a calculation.** OK / Low / Out beats making the reader compare two numbers in their head.
- **Empty states** wired through the shared `EmptyState` component (Levels: "No items yet — add one in Items"; Movements: existing copy).

---

## 6. New / extended API endpoints

Nothing below changes existing behaviour; these are additive.

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /stock/summary` | KPI strip values | value, units, low/out counts, movements today, net qty this week |
| `GET /stock/levels` | Current-state table on Stock | item + onHand + minQuantity + status (+ onHandValue, lastMovementAt); server sort/paginate/filter by `status=low\|out` |
| `POST /stock-transactions/*` (existing) | Record movement | unchanged; just invoked from the modal |
| `POST /inventory-items` (extend) | Capture **opening stock** as an initial `ADJUSTMENT` | so the first quantity also has a ledger entry — optional but recommended |
| `GET /stock-transactions` (extend) | Date-range filter + CSV | add `from`/`to`; CSV can reuse the Items export approach |

Valuation (`onHandValue`) is the one real decision: pick a cost basis (latest purchase price vs. moving average), implement it once server-side, and document it — a dollar figure people don't trust is worse than none.

---

## 7. Suggested build order

1. **Move the movement form into a modal** and delete the always-open card. (Biggest felt improvement, no new endpoint — pure front-end.)
2. **Add the KPI summary strip** to Stock (`GET /stock/summary`).
3. **Add the Levels sub-view** with inline per-row actions (`GET /stock/levels`), and the Levels/Movements sub-tabs.
4. **Re-point Items' quantity** to Stock (link + "Manage stock" action), reorder row actions, quiet Delete, add low-stock filter.
5. **Opening-balance-as-adjustment** on item create, and date-range + CSV on the Movements log.
6. Cross-viewport + keyboard + light/dark pass on both screens.

Steps 1 and 4 need no backend and already remove most of the confusion; steps 2–3 are what turn Stock from a logbook into a real stock screen.
