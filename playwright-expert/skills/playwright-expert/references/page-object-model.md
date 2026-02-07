# Page Object Model

## When NOT to Use POM

- **Smoke tests** (< 10 tests total): Direct page interaction is faster to write and maintain. POM adds indirection that is not worth it until patterns repeat.
- **One-off investigation scripts**: Throwaway debugging scripts do not benefit from abstraction.
- **Component tests**: `@playwright/experimental-ct-react` already scopes to a component. Adding a POM layer on top adds complexity with no benefit.
- **API-only tests**: `APIRequestContext` tests have no pages to model.

**Rule of thumb**: If you copy-paste the same locator into a third test, extract it into a page object.

## Abstract Base Page

Every page shares navigation, error handling, and common assertions. Extract once:

```typescript
// pages/BasePage.ts
import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  // Subclasses define their expected URL pattern for navigation verification
  abstract readonly pathPattern: RegExp;

  readonly toast: Locator;
  readonly spinner: Locator;

  constructor(protected page: Page) {
    this.toast = page.getByRole('alert');
    this.spinner = page.getByTestId('loading-spinner');
  }

  async waitForReady() {
    await expect(this.page).toHaveURL(this.pathPattern);
    await expect(this.spinner).toBeHidden();
  }

  async expectToast(message: string | RegExp) {
    await expect(this.toast).toContainText(message);
  }

  async expectNoConsoleErrors(action: () => Promise<void>) {
    const errors: string[] = [];
    this.page.on('pageerror', (err) => errors.push(err.message));
    await action();
    expect(errors).toEqual([]);
  }
}
```

**Trade-off**: Base pages create inheritance coupling. If different page types need different "ready" conditions, you end up overriding everything. Keep the base thin -- only truly universal behavior.

## State Machine Pattern: Typed Navigation

Page methods return the page object you land on, enforced by TypeScript. This catches navigation bugs at compile time.

```typescript
// pages/LoginPage.ts
export class LoginPage extends BasePage {
  readonly pathPattern = /\/login/;

  async login(email: string, password: string): Promise<DashboardPage> {
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Log in' }).click();
    const dashboard = new DashboardPage(this.page);
    await dashboard.waitForReady();
    return dashboard;
  }

  async loginExpectingError(email: string, password: string): Promise<LoginPage> {
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Log in' }).click();
    // Stay on login page; caller asserts error message
    return this;
  }
}

// pages/DashboardPage.ts
export class DashboardPage extends BasePage {
  readonly pathPattern = /\/dashboard/;

  async navigateToSettings(): Promise<SettingsPage> {
    await this.page.getByRole('link', { name: 'Settings' }).click();
    const settings = new SettingsPage(this.page);
    await settings.waitForReady();
    return settings;
  }
}
```

```typescript
// Usage in test: TypeScript prevents calling dashboard methods on login page
const dashboard = await loginPage.login('user@test.com', 'pass');
const settings = await dashboard.navigateToSettings();
// loginPage.navigateToSettings() -> TypeScript error
```

**Failure mode**: If a navigation is conditional (e.g., first-time user goes to onboarding, returning user goes to dashboard), a single return type breaks. Use a discriminated union or separate methods for each flow.

## Builder Pattern for Complex Forms

Multi-step forms with optional fields become unreadable with positional parameters:

```typescript
// pages/components/OrderFormBuilder.ts
export class OrderFormBuilder {
  constructor(private page: Page) {}

  private fields: Partial<OrderData> = {};

  withProduct(name: string, quantity: number) {
    this.fields.product = name;
    this.fields.quantity = quantity;
    return this;
  }

  withShipping(address: string, method: 'standard' | 'express' = 'standard') {
    this.fields.shippingAddress = address;
    this.fields.shippingMethod = method;
    return this;
  }

  withDiscount(code: string) {
    this.fields.discountCode = code;
    return this;
  }

  async submit(): Promise<ConfirmationPage> {
    // Step 1: Product
    await this.page.getByLabel('Product').selectOption(this.fields.product!);
    await this.page.getByLabel('Quantity').fill(String(this.fields.quantity!));
    await this.page.getByRole('button', { name: 'Next' }).click();

    // Step 2: Shipping (fills defaults if not set)
    if (this.fields.shippingAddress) {
      await this.page.getByLabel('Address').fill(this.fields.shippingAddress);
    }
    if (this.fields.shippingMethod === 'express') {
      await this.page.getByLabel('Express').check();
    }
    await this.page.getByRole('button', { name: 'Next' }).click();

    // Step 3: Optional discount
    if (this.fields.discountCode) {
      await this.page.getByLabel('Discount code').fill(this.fields.discountCode);
      await this.page.getByRole('button', { name: 'Apply' }).click();
    }

    await this.page.getByRole('button', { name: 'Place Order' }).click();
    const confirmation = new ConfirmationPage(this.page);
    await confirmation.waitForReady();
    return confirmation;
  }
}

// Test reads like a spec:
const confirm = await new OrderFormBuilder(page)
  .withProduct('Widget', 3)
  .withShipping('123 Main St', 'express')
  .withDiscount('SAVE10')
  .submit();
```

**When NOT to use**: Simple forms with 2-3 required fields. The builder adds indirection that obscures what the test is actually doing.

## API Shortcuts for Test Data Setup

UI-based setup is the slowest, most fragile part of E2E tests. Bypass it:

```typescript
// fixtures.ts
import { test as base, APIRequestContext } from '@playwright/test';

type ApiHelpers = {
  api: {
    createUser(overrides?: Partial<User>): Promise<User>;
    createOrg(owner: User): Promise<Organization>;
    seed(scenario: 'empty' | 'with-data' | 'large-dataset'): Promise<void>;
  };
};

export const test = base.extend<ApiHelpers>({
  api: async ({ request }, use) => {
    const created: string[] = []; // Track for cleanup

    const api = {
      async createUser(overrides = {}) {
        const res = await request.post('/api/test/users', {
          data: { email: `test-${Date.now()}@example.com`, ...overrides },
        });
        const user = await res.json();
        created.push(user.id);
        return user;
      },
      async createOrg(owner: User) {
        const res = await request.post('/api/test/orgs', {
          data: { ownerId: owner.id },
        });
        return res.json();
      },
      async seed(scenario: string) {
        await request.post(`/api/test/seed/${scenario}`);
      },
    };

    await use(api);

    // Cleanup everything this test created
    for (const id of created) {
      await request.delete(`/api/test/users/${id}`);
    }
  },
});
```

**Trade-off**: Requires test-only API endpoints in the backend. These must be gated behind environment checks (`NODE_ENV === 'test'`). The payoff is 10-50x faster test setup compared to UI flows.

**Failure mode**: If cleanup fails (e.g., network error during teardown), subsequent tests may see leftover data. Use unique identifiers (timestamps, UUIDs) in test data to prevent collisions even without cleanup.

## Worker-Scoped Fixtures

Some setup is too expensive to repeat per test (e.g., creating an organization with complex permissions). Share it across tests in the same worker:

```typescript
// fixtures.ts
type WorkerFixtures = {
  sharedOrg: Organization;
};

export const test = base.extend<{}, WorkerFixtures>({
  // Worker-scoped: created once, shared across all tests in this worker
  sharedOrg: [async ({ browser }, use) => {
    const context = await browser.newContext();
    const request = context.request;
    const res = await request.post('/api/test/orgs', {
      data: { name: `test-org-${process.pid}` },
    });
    const org = await res.json();

    await use(org);

    await request.delete(`/api/test/orgs/${org.id}`);
    await context.close();
  }, { scope: 'worker' }],
});
```

**Failure mode**: Worker-scoped fixtures share state across tests. If a test mutates the shared org (e.g., changes its name), subsequent tests see the mutation. Only use worker-scoped fixtures for read-only data or data that tests do not modify.

## Fixture Composition and Dependency Injection

Fixtures can depend on other fixtures, creating a dependency graph:

```typescript
type Fixtures = {
  adminUser: User;
  adminPage: AdminDashboardPage;
  memberUser: User;
};

export const test = base.extend<Fixtures>({
  adminUser: async ({ api }, use) => {
    const user = await api.createUser({ role: 'admin' });
    await use(user);
  },

  // adminPage depends on adminUser -- Playwright resolves the graph
  adminPage: async ({ page, adminUser }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(adminUser.email);
    await page.getByLabel('Password').fill(adminUser.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL(/admin/);
    await use(new AdminDashboardPage(page));
  },

  memberUser: async ({ api }, use) => {
    const user = await api.createUser({ role: 'member' });
    await use(user);
  },
});
```

**Failure mode**: Circular fixture dependencies cause a runtime error with an unhelpful message. If fixture A depends on B and B depends on A, Playwright hangs. Design fixtures as a DAG (directed acyclic graph).

## Screenplay Pattern (Alternative)

For teams that find POM too rigid, the Screenplay pattern models tests as actors performing tasks:

```typescript
// Not a full implementation -- just enough to evaluate the pattern.
// Actor performs Tasks (high-level), which use Interactions (low-level).
const actor = Actor.named('Alice').using(page);
await actor.attemptsTo(
  Login.withCredentials('alice@example.com', 'password'),
  Navigate.toSettings(),
  ChangeDisplayName.to('Alice Smith'),
);
await actor.asks(DisplayName.toBe('Alice Smith'));
```

**Trade-off vs POM**: Screenplay scales better for very large suites (100+ page objects) because tasks compose without inheritance. However, the abstraction layers make simple tests harder to read and debug. Most teams do not need it below 50+ page objects. Stick with POM unless you hit specific scaling pain.
