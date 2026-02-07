# Selectors & Locators

## Selector Strategy for Legacy Codebases

When inheriting a codebase without semantic HTML, follow this priority chain. Stop at the first that works reliably:

1. `getByRole()` - Works if the element has implicit or explicit ARIA roles
2. `getByLabel()` - Works if form fields have associated `<label>` elements
3. `getByPlaceholder()` - Fallback for inputs without labels (advocate fixing the HTML)
4. `getByTestId()` - Add `data-testid` attributes; zero runtime cost, survives refactors
5. `locator('css=...')` - Use structural selectors (`nth-child`, `+`, `~`) not class names
6. `locator('xpath=...')` - Last resort for complex DOM traversal; document why CSS failed

**Trade-off**: Adding `data-testid` attributes requires application code changes. If the team resists, negotiate adding them only to interactive elements (buttons, inputs, links). This covers 80% of test needs with minimal churn.

## Filtering and Chaining for Complex UIs

```typescript
// Problem: Multiple cards with identical "Delete" buttons.
// Solution: Scope by parent content, not by index.
const productCard = page.getByRole('listitem').filter({
  has: page.getByText('Premium Plan'),
});
await productCard.getByRole('button', { name: 'Delete' }).click();

// Problem: Need the row that does NOT have a "Completed" badge.
const pendingRow = page.getByRole('row').filter({
  hasNot: page.getByText('Completed'),
});

// Problem: Dynamic list where order changes between runs.
// WRONG: page.getByRole('listitem').nth(2)
// RIGHT: Filter by unique content, never by index.
```

**Failure mode**: `filter({ hasText: '...' })` matches substrings. If cards contain "Premium" and "Premium Plus", both match `hasText: 'Premium'`. Use `hasText: /^Premium$/` for exact matching.

## Custom Selectors for Domain-Specific Queries

Register custom selector engines when standard locators create noise:

```typescript
// fixtures.ts - Register once, use everywhere.
// Useful when your app uses a design system with custom attributes
// like `data-component="Button"` or `data-state="loading"`.
import { selectors } from '@playwright/test';

await selectors.register('component', () => ({
  query(root: HTMLElement, selector: string) {
    return root.querySelector(`[data-component="${selector}"]`);
  },
  queryAll(root: HTMLElement, selector: string) {
    return Array.from(root.querySelectorAll(`[data-component="${selector}"]`));
  },
}));

// Usage in tests:
await page.locator('component=DatePicker').click();
```

**When NOT to use**: Do not register custom selectors for one-off queries. The registration is global and persists for the worker lifetime. Use them only when the same pattern repeats across 10+ tests.

**Failure mode**: Custom selectors registered after `browser.newPage()` will not apply to pages already created. Register in a `beforeAll` or fixture setup.

## Shadow DOM

Playwright pierces open Shadow DOM by default. This is usually what you want.

```typescript
// This works through shadow boundaries automatically:
await page.getByRole('button', { name: 'Submit' }).click();

// When you explicitly need light DOM only (rare):
// Useful when shadow DOM contains duplicate elements and you
// need to target only the light DOM host element.
await page.locator('css:light=.host-element').click();

// Accessing a specific shadow root explicitly:
await page.locator('my-component').locator('internal:shadow=button').click();
```

**Failure mode**: Closed Shadow DOM (`mode: 'closed'`) is not pierceable. If you control the component, open it in test builds. If you do not, you need `page.evaluate()` to reach inside, which bypasses auto-waiting.

**Trade-off**: Piercing shadow DOM means your selectors are coupled to component internals. If the design system team renames internal elements, your tests break. Prefer `getByRole()` which works through shadow boundaries based on accessibility tree, not DOM structure.

## Framework-Specific Selectors (Experimental)

```typescript
// React: Select by component name and props.
// Requires React DevTools protocol; works only in development builds.
await page.locator('_react=BookItem[author="Orwell"]').click();

// Vue: Similar syntax for Vue components.
await page.locator('_vue=BookItem[author="Orwell"]').click();
```

**When NOT to use**: These are experimental and tied to development builds. Never use in CI against production bundles (component names are minified). Use only for local debugging or development-mode test runs.

**Trade-off**: Extremely precise targeting vs. fragile coupling to component naming. A refactor that renames `BookItem` to `BookCard` silently breaks all selectors with no compile-time warning.

## Non-Obvious `getByRole` Behaviors

```typescript
// `name` option matches accessible name, which includes aria-label,
// aria-labelledby, <label>, visible text, and title attribute (in that order).
// This means a button with aria-label="Close" won't match { name: 'X' }
// even if 'X' is the visible text.

// Checkboxes: Use `checked` filter to distinguish state.
await page.getByRole('checkbox', { name: 'Agree', checked: true });

// Expanded/collapsed controls:
await page.getByRole('button', { name: 'Menu', expanded: false }).click();

// Tables: getByRole('row') only matches <tr> in <tbody> by default.
// Headers in <thead> need getByRole('row') scoped to a header group,
// or use getByRole('columnheader').

// ARIA roles on divs: If your app uses role="button" on a div,
// getByRole('button') WILL match it. This can cause unexpected duplicates
// when the same label exists on both a real <button> and a div[role="button"].
```

## Locator Strictness

Playwright throws if a locator matches multiple elements (strict mode). This is intentional and prevents tests from silently clicking the wrong element.

```typescript
// If this matches 3 buttons, the test fails immediately with:
// "strict mode violation: getByRole('button') resolved to 3 elements"
await page.getByRole('button', { name: 'Save' }).click();

// Fix: Add more context to narrow down.
await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

// When you intentionally want all matches (e.g., counting):
const count = await page.getByRole('listitem').count(); // No strict error
await expect(page.getByRole('listitem')).toHaveCount(5); // No strict error
```

**Failure mode**: `filter()` returns a locator that can still match multiple elements. If the filtered set has 2+ matches, strict mode still triggers on action methods. Always verify with `count()` during development.
