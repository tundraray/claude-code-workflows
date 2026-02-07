# Configuration

## Environment-Specific Configs

Use `dotenv` and config composition to avoid hardcoding URLs:

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment-specific .env file
// Priority: .env.local (developer overrides) > .env.{CI_ENVIRONMENT} > .env
const env = process.env.CI_ENVIRONMENT || 'local';
dotenv.config({ path: path.resolve(__dirname, `.env.${env}`) });
dotenv.config({ path: path.resolve(__dirname, '.env') }); // Fallback defaults

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? '50%' : undefined,

  use: {
    baseURL: process.env.BASE_URL,
    trace: process.env.CI ? 'retain-on-failure' : 'on',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
});
```

```ini
# .env
BASE_URL=http://localhost:3000

# .env.staging
BASE_URL=https://staging.example.com
API_KEY=stg_xxx

# .env.local (gitignored -- developer overrides)
BASE_URL=http://localhost:3001
```

**Trade-off**: `workers: '50%'` uses half the available CPU cores. Good default for CI where you share runners. Set to a fixed number (`workers: 4`) if your CI machine specs are consistent and you want deterministic timing.

## Timeout Strategies by Test Type

Different test categories have different timing profiles. One global timeout is wrong:

```typescript
export default defineConfig({
  // Global default: 30s per test
  timeout: 30_000,
  expect: { timeout: 5_000 },

  projects: [
    {
      name: 'smoke',
      testMatch: '**/smoke/**',
      timeout: 15_000, // Smoke tests must be fast
    },
    {
      name: 'e2e',
      testMatch: '**/e2e/**',
      timeout: 60_000, // Complex flows need more time
      use: {
        navigationTimeout: 15_000,
        actionTimeout: 10_000,
      },
    },
    {
      name: 'visual',
      testMatch: '**/visual/**',
      timeout: 45_000,
      expect: { timeout: 10_000 }, // Screenshot comparison is slower
    },
  ],
});
```

**Failure mode**: Setting `timeout: 120_000` to "fix" slow tests hides real performance regressions. Instead, investigate why the test is slow. If a test legitimately needs 2 minutes, isolate it in its own project with an explicit timeout.

## Authentication with Project Dependencies

The modern pattern uses a setup project instead of `globalSetup`:

```typescript
// tests/auth.setup.ts
import { test as setup, expect } from '@playwright/test';

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel('Password').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/dashboard/);

  // Persist auth state for dependent projects
  await page.context().storageState({
    path: 'playwright/.auth/admin.json',
  });
});

setup('authenticate as member', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.MEMBER_EMAIL!);
  await page.getByLabel('Password').fill(process.env.MEMBER_PASSWORD!);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.context().storageState({
    path: 'playwright/.auth/member.json',
  });
});
```

```typescript
// playwright.config.ts - projects section
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  {
    name: 'admin-tests',
    dependencies: ['setup'],
    use: { storageState: 'playwright/.auth/admin.json' },
    testMatch: '**/admin/**',
  },
  {
    name: 'member-tests',
    dependencies: ['setup'],
    use: { storageState: 'playwright/.auth/member.json' },
    testMatch: '**/member/**',
  },
  {
    name: 'anonymous-tests',
    // No dependencies, no storageState
    testMatch: '**/public/**',
  },
],
```

**Failure mode**: `storageState` persists cookies and localStorage. If auth tokens expire during the test run (long CI runs), later tests fail. Set token expiry longer than your max test suite duration, or re-authenticate in a fixture for long-running suites.

## Secrets Management

```typescript
// NEVER hardcode credentials in config or test files.
// Use environment variables injected by CI.

// playwright.config.ts
use: {
  baseURL: process.env.BASE_URL,
  httpCredentials: process.env.HTTP_AUTH ? {
    username: process.env.HTTP_USER!,
    password: process.env.HTTP_PASS!,
  } : undefined,
},

// In CI (GitHub Actions):
// Store secrets in repository settings, reference in workflow
```

```yaml
# .github/workflows/test.yml
env:
  BASE_URL: ${{ secrets.STAGING_URL }}
  ADMIN_EMAIL: ${{ secrets.ADMIN_EMAIL }}
  ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
```

**Failure mode**: `.env.local` files accidentally committed to git. Add `*.local` and `playwright/.auth/` to `.gitignore` immediately when setting up the project.

## Custom Reporters

```typescript
// reporters/test-rail-reporter.ts
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

class TestRailReporter implements Reporter {
  private results: Map<string, string> = new Map();

  onTestEnd(test: TestCase, result: TestResult) {
    // Map Playwright test title to TestRail case ID via annotation
    const caseId = test.annotations.find(a => a.type === 'testrail')?.description;
    if (caseId) {
      this.results.set(caseId, result.status === 'passed' ? '1' : '5');
    }
  }

  async onEnd() {
    // Batch upload results to TestRail API
    if (this.results.size > 0 && process.env.TESTRAIL_API_KEY) {
      await fetch(`${process.env.TESTRAIL_URL}/api/v2/add_results`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.TESTRAIL_API_KEY}` },
        body: JSON.stringify(
          [...this.results.entries()].map(([caseId, statusId]) => ({
            case_id: caseId,
            status_id: statusId,
          }))
        ),
      });
    }
  }
}

export default TestRailReporter;
```

```typescript
// playwright.config.ts
reporter: [
  ['html'],
  ['./reporters/test-rail-reporter.ts'],
  // Allure (via npm package):
  // ['allure-playwright'],
],
```

```typescript
// Annotate tests with TestRail case ID
test('user can reset password', async ({ page }) => {
  test.info().annotations.push({ type: 'testrail', description: 'C12345' });
  // ...
});
```

## Sharding Configuration

Split tests across multiple CI machines for linear speedup:

```typescript
// playwright.config.ts
export default defineConfig({
  // fullyParallel within each shard; sharding splits across CI jobs
  fullyParallel: true,
  // Workers per shard machine -- tune based on CI machine vCPU count
  workers: process.env.CI ? 4 : undefined,
});
```

```yaml
# CI matrix sharding
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: npx playwright test --shard=${{ matrix.shard }}/4
```

**Trade-off**: More shards = faster wall clock time but more CI machine cost. Optimal shard count is `total_test_time / target_wall_time`. If your suite takes 20 min on one machine and you want 5 min, use 4 shards. Beyond that, coordination overhead dominates.

## Docker-Optimized Configuration

```typescript
// playwright.config.ts -- Docker-specific tweaks
export default defineConfig({
  use: {
    // Docker containers often lack GPU; disable compositing
    launchOptions: {
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage', // Use /tmp instead of /dev/shm
        '--no-sandbox',
      ],
    },
  },
  // In Docker, use fixed worker count (no CPU detection in cgroups v1)
  workers: 2,
});
```

```dockerfile
FROM mcr.microsoft.com/playwright:v1.48.0-noble
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Browsers are pre-installed in the base image
CMD ["npx", "playwright", "test"]
```

**Failure mode**: `--disable-dev-shm-usage` prevents crashes in containers with small `/dev/shm` (default 64MB in Docker). Without it, Chromium crashes silently on pages with many images. Alternative: mount `--shm-size=1gb` on the container.

## Monorepo Shared Config

```typescript
// packages/playwright-config/base.config.ts
import { defineConfig } from '@playwright/test';

export const baseConfig = defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html'], ['json', { outputFile: 'results.json' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
```

```typescript
// apps/web/playwright.config.ts
import { defineConfig, mergeConfig } from '@playwright/test';
import { baseConfig } from '@repo/playwright-config/base.config';

export default mergeConfig(baseConfig, defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
}));
```

**Trade-off**: Shared config ensures consistency but reduces flexibility. If one app needs fundamentally different settings (e.g., mobile-only testing), the shared base becomes a constraint. Keep the base minimal and let apps override liberally.
