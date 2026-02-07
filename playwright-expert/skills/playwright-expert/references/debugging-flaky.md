# Debugging & Flaky Tests

## Systematic Flaky Test Analysis

Flakiness is a metric, not an anecdote. Track it before fixing it.

**Step 1: Measure flake rate per test.**

```bash
# Run suite 10 times and collect results
for i in {1..10}; do
  npx playwright test --reporter=json > "run-$i.json" 2>&1
done
# Parse results to find tests that sometimes pass, sometimes fail
```

**Step 2: Classify flaky tests by root cause.**

| Category | Signal | Typical Fix |
|----------|--------|-------------|
| Timing/race | Passes with `--workers=1`, fails parallel | Missing `await`, need `waitForResponse()` |
| Data dependency | Fails after other tests run | Incomplete test isolation |
| Animation/transition | Fails intermittently on click/assert | `animations: 'disabled'` or wait for stable state |
| Resource contention | Fails only in CI | Docker memory, CPU throttling, shared DB |
| Viewport/rendering | Fails on specific browser | Font rendering, viewport-dependent layout |

**Step 3: Quarantine, do not delete.**

```typescript
// Tag flaky tests so CI does not block on them
test('payment flow @flaky', async ({ page }) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/org/repo/issues/456',
  });
  // ...
});

// Run quarantined tests separately
// npx playwright test --grep @flaky       (only flaky)
// npx playwright test --grep-invert @flaky (skip flaky)
```

**Failure mode**: Quarantined tests that never get fixed. Set a policy: if a `@flaky` test is not fixed within 2 sprints, the team decides to fix or delete it. Zombie quarantine is worse than no quarantine.

## Soft Assertions

Collect multiple failures in a single test run instead of stopping at the first:

```typescript
test('dashboard displays all widgets correctly', async ({ page }) => {
  await page.goto('/dashboard');

  // Soft assertions continue execution even if they fail.
  // The test still fails at the end, but you see ALL failures at once.
  await expect.soft(page.getByTestId('revenue-widget')).toBeVisible();
  await expect.soft(page.getByTestId('users-widget')).toBeVisible();
  await expect.soft(page.getByTestId('orders-widget')).toContainText('Orders');
  await expect.soft(page.getByTestId('chart-widget')).toBeVisible();

  // Hard assertion for the critical path -- stop if this fails
  // because subsequent actions depend on this element
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();
});
```

**When NOT to use**: Do not use `expect.soft()` when subsequent test steps depend on the assertion being true. If step 3 clicks a button that step 2 asserts is visible, a soft assertion on step 2 causes step 3 to fail with a confusing error.

## `toPass()` Polling for Eventually-Consistent State

When the UI updates asynchronously and you need to retry a block of assertions:

```typescript
test('search results update after indexing', async ({ page }) => {
  // Create data via API (indexing takes ~2 seconds)
  await page.request.post('/api/products', {
    data: { name: 'Unique Widget XYZ' },
  });

  await page.goto('/search');
  await page.getByLabel('Search').fill('Unique Widget XYZ');

  // toPass() retries the entire block until it succeeds or times out.
  // Default interval: 250ms. Default timeout: inherits from expect.timeout.
  await expect(async () => {
    await page.getByRole('button', { name: 'Search' }).click();
    const results = page.getByTestId('search-results');
    await expect(results).toContainText('Unique Widget XYZ');
  }).toPass({
    timeout: 15_000,  // Eventually-consistent operations need longer
    intervals: [500, 1000, 2000], // Back off to avoid hammering
  });
});
```

**Failure mode**: `toPass()` retries the entire block, including actions like `click()`. If the action has side effects (e.g., creates a record on each click), you get duplicate data. Use `toPass()` only when repeated actions are idempotent.

## CI-Specific Failures (Passes Locally, Fails in CI)

### Timing / Resource Contention

CI machines are slower and share resources. Tests that barely pass locally will flake in CI.

```typescript
// Diagnosis: Run with tracing to compare timing
// Local: action takes 200ms, CI: action takes 1200ms
// Fix: Never rely on implicit timing. Use explicit waits.

// WRONG: Assumes modal animates open within default timeout
await page.getByRole('dialog').click();

// RIGHT: Wait for the specific state
await expect(page.getByRole('dialog')).toBeVisible();
await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click();
```

### Font Rendering

CI Linux containers use different fonts than macOS/Windows. Text metrics differ, causing layout shifts.

```typescript
// Fix: Install consistent fonts in Docker
// Dockerfile: RUN apt-get install -y fonts-liberation fonts-noto

// Or: Disable font-dependent assertions
// Instead of asserting pixel-perfect text position,
// assert text content and visibility.
```

### Timezone / Locale

CI machines default to UTC. Your local machine may be in a different timezone.

```typescript
// playwright.config.ts
use: {
  locale: 'en-US',
  timezoneId: 'America/New_York',
},
```

### Missing Browser Dependencies

```bash
# Diagnosis: Test fails with "browser closed unexpectedly"
# Fix: Use the official Docker image or install system deps
npx playwright install --with-deps chromium
```

## Trace Viewer Deep Analysis

Traces are the most powerful debugging tool. Learn to read them systematically.

```typescript
// Always enable in CI
use: { trace: 'retain-on-failure' },

// For local debugging of a specific test:
// npx playwright test tests/checkout.spec.ts --trace on
```

**What to check in the trace viewer (in order):**

1. **Action log** (left panel): Find the failing action. Check if the previous action completed successfully. Often the real bug is 2-3 steps before the failure.

2. **Before/After screenshots**: Compare the DOM state before and after each action. Look for unexpected modals, overlays, or loading states that block interaction.

3. **Network tab**: Check if API calls completed before the UI action. Sort by timing. Look for:
   - Requests that returned errors (red)
   - Requests that took unusually long
   - Requests that never completed (timeout)

4. **Console tab**: JavaScript errors often cause UI state corruption that manifests as flaky tests 5 steps later. Check for unhandled promise rejections.

5. **Selector playground**: Click on the failing locator to see what it resolved to. If it resolved to multiple elements, that is your bug.

## Custom Debug Attachments

Attach domain-specific debug data to test results:

```typescript
test('complex workflow', async ({ page }, testInfo) => {
  // Attach application state at a critical point
  const appState = await page.evaluate(() => {
    return JSON.stringify(window.__APP_STATE__, null, 2);
  });
  await testInfo.attach('app-state-before-submit', {
    body: appState,
    contentType: 'application/json',
  });

  // Attach a screenshot at a specific step (not just on failure)
  const screenshot = await page.screenshot();
  await testInfo.attach('pre-submit-screenshot', {
    body: screenshot,
    contentType: 'image/png',
  });

  // Attach network HAR for the test
  // (useful when trace: 'retain-on-failure' misses the passing case)
  await page.getByRole('button', { name: 'Submit' }).click();
});
```

**Trade-off**: Attachments increase artifact size. In CI with 1000 tests, attaching screenshots to every test generates gigabytes. Use sparingly: attach only in tests with known flakiness or complex workflows.

## `test.step()` for Trace Readability

Group logical phases in the trace viewer:

```typescript
test('checkout flow', async ({ page }) => {
  await test.step('Add items to cart', async () => {
    await page.goto('/products');
    await page.getByRole('button', { name: 'Add Widget' }).click();
    await page.getByRole('button', { name: 'Add Gadget' }).click();
  });

  await test.step('Fill shipping info', async () => {
    await page.goto('/checkout/shipping');
    await page.getByLabel('Address').fill('123 Main St');
    await page.getByRole('button', { name: 'Continue' }).click();
  });

  await test.step('Complete payment', async () => {
    await page.getByLabel('Card number').fill('4242424242424242');
    await page.getByRole('button', { name: 'Pay' }).click();
    await expect(page.getByText('Order confirmed')).toBeVisible();
  });
});
```

Steps appear as collapsible groups in the trace viewer, making it easy to jump to the failing phase in long tests.

## Retry Configuration for Different Failure Types

```typescript
// playwright.config.ts
export default defineConfig({
  retries: process.env.CI ? 2 : 0,
});

// Per-test: known infrastructure-level flakiness
test('depends on third-party widget loading', async ({ page }) => {
  // This test can retry because the third-party CDN is occasionally slow
  test.info().annotations.push({ type: 'retries', description: '3' });
  // ...
});
```

**Trade-off**: Retries mask real bugs. If a test passes on retry 2/3, it IS flaky and needs fixing. Use retries as a safety net in CI, not as a permanent solution. Track retry rate alongside flake rate. If retry rate exceeds 5%, the suite has a systemic problem.
