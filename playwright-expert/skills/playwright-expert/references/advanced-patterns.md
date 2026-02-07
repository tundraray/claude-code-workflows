# Advanced Patterns

## Multi-Browser Context (Collaboration Testing)

Test real-time collaboration by running two users in the same test:

```typescript
test('two users see each other typing in shared doc', async ({ browser }) => {
  // Each context is an isolated browser session (separate cookies, storage)
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  // Both users join the same document
  await alicePage.goto('/docs/shared-123');
  await bobPage.goto('/docs/shared-123');

  // Alice types; Bob sees it
  await alicePage.getByRole('textbox', { name: 'Editor' }).fill('Hello from Alice');
  await expect(bobPage.getByText('Hello from Alice')).toBeVisible({
    timeout: 10_000, // Real-time sync has latency
  });

  await aliceContext.close();
  await bobContext.close();
});
```

**Failure mode**: Both contexts share the same browser process. If one page causes a browser crash (e.g., GPU OOM), both pages die. For true isolation, use `browser.newContext()` not `browser.newPage()`.

**Trade-off**: Multi-context tests are slower and harder to debug. The trace viewer shows actions from one context at a time. Use `test.step()` with user names to make traces readable.

## Multi-Tab and Popup Handling

```typescript
test('OAuth popup completes login', async ({ page }) => {
  // Start waiting for the popup BEFORE triggering it
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  const popup = await popupPromise;

  // Interact with the popup page
  await popup.waitForLoadState();
  await popup.getByLabel('Email').fill('user@gmail.com');
  await popup.getByRole('button', { name: 'Next' }).click();

  // Popup closes itself after auth; verify main page updated
  await expect(page.getByText('Welcome, user@gmail.com')).toBeVisible();
});

// New tabs opened via target="_blank"
test('external link opens in new tab', async ({ context, page }) => {
  const newTabPromise = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Documentation' }).click();
  const newTab = await newTabPromise;

  await newTab.waitForLoadState();
  await expect(newTab).toHaveURL(/docs\.example\.com/);
  await newTab.close();
});
```

**Failure mode**: If the popup is blocked by the browser's popup blocker, `waitForEvent('popup')` times out. Playwright disables the popup blocker by default, but some browser flags or extensions can re-enable it.

## `frameLocator()` for Iframes

```typescript
test('complete payment in Stripe iframe', async ({ page }) => {
  await page.goto('/checkout');

  // frameLocator returns a locator-like object scoped to the iframe
  const stripeFrame = page.frameLocator('iframe[name="stripe-card"]');

  // Interact with elements inside the iframe
  await stripeFrame.getByPlaceholder('Card number').fill('4242424242424242');
  await stripeFrame.getByPlaceholder('MM / YY').fill('12/30');
  await stripeFrame.getByPlaceholder('CVC').fill('123');

  // Back on the main page
  await page.getByRole('button', { name: 'Pay' }).click();
  await expect(page.getByText('Payment successful')).toBeVisible();
});

// Nested iframes
const outerFrame = page.frameLocator('#outer-iframe');
const innerFrame = outerFrame.frameLocator('#inner-iframe');
await innerFrame.getByRole('button', { name: 'Submit' }).click();
```

**Failure mode**: Cross-origin iframes have limited accessibility. If the iframe is from a different origin, you cannot access its DOM via `frameLocator()` in some security configurations. For third-party iframes (Stripe, reCAPTCHA), use their test/sandbox modes instead of trying to automate the real widget.

**Trade-off**: Iframes add significant test complexity and slowness. If you control the embedded content, consider testing it separately and using API mocking in the parent page test.

## File Upload and Download

```typescript
test('upload CSV and verify import results', async ({ page }) => {
  await page.goto('/import');

  // setInputFiles works on <input type="file"> elements
  await page.getByLabel('Upload CSV').setInputFiles('tests/fixtures/users.csv');

  // For drag-and-drop upload zones without a file input:
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('drop-zone').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('tests/fixtures/users.csv');

  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText('50 users imported')).toBeVisible();
});

test('download report and verify contents', async ({ page }) => {
  await page.goto('/reports');

  // Start waiting for download BEFORE clicking
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;

  // Verify filename
  expect(download.suggestedFilename()).toMatch(/report-.*\.csv/);

  // Save and read file contents
  const filePath = await download.path();
  // filePath is a temp path; read it to verify contents
  const fs = require('fs');
  const content = fs.readFileSync(filePath!, 'utf-8');
  expect(content).toContain('user@example.com');
});
```

**Failure mode**: `setInputFiles()` fails silently if the `<input type="file">` is hidden with `display: none` (common in styled upload components). Playwright handles `visibility: hidden` and `opacity: 0` but not `display: none`. Use `fileChooser` event approach for hidden inputs.

## Drag and Drop

```typescript
test('reorder items via drag and drop', async ({ page }) => {
  await page.goto('/kanban');

  const source = page.getByText('Task A');
  const target = page.getByText('Task C');

  // Built-in drag and drop (works for standard HTML drag events)
  await source.dragTo(target);

  // For custom drag implementations (e.g., react-beautiful-dnd):
  // The built-in dragTo may not work because libraries use custom
  // mouse event sequences. Use manual mouse events:
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2
  );
  await page.mouse.down();
  // Intermediate move triggers the library's drag detection threshold
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2 + 10
  );
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + targetBox!.height / 2
  );
  await page.mouse.up();
});
```

**Failure mode**: Many drag-and-drop libraries require a minimum drag distance before activating. The intermediate `mouse.move` step above is not optional. Without it, the library treats the interaction as a click, not a drag.

## Component Testing (`@playwright/experimental-ct-react`)

Test React components in isolation with a real browser (not jsdom):

```typescript
// component-tests/Button.spec.tsx
import { test, expect } from '@playwright/experimental-ct-react';
import { Button } from '../src/components/Button';

test('renders with correct variant styles', async ({ mount }) => {
  const component = await mount(
    <Button variant="primary" onClick={() => {}}>
      Click me
    </Button>
  );

  await expect(component).toBeVisible();
  await expect(component).toHaveCSS('background-color', 'rgb(59, 130, 246)');
});

test('calls onClick handler', async ({ mount }) => {
  let clicked = false;
  const component = await mount(
    <Button onClick={() => { clicked = true; }}>Click me</Button>
  );

  await component.click();
  expect(clicked).toBe(true);
});
```

**When NOT to use**: Component testing with Playwright is slower than React Testing Library (RTL) by 10-50x per test because it launches a real browser. Use it only when you need:
- Real CSS rendering (visual regression on components)
- Real browser APIs (IntersectionObserver, ResizeObserver)
- Cross-browser component behavior

For logic and interaction testing, RTL is faster and sufficient.

## API Testing (No Browser)

Use `APIRequestContext` as a standalone HTTP client:

```typescript
import { test, expect } from '@playwright/test';

// These tests run without launching a browser -- much faster
test.describe('API: Users', () => {
  test('create and retrieve user', async ({ request }) => {
    // Create
    const createRes = await request.post('/api/users', {
      data: { name: 'Alice', email: 'alice@test.com' },
    });
    expect(createRes.ok()).toBeTruthy();
    const user = await createRes.json();

    // Retrieve
    const getRes = await request.get(`/api/users/${user.id}`);
    expect(getRes.ok()).toBeTruthy();
    const fetched = await getRes.json();
    expect(fetched.name).toBe('Alice');

    // Cleanup
    await request.delete(`/api/users/${user.id}`);
  });
});
```

**When to use**: API smoke tests in the same repo as E2E tests, contract testing for frontend-backend integration, and test data setup validation. Do not build a full API test suite in Playwright if you already have a backend testing framework.

## `test.step()` for Trace Grouping

```typescript
test('end-to-end purchase flow', async ({ page }) => {
  await test.step('Browse and add to cart', async () => {
    await page.goto('/products');
    await page.getByRole('button', { name: 'Add to cart' }).first().click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');
  });

  await test.step('Checkout', async () => {
    await page.goto('/checkout');
    await page.getByLabel('Address').fill('123 Main St');
    await page.getByRole('button', { name: 'Continue' }).click();
  });

  // Steps can return values
  const orderId = await test.step('Payment', async () => {
    await page.getByLabel('Card').fill('4242424242424242');
    await page.getByRole('button', { name: 'Pay' }).click();
    const confirmation = page.getByTestId('order-id');
    await expect(confirmation).toBeVisible();
    return confirmation.textContent();
  });

  expect(orderId).toMatch(/^ORD-/);
});
```

## Parameterized / Data-Driven Tests

```typescript
const testCases = [
  { role: 'admin', canDelete: true, canEdit: true },
  { role: 'editor', canDelete: false, canEdit: true },
  { role: 'viewer', canDelete: false, canEdit: false },
];

for (const { role, canDelete, canEdit } of testCases) {
  test(`${role} has correct permissions`, async ({ page }) => {
    // Setup user with role via API (not UI)
    await page.request.post('/api/test/login-as', { data: { role } });
    await page.goto('/documents/1');

    if (canEdit) {
      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Edit' })).toBeHidden();
    }

    if (canDelete) {
      await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Delete' })).toBeHidden();
    }
  });
}
```

**Failure mode**: If one parameterized test fails, the test name includes the parameter value (e.g., "editor has correct permissions"), making it easy to identify. However, if the test data array changes frequently, test IDs change too, breaking CI trend tracking. Pin test IDs with `test.describe` or use stable identifiers.

**Trade-off**: Data-driven tests reduce code duplication but make individual test logic harder to follow. If different roles need fundamentally different test flows (not just visibility checks), separate test functions are clearer than complex conditionals inside a loop.
