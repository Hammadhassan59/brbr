# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast, trust your instincts, and ship with confidence. Without them, vibe coding is just yolo coding. With tests, it's a superpower.

## Framework

**Vitest** v4 with **happy-dom** for DOM environment and **@testing-library/react** for component testing.

## Running Tests

```bash
npm test          # run all tests once
npx vitest        # watch mode
npx vitest run    # CI mode (no watch)
```

## Test Directory

All tests live in `test/` at the project root.

## Layers

- **Unit tests** (`test/*.test.ts`) — pure functions, utilities, stores. Fast, no DOM needed.
- **Component tests** (`test/*.test.tsx`) — React components with @testing-library/react. Uses happy-dom.
- **Integration tests** — test multi-component flows or API interactions.
- **E2e tests** — not yet set up. Consider Playwright when needed.

## Conventions

- File naming: `test/{module-name}.test.ts` or `.test.tsx`
- Use `describe` blocks grouped by function/component
- Use `it` with descriptive names: `it('rejects numbers not starting with 03-09')`
- Test real behavior with meaningful assertions, not just `expect(x).toBeDefined()`
- Import from vitest: `import { describe, it, expect } from 'vitest'`
