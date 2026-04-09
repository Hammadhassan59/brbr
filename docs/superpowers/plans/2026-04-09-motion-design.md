# Motion Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the BrBr app feel alive with smooth transitions, staggered list entrances, card hover lifts, and page transitions. CSS-only, no new dependencies.

**Architecture:** Add new keyframes and utility classes to globals.css, enable Next.js View Transitions, update base components (Button, TabsContent), then apply stagger/fade/hover classes across all dashboard pages.

**Tech Stack:** CSS animations, Tailwind utilities, Next.js View Transitions API, tw-animate-css

---

### Task 1: Global Motion Utilities

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add new keyframes**

Add after the existing `fade-up` keyframe block (after line 228):

```css
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes scale-in {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
```

- [ ] **Step 2: Add new utility classes**

Add inside the `@layer utilities` block, after `.animate-fade-up`:

```css
  .animate-fade-in {
    animation: fade-in var(--duration-normal) var(--ease-snappy) both;
  }

  .animate-slide-up {
    animation: slide-up var(--duration-normal) var(--ease-snappy) both;
  }

  .animate-scale-in {
    animation: scale-in var(--duration-fast) var(--ease-snappy) both;
  }
```

- [ ] **Step 3: Extend stagger-children to 12 items**

Add after the existing `.stagger-children > :nth-child(8)` rule:

```css
  .stagger-children > :nth-child(9) { animation-delay: 400ms; }
  .stagger-children > :nth-child(10) { animation-delay: 450ms; }
  .stagger-children > :nth-child(11) { animation-delay: 500ms; }
  .stagger-children > :nth-child(12) { animation-delay: 550ms; }
```

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(motion): add fade-in, slide-up, scale-in utilities and extend stagger to 12"
```

---

### Task 2: Enable View Transitions

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add viewTransition flag**

Add `experimental` block to the Next.js config:

```typescript
const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  async headers() {
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat(motion): enable Next.js View Transitions for route cross-fades"
```

---

### Task 3: TabsContent Fade Transition

**Files:**
- Modify: `src/components/ui/tabs.tsx`

- [ ] **Step 1: Add fade animation to TabsContent**

Change the TabsContent className from:
```
"flex-1 text-sm outline-none"
```
to:
```
"flex-1 text-sm outline-none animate-in fade-in-0 duration-200"
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/tabs.tsx
git commit -m "feat(motion): add fade transition to TabsContent on panel switch"
```

---

### Task 4: Button Press Micro-interaction

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: Add active:scale to button base**

In the `buttonVariants` cva base string, change:
```
active:translate-y-px
```
to:
```
active:scale-[0.97]
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat(motion): add scale press effect to all buttons"
```

---

### Task 5: Search Bar Focus Expand

**Files:**
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Add focus-within expand to search bar**

Find the search bar container:
```
<div className="hidden sm:flex items-center gap-2 bg-muted rounded-lg px-3 h-10 w-72 border border-border">
```

Change to:
```
<div className="hidden sm:flex items-center gap-2 bg-muted rounded-lg px-3 h-10 w-72 focus-within:w-80 border border-border transition-all duration-300">
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat(motion): search bar expands on focus"
```

---

### Task 6: Dashboard List Stagger Animations

**Files:**
- Modify: `src/app/dashboard/components/appointments-feed.tsx`
- Modify: `src/app/dashboard/components/staff-performance-table.tsx`
- Modify: `src/app/dashboard/components/payment-breakdown.tsx`

- [ ] **Step 1: Add stagger to appointments feed**

In `appointments-feed.tsx`, find the list container wrapping appointment items and add `stagger-children` class. Each appointment link/item should get `animate-fade-up` class.

Find the container div wrapping the appointment links (the `space-y-1` or similar div that maps over appointments) and add `stagger-children` to it. On each child link/div, add `animate-fade-up`.

- [ ] **Step 2: Add stagger to staff performance rows**

In `staff-performance-table.tsx`, find the TableBody and add `stagger-children` class. Each TableRow should get `animate-fade-up`.

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/components/appointments-feed.tsx src/app/dashboard/components/staff-performance-table.tsx
git commit -m "feat(motion): add stagger entrance to dashboard feed and staff table"
```

---

### Task 7: Client, Staff, Package List Stagger + Card Hover

**Files:**
- Modify: `src/app/dashboard/clients/page.tsx`
- Modify: `src/app/dashboard/staff/page.tsx`
- Modify: `src/app/dashboard/packages/page.tsx`

- [ ] **Step 1: Clients page — stagger + hover lift**

Find the client card grid container (`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`). Add `stagger-children` class to it.

In `src/app/dashboard/clients/components/client-card.tsx`, ensure the card root has `animate-fade-up hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`.

- [ ] **Step 2: Staff page — stagger + hover lift**

Find the staff card grid container. Add `stagger-children` class. Each staff card div should already have hover effects — verify `hover:-translate-y-0.5` is present. Add `animate-fade-up` to each card.

- [ ] **Step 3: Packages page — stagger + hover lift**

Find the package card grid container. Add `stagger-children` class. Each package Card should get `animate-fade-up hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`.

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/clients/page.tsx src/app/dashboard/clients/components/client-card.tsx src/app/dashboard/staff/page.tsx src/app/dashboard/packages/page.tsx
git commit -m "feat(motion): add stagger entrance and hover lift to client, staff, package cards"
```

---

### Task 8: Inventory Page Stagger Animations

**Files:**
- Modify: `src/app/dashboard/inventory/page.tsx`
- Modify: `src/app/dashboard/inventory/orders/page.tsx`
- Modify: `src/app/dashboard/inventory/suppliers/page.tsx`

- [ ] **Step 1: Inventory overview — stagger on stock movements + low stock**

Find the low stock alerts `.space-y-2` container and add `stagger-children`. Each low stock item div should get `animate-fade-up`.

Find the stock movements `.space-y-2` container and add `stagger-children`. Each movement item div should get `animate-fade-up`.

- [ ] **Step 2: Orders — stagger + hover lift**

Find the orders `.space-y-3` container. Add `stagger-children`. Each order Card should get `animate-fade-up hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`.

- [ ] **Step 3: Suppliers — stagger + hover lift**

Find the suppliers grid container. Add `stagger-children`. Each supplier Card should already have hover — add `animate-fade-up`.

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/inventory/page.tsx src/app/dashboard/inventory/orders/page.tsx src/app/dashboard/inventory/suppliers/page.tsx
git commit -m "feat(motion): add stagger entrance to inventory, orders, suppliers"
```

---

### Task 9: Expenses + Reports Stagger

**Files:**
- Modify: `src/app/dashboard/expenses/page.tsx`
- Modify: `src/app/dashboard/reports/page.tsx`
- Modify: `src/app/dashboard/staff/payroll/page.tsx`

- [ ] **Step 1: Expenses — stagger on expense groups**

Find the container that maps over `groupedByDate` entries. Each expense Card group should get `animate-fade-up`. The summary cards grid should get `stagger-children`.

- [ ] **Step 2: Reports hub — stagger on report tiles**

Find the report card grid and add `stagger-children`. Each report card/link should get `animate-fade-up`.

- [ ] **Step 3: Payroll — stagger on staff rows**

Find the payroll staff list container. Add `stagger-children`. Each staff payroll row should get `animate-fade-up`.

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/expenses/page.tsx src/app/dashboard/reports/page.tsx src/app/dashboard/staff/payroll/page.tsx
git commit -m "feat(motion): add stagger entrance to expenses, reports, payroll"
```

---

### Task 10: Loading → Content Fade Transitions

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/clients/page.tsx`
- Modify: `src/app/dashboard/staff/page.tsx`
- Modify: `src/app/dashboard/inventory/page.tsx`
- Modify: `src/app/dashboard/expenses/page.tsx`
- Modify: `src/app/dashboard/packages/page.tsx`

- [ ] **Step 1: Add animate-fade-in to loaded content**

For each page that has a `loading` state with shimmer/skeleton, wrap the non-loading content branch in a div or add `animate-fade-in` to the existing container. The pattern:

When `!loading` shows real content, add `animate-fade-in` class to the outermost container of that content. For example, if the code is:

```tsx
{loading ? (
  <div className="shimmer ..." />
) : (
  <div className="grid ...">  // ← add animate-fade-in here
```

Change to:
```tsx
  <div className="grid ... animate-fade-in">
```

Apply this pattern to: dashboard page (KPI section already has it via stagger), clients grid, staff grid, inventory summary cards, expenses summary cards, packages grid.

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/dashboard/clients/page.tsx src/app/dashboard/staff/page.tsx src/app/dashboard/inventory/page.tsx src/app/dashboard/expenses/page.tsx src/app/dashboard/packages/page.tsx
git commit -m "feat(motion): add fade-in transition when loading completes"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Full build check**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds, all pages compile

- [ ] **Step 2: Run existing tests**

Run: `npm test`
Expected: All existing tests pass (motion changes are CSS-only, shouldn't affect logic tests)

- [ ] **Step 3: Manual smoke test checklist**

Verify on localhost:3000:
- [ ] Dashboard: KPI cards stagger in, filter pills have press effect, chart animates
- [ ] Page navigation: cross-fade between routes (View Transitions)
- [ ] Clients: cards stagger in, hover lifts cards
- [ ] Staff: cards stagger in, hover lifts cards
- [ ] Inventory tabs: content fades on tab switch
- [ ] Settings tabs: content fades on tab switch
- [ ] New Appointment modal: opens with zoom-in
- [ ] Search bar: expands on focus
- [ ] All buttons: scale down on press
