# Motion Design Spec — BrBr Full Motion (CSS-only)

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Add comprehensive motion/animation layer across all dashboard pages. CSS-only, no new dependencies.

## Problem

The app feels static. Motion tokens exist (easing, durations, keyframes) but are only applied in 2 of ~15 list views. Page navigations, tab switches, list rendering, and card interactions all happen instantly with no visual feedback.

## Approach

Full motion design using existing CSS infrastructure + Next.js View Transitions API. No new npm dependencies. All animations respect `prefers-reduced-motion`.

---

## Section 1: Global Motion Utilities (globals.css)

New utility classes:

- **`.animate-fade-in`** — `opacity: 0 → 1`, 200ms, `--ease-snappy`
- **`.animate-slide-up`** — `translateY(8px) → 0` + fade, 200ms, `--ease-snappy`
- **`.animate-scale-in`** — `scale(0.98) → 1` + fade, 150ms, `--ease-snappy`
- Extend **`.stagger-children`** to 12 children (currently caps at 8)

New keyframes:

```css
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes slide-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes scale-in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
```

## Section 2: View Transitions (next.config.ts)

Enable `experimental.viewTransition: true` in Next.js config. This gives automatic cross-fade between routes with zero component code. Browsers without support get instant navigation (current behavior).

## Section 3: List/Grid Entrance Animations

Apply `stagger-children` + `animate-fade-up` on mount to every list view:

| Page | Target element |
|------|---------------|
| Clients | Client card grid |
| Staff | Staff card grid |
| Appointments feed | Feed items |
| Inventory products | Table rows |
| Inventory overview | Stock movement items + low stock items |
| Expenses | Expense group cards |
| Reports hub | Report tiles |
| Packages | Package cards |
| Payroll | Staff payroll rows |
| Orders | Order cards |
| Suppliers | Supplier cards |

## Section 4: Tab Content Transitions

Update `TabsContent` base component (`src/components/ui/tabs.tsx`) to add:
```
animate-in fade-in-0 duration-200
```
on the active panel. This makes all tab switches across settings, client detail, staff detail, etc. fade in.

## Section 5: Card Hover Micro-interactions

Standardize all interactive cards to:
```
hover:-translate-y-0.5 hover:shadow-md transition-all duration-200
```

Applied to: client cards, staff cards, package cards, inventory items, report cards, supplier cards, order cards.

## Section 6: Button & Input Micro-interactions

- **All buttons** (`src/components/ui/button.tsx`): add `active:scale-[0.97]` to base variant
- **Search bar in topbar**: `focus-within:w-80 transition-all duration-300` for subtle expand
- **Input focus**: Ensure `transition-shadow duration-150` on all inputs for smooth ring appearance

## Section 7: Sidebar Active Indicator

The sidebar nav links already have `transition-all duration-200`. Add animated background transition so the active highlight smoothly moves when switching pages (already achieved via CSS transition on bg-color).

## Section 8: Loading → Content Transition

Currently shimmer → real content is an instant swap. Wrap content in `animate-fade-in` class when `loading` flips to `false`. Applies to all pages with loading states (dashboard, clients, staff, inventory, expenses, reports, packages, payroll).

---

## Constraints

- **CSS-only** — no framer-motion, react-spring, or other animation libraries
- **Performance** — only animate `transform` and `opacity` (GPU-composited properties)
- **Accessibility** — all animations already covered by existing `prefers-reduced-motion` kill-switch
- **Duration budget** — nothing slower than 300ms except page transitions (which use browser View Transitions)
- **No layout animations** — don't animate width, height, top, left (causes layout thrash)

## Files to Modify

1. `src/app/globals.css` — new keyframes + utilities
2. `next.config.ts` — viewTransition flag
3. `src/components/ui/tabs.tsx` — TabsContent fade
4. `src/components/ui/button.tsx` — active:scale
5. `src/app/dashboard/layout.tsx` — search bar expand
6. ~12 page files — add stagger/fade classes to list containers
7. ~8 page files — add hover lift to cards
8. ~8 page files — add animate-fade-in when loading completes
