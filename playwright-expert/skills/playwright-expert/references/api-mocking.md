# API Mocking

## Modify-and-Forward Pattern

The most production-useful pattern: intercept real responses and tweak specific fields. Tests stay realistic while controlling the exact condition under test.

```typescript
test('shows discount badge when price is reduced', async ({ page }) => {
  await page.route('**/api/products/*', async (route) => {
    const response = await route.fetch();
    const product = await response.json();
    // Only override what the test needs; keep everything else real
    product.originalPrice = 100;
    product.currentPrice = 79;
    await route.fulfill({ json: product });
  });

  await page.goto('/products/123');
  await expect(page.getByTestId('discount-badge')).toContainText('21% off');
});
```

**Failure mode**: `route.fetch()` makes a real network request. If the backend is down, the test fails even though it "mocks." Use `route.fulfill()` with static data for full isolation; use `route.fetch()` + modify when you want partial realism.

## Mock Factories

Centralize mock data creation. Avoid copy-pasting JSON blobs across tests.

```typescript
// mocks/factories.ts
import { faker } from '@faker-js/faker';

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    role: 'member',
    createdAt: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function createMockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: faker.string.uuid(),
    name: faker.commerce.productName(),
    price: parseFloat(faker.commerce.price()),
    inStock: true,
    ...overrides,
  };
}

// Test uses factory with only the relevant override visible
test('shows out-of-stock message', async ({ page }) => {
  await page.route('**/api/products/*', (route) =>
    route.fulfill({ json: createMockProduct({ inStock: false }) })
  );
  await page.goto('/products/123');
  await expect(page.getByText('Out of Stock')).toBeVisible();
});
```

**Trade-off**: Faker generates random data per run. This catches edge cases (long names, special characters) but makes failures harder to reproduce. Pin `faker.seed(12345)` in `beforeEach` if reproducibility matters more than coverage breadth.

## Request Payload Validation

Verify the frontend sends the correct data, not just that it renders correctly:

```typescript
test('sends correct order payload', async ({ page }) => {
  let capturedPayload: unknown;

  await page.route('**/api/orders', async (route) => {
    capturedPayload = route.request().postDataJSON();
    await route.fulfill({ json: { id: 'order-1', status: 'created' } });
  });

  // Perform the UI action that triggers the API call
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect(page.getByText('Order confirmed')).toBeVisible();

  // Assert on what was sent, not just what was rendered
  expect(capturedPayload).toMatchObject({
    items: [{ productId: expect.any(String), quantity: 1 }],
    shippingMethod: 'standard',
  });
});
```

**When NOT to use**: Do not validate every field in every test. Focus on fields the test scenario specifically affects. Over-asserting on payloads creates brittle tests that break when unrelated fields are added.

## GraphQL Mocking by Operation Name

REST-style URL matching does not work for GraphQL (all requests hit `/graphql`). Match by operation name instead:

```typescript
test('displays user profile from GraphQL', async ({ page }) => {
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON();

    if (body.operationName === 'GetUserProfile') {
      return route.fulfill({
        json: {
          data: {
            user: { id: '1', name: 'Alice', avatarUrl: '/alice.jpg' },
          },
        },
      });
    }

    if (body.operationName === 'GetNotifications') {
      return route.fulfill({
        json: { data: { notifications: [] } },
      });
    }

    // Unmocked operations fail loudly so you know what to add
    return route.abort('failed');
  });

  await page.goto('/profile');
  await expect(page.getByText('Alice')).toBeVisible();
});
```

**Failure mode**: SPAs often fire multiple GraphQL operations on a single page load. If you mock only one and `route.continue()` the rest, the test depends on a live backend for those operations. Use `route.abort('failed')` for unmocked operations to surface missing mocks immediately.

## WebSocket Mocking

```typescript
test('receives real-time chat messages', async ({ page }) => {
  // Intercept WebSocket connections matching the URL pattern
  await page.routeWebSocket('**/ws/chat', (ws) => {
    ws.onMessage((message) => {
      const parsed = JSON.parse(message as string);
      if (parsed.type === 'join') {
        // Simulate server acknowledgment
        ws.send(JSON.stringify({ type: 'joined', room: parsed.room }));
      }
    });

    // Simulate an incoming message after a delay
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: 'message',
        from: 'Bob',
        text: 'Hello from the other side',
      }));
    }, 500);
  });

  await page.goto('/chat/room-1');
  await expect(page.getByText('Hello from the other side')).toBeVisible();
});
```

**Trade-off**: WebSocket mocks are stateful and timing-dependent. Unlike REST mocks where request/response pairs are independent, WebSocket mocks need to simulate a protocol (connect, messages, close). Keep the mock state machine minimal.

## Server-Sent Events (SSE) Mocking

SSE is an HTTP response with `text/event-stream` content type. Mock it as a regular route with streaming:

```typescript
test('displays live price updates via SSE', async ({ page }) => {
  await page.route('**/api/prices/stream', async (route) => {
    // SSE is just an HTTP response with specific content type
    const events = [
      'data: {"symbol":"AAPL","price":150.25}\n\n',
      'data: {"symbol":"AAPL","price":151.00}\n\n',
    ].join('');

    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: events,
    });
  });

  await page.goto('/prices');
  await expect(page.getByTestId('price-AAPL')).toContainText('151.00');
});
```

**Failure mode**: Real SSE connections stay open; this mock delivers all events at once. If your app depends on incremental arrival timing, this approach will not reproduce timing-dependent bugs. For those cases, use `page.evaluate()` to create a mock EventSource inside the page context.

## Middleware-Like Route Handler Chains

Use `route.continue()` to build layered interceptors (logging, auth injection, selective mocking):

```typescript
// Layer 1: Log all API requests (runs for every request)
await page.route('**/api/**', async (route) => {
  console.log(`[API] ${route.request().method()} ${route.request().url()}`);
  await route.fallback(); // Pass to next handler in chain
});

// Layer 2: Inject auth header for requests that need it
await page.route('**/api/**', async (route) => {
  await route.fallback({
    headers: {
      ...route.request().headers(),
      'Authorization': `Bearer ${testToken}`,
    },
  });
});

// Layer 3: Mock specific endpoint (most specific, registered last)
await page.route('**/api/feature-flags', (route) =>
  route.fulfill({ json: { darkMode: true, betaFeatures: false } })
);
```

**Key detail**: Use `route.fallback()` (not `route.continue()`) to pass to the next registered handler. `route.continue()` sends the request to the server, bypassing remaining handlers. `route.fallback()` passes to the next matching handler in the chain.

## HAR-Based Mocking

Record real API responses and replay them. Useful for complex APIs with many endpoints:

```typescript
// Record mode: run once against real backend, save responses
await page.routeFromHAR('tests/mocks/checkout-flow.har', {
  url: '**/api/**',
  update: true, // Records responses to the HAR file
});

// Playback mode: use in CI, no backend needed
await page.routeFromHAR('tests/mocks/checkout-flow.har', {
  url: '**/api/**',
  update: false,
  notFound: 'abort', // Fail loudly if a request isn't in the HAR
});
```

**Trade-off**: HAR files capture a snapshot of the API at recording time. They drift silently as the API evolves. Schedule periodic re-recording (weekly CI job) or the mocks become a liability. Also, HAR files can contain sensitive data (auth tokens, PII) -- scrub before committing.
