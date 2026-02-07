# CI/CD Advanced

## Sharding (`--shard=N/M`)

Split tests across multiple CI machines for linear speedup:

```yaml
# GitHub Actions matrix sharding
jobs:
  test:
    strategy:
      fail-fast: false  # Do not cancel other shards when one fails
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test --shard=${{ matrix.shard }}/4
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results-${{ matrix.shard }}
          path: test-results/
          retention-days: 7

  merge-reports:
    needs: test
    if: always()
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          path: all-results/
          pattern: test-results-*
          merge-multiple: true
      - run: npx playwright merge-reports --reporter=html ./all-results
      - uses: actions/upload-artifact@v4
        with:
          name: merged-report
          path: playwright-report/
```

**How sharding distributes tests**: Playwright hashes test file paths and assigns them to shards deterministically. Tests in the same file always run on the same shard. This means:
- Uneven file sizes cause uneven shard times. A 50-test file assigned to shard 1 makes that shard 5x slower than others.
- Fix: Break large test files into smaller ones (10-20 tests per file max).

**Optimal shard count**: `ceil(total_suite_time / target_shard_time)`. If your suite takes 20 minutes and you want 5-minute shards, use 4. Beyond 8-10 shards, coordination overhead (artifact upload/download, merge step) reduces the benefit.

**Trade-off**: Each shard installs browsers independently. With 4 shards, you download browsers 4 times. Use browser caching (see below) to mitigate.

## Docker Configuration

```dockerfile
# Minimal Playwright Docker setup
FROM mcr.microsoft.com/playwright:v1.48.0-noble

WORKDIR /app
COPY package*.json ./
RUN npm ci

# Copy test files and config
COPY playwright.config.ts ./
COPY tests/ ./tests/

# Browsers are pre-installed in the base image
# Do NOT run `npx playwright install` -- it's redundant and slow

CMD ["npx", "playwright", "test"]
```

```yaml
# docker-compose.yml for local CI simulation
services:
  playwright:
    build: .
    shm_size: '2gb'  # Prevent Chromium crashes from small /dev/shm
    environment:
      - CI=true
    volumes:
      - ./test-results:/app/test-results
      - ./playwright-report:/app/playwright-report
```

**Failure mode**: The Playwright Docker image tag must match your `@playwright/test` package version. Version mismatch causes "browser not found" errors. Pin both to the same version.

**Trade-off**: The full Playwright Docker image is ~2GB (includes all browsers). For CI, consider installing only the browser you test:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Install only Chromium and its system dependencies
RUN npx playwright install --with-deps chromium
COPY . .
CMD ["npx", "playwright", "test", "--project=chromium"]
```

This reduces image size to ~800MB and build time by 60%.

## Parallel Strategy: Workers vs Shards vs CI Matrix

| Strategy | Scope | When to Use |
|----------|-------|-------------|
| `workers` (in config) | Parallel tests within one machine | Default. Increase for faster single-machine runs. |
| `--shard` | Split test files across CI jobs | Suite > 10 min. Each shard is a separate CI job. |
| CI matrix (browser) | Run full suite per browser | Cross-browser coverage. Multiplies total time by browser count. |

**Combining strategies**: Use all three for maximum throughput:

```yaml
strategy:
  matrix:
    browser: [chromium, firefox]
    shard: [1, 2, 3]
steps:
  - run: npx playwright test --project=${{ matrix.browser }} --shard=${{ matrix.shard }}/3
```

This creates 6 parallel CI jobs (2 browsers x 3 shards). With `workers: 4` in config, each job runs 4 tests simultaneously.

**Trade-off**: 6 parallel jobs = 6x CI machine cost. Most teams start with `workers` only, add sharding when the suite exceeds 10 minutes, and add browser matrix when cross-browser bugs justify the cost.

## Artifact Management

```yaml
# Upload traces, screenshots, and videos only on failure
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: playwright-traces-${{ matrix.shard }}
    path: |
      test-results/**/trace.zip
      test-results/**/*.png
      test-results/**/*.webm
    retention-days: 14  # Balance storage cost vs debugging window
```

**Failure mode**: `if: failure()` skips artifact upload when the job is cancelled (e.g., `fail-fast: true`). Use `if: always()` if you need artifacts from cancelled jobs. But `always()` uploads artifacts even on success, increasing storage costs.

**Optimization**: Compress traces before upload. Trace files are already zip archives, but grouping them reduces artifact count:

```yaml
- run: tar czf traces.tar.gz test-results/**/trace.zip
  if: failure()
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: traces-${{ matrix.shard }}
    path: traces.tar.gz
```

## Cache Optimization

### Browser Binary Caching

```yaml
# Cache Playwright browsers to avoid re-downloading on every run
- name: Cache Playwright browsers
  uses: actions/cache@v4
  id: playwright-cache
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ hashFiles('package-lock.json') }}

- name: Install Playwright browsers
  if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps
```

**Failure mode**: If you update `@playwright/test` but the cache key does not change (e.g., same `package-lock.json` hash), the cache serves old browser binaries that are incompatible. The key above uses `package-lock.json` hash, which changes when the package version changes. This is correct.

### npm Cache

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: 'npm'  # Built-in npm caching
```

### Docker Layer Caching

```dockerfile
# Order layers from least to most frequently changed
FROM mcr.microsoft.com/playwright:v1.48.0-noble
WORKDIR /app

# Layer 1: Dependencies (changes rarely)
COPY package*.json ./
RUN npm ci

# Layer 2: Config (changes occasionally)
COPY playwright.config.ts ./
COPY tsconfig.json ./

# Layer 3: Test files (changes every commit)
COPY tests/ ./tests/
COPY pages/ ./pages/
```

## Flaky Test Quarantine

### Detection

```typescript
// custom-reporter.ts -- Track tests that pass on retry
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

class FlakyDetector implements Reporter {
  private flakyTests: string[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    // A test that passes on retry was flaky
    if (result.status === 'passed' && result.retry > 0) {
      this.flakyTests.push(test.titlePath().join(' > '));
    }
  }

  async onEnd() {
    if (this.flakyTests.length > 0) {
      console.log('\n--- FLAKY TESTS DETECTED ---');
      this.flakyTests.forEach(t => console.log(`  ${t}`));

      // Optional: Post to Slack, create GitHub issue, etc.
      if (process.env.SLACK_WEBHOOK) {
        await fetch(process.env.SLACK_WEBHOOK, {
          method: 'POST',
          body: JSON.stringify({
            text: `Flaky tests detected:\n${this.flakyTests.join('\n')}`,
          }),
        });
      }
    }
  }
}

export default FlakyDetector;
```

### Quarantine Workflow

```typescript
// playwright.config.ts
reporter: [
  ['html'],
  ['./custom-reporter.ts'],
],

// In test files, tag flaky tests:
test('intermittent payment timeout @flaky', async ({ page }) => {
  // ...
});
```

```yaml
# CI: Run stable and flaky tests separately
jobs:
  stable-tests:
    steps:
      - run: npx playwright test --grep-invert @flaky
      # This job gates the PR -- must pass

  flaky-tests:
    steps:
      - run: npx playwright test --grep @flaky
      # This job is informational -- does not block PR
    continue-on-error: true
```

**Policy**: Quarantined tests must have a linked issue. Review quarantine list weekly. If a test has been quarantined for more than 2 sprints without a fix, decide: fix it or delete it. Zombie quarantine is technical debt.

## PR Comment Integration

Post test results as a PR comment for visibility:

```typescript
// pr-comment-reporter.ts
import type { Reporter, FullResult, Suite } from '@playwright/test/reporter';
import { execSync } from 'child_process';

class PRCommentReporter implements Reporter {
  private passed = 0;
  private failed = 0;
  private flaky = 0;
  private failures: string[] = [];

  onTestEnd(test, result) {
    if (result.status === 'passed' && result.retry === 0) this.passed++;
    else if (result.status === 'passed' && result.retry > 0) this.flaky++;
    else if (result.status === 'failed') {
      this.failed++;
      this.failures.push(`- \`${test.titlePath().join(' > ')}\``);
    }
  }

  async onEnd(result: FullResult) {
    if (!process.env.CI || !process.env.GITHUB_TOKEN) return;

    const total = this.passed + this.failed + this.flaky;
    const status = this.failed > 0 ? 'FAIL' : 'PASS';
    const emoji = this.failed > 0 ? '**FAILED**' : 'Passed';

    let body = `## Playwright Results: ${emoji}\n\n`;
    body += `| Total | Passed | Failed | Flaky |\n`;
    body += `|-------|--------|--------|-------|\n`;
    body += `| ${total} | ${this.passed} | ${this.failed} | ${this.flaky} |\n\n`;

    if (this.failures.length > 0) {
      body += `### Failed Tests\n${this.failures.join('\n')}\n`;
    }

    // Use gh CLI to post comment (requires GITHUB_TOKEN)
    const prNumber = process.env.PR_NUMBER;
    if (prNumber) {
      const escapedBody = body.replace(/'/g, "'\\''");
      execSync(
        `gh pr comment ${prNumber} --body '${escapedBody}' --edit-last || ` +
        `gh pr comment ${prNumber} --body '${escapedBody}'`
      );
    }
  }
}

export default PRCommentReporter;
```

```yaml
# Pass PR number to the reporter
env:
  PR_NUMBER: ${{ github.event.pull_request.number }}
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Trade-off**: `--edit-last` updates an existing comment instead of creating a new one on each push. This keeps the PR clean but loses history. Without `--edit-last`, each push creates a new comment, which is noisy but preserves the full test result timeline.

## Recommended CI Workflow Structure

```yaml
name: E2E Tests
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30  # Kill stuck jobs
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - uses: actions/cache@v4
        id: pw-cache
        with:
          path: ~/.cache/ms-playwright
          key: pw-${{ hashFiles('package-lock.json') }}
      - if: steps.pw-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps
      - run: npx playwright test --shard=${{ matrix.shard }}/4
        env:
          CI: true
          BASE_URL: ${{ secrets.STAGING_URL }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: results-${{ matrix.shard }}
          path: test-results/
          retention-days: 7

  report:
    needs: test
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          path: all-results/
          pattern: results-*
          merge-multiple: true
      - run: npx playwright merge-reports --reporter=html ./all-results
      - uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```
