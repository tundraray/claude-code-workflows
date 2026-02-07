# Visual Testing

## `toHaveScreenshot()` with Production Options

The basic call is simple. The options are where decisions matter:

```typescript
test('product card renders correctly', async ({ page }) => {
  await page.goto('/products/123');

  // Disable animations before screenshotting to eliminate timing flakes
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await expect(page.getByTestId('product-card')).toHaveScreenshot(
    'product-card.png',
    {
      // Pixel diff threshold: 0.2 = 20% color difference per pixel.
      // Lower = stricter. 0.1 catches subtle color changes but flakes
      // on anti-aliasing differences between machines.
      threshold: 0.2,

      // Allow up to 50 pixels to differ. Absorbs sub-pixel rendering
      // variance without hiding real regressions.
      maxDiffPixels: 50,

      // Mask dynamic content that changes between runs
      mask: [
        page.getByTestId('timestamp'),
        page.getByTestId('user-avatar'),
        page.locator('.ad-banner'),
      ],

      // Freeze all CSS animations and transitions at their current state
      animations: 'disabled',
    }
  );
});
```

**Trade-off: `threshold` vs `maxDiffPixels` vs `maxDiffPixelRatio`**:
- `threshold` controls per-pixel color sensitivity. Use `0.2` as a starting point.
- `maxDiffPixels` caps absolute pixel count. Good for small, predictable variance.
- `maxDiffPixelRatio` caps percentage of total pixels. Better for different viewport sizes.
- Combine them: `threshold: 0.2, maxDiffPixels: 100` means "allow up to 100 pixels that differ by more than 20% color." Too loose and you miss real regressions. Too strict and you fight false positives daily.

## Full-Page vs Component Screenshots

```typescript
// Full page: captures the entire scrollable page
await expect(page).toHaveScreenshot('homepage-full.png', {
  fullPage: true,
  // Warning: fullPage screenshots are large and slow to compare.
  // Use only for landing pages or layouts where scroll position matters.
});

// Component: captures a specific element. Preferred in most cases.
await expect(page.getByTestId('pricing-table')).toHaveScreenshot(
  'pricing-table.png'
);

// Viewport-specific: test responsive breakpoints
test.use({ viewport: { width: 375, height: 812 } }); // iPhone dimensions
test('mobile nav renders correctly', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation')).toHaveScreenshot('mobile-nav.png');
});
```

**When NOT to use full-page screenshots**: Pages with infinite scroll, lazy-loaded images, or ads. The screenshot content varies per run. Use component screenshots instead.

## Baseline Management in CI

Baselines (expected screenshots) must be committed to version control. This creates workflow questions.

### Git LFS for Baseline Images

```bash
# .gitattributes
*.png filter=lfs diff=lfs merge=lfs -text

# Track baseline directory
git lfs track "tests/**/*.png"
```

**Trade-off**: Git LFS adds operational complexity (LFS server, CI config to pull LFS objects). For small suites (< 200 baselines), committing PNGs directly to git is simpler. For larger suites, LFS prevents repository bloat.

### Updating Baselines

```bash
# Update all baselines (after intentional UI changes)
npx playwright test --update-snapshots

# Update only specific tests
npx playwright test tests/visual/header.spec.ts --update-snapshots
```

**Workflow**: Create a dedicated CI job or PR check that runs visual tests. When baselines need updating:
1. Developer runs `--update-snapshots` locally
2. Commits new baselines
3. PR reviewers inspect the baseline diff (GitHub renders PNG diffs)
4. Merge only after visual review

**Failure mode**: Running `--update-snapshots` without reviewing the diffs. It silently accepts any regression. Always `git diff` the baseline images before committing.

### Platform-Specific Baselines

Rendering differs across operating systems (font hinting, anti-aliasing, subpixel rendering). Playwright handles this by storing per-platform baselines:

```
tests/
  visual/
    header.spec.ts
    header.spec.ts-snapshots/
      header-chromium-linux.png    # CI baseline (Linux Docker)
      header-chromium-darwin.png   # macOS local dev
      header-chromium-win32.png    # Windows local dev
```

**Best practice**: Generate baselines only on your CI platform (Linux Docker). Skip visual tests locally or accept that local baselines differ:

```typescript
test('header layout', async ({ page }, testInfo) => {
  // Skip visual comparison on non-CI platforms
  // Developers run visual tests to verify they work, not to compare baselines
  if (!process.env.CI) {
    test.skip();
    return;
  }
  await page.goto('/');
  await expect(page.getByRole('banner')).toHaveScreenshot('header.png');
});
```

**Trade-off**: Single-platform baselines are easier to manage but prevent developers from catching visual regressions locally. Multi-platform baselines are comprehensive but triple your baseline maintenance.

## Cross-Platform Rendering Differences

### The Font Problem

The number one cause of cross-platform visual test failures is font rendering. macOS, Windows, and Linux render the same font differently.

**Solution 1: Docker for consistency.**

```dockerfile
FROM mcr.microsoft.com/playwright:v1.48.0-noble
# Install the exact fonts your app uses
RUN apt-get update && apt-get install -y \
  fonts-liberation \
  fonts-noto-cjk \
  fonts-noto-color-emoji
```

**Solution 2: Web fonts only.** If your app uses only web fonts (loaded via CSS), rendering is more consistent because the font file itself is identical. System fonts (`sans-serif`, `Arial`) vary by OS.

### Anti-Aliasing

Different GPU drivers produce different anti-aliasing. Disable hardware acceleration in CI:

```typescript
use: {
  launchOptions: {
    args: ['--disable-gpu', '--font-render-hinting=none'],
  },
},
```

## Masking Dynamic Content

```typescript
// Mask by locator (preferred -- survives layout changes)
await expect(page).toHaveScreenshot('dashboard.png', {
  mask: [
    page.getByTestId('current-time'),
    page.getByTestId('notification-count'),
    page.locator('iframe'), // Third-party embeds
  ],
  // Mask color defaults to pink (#FF00FF) for visibility in diffs
  maskColor: '#808080', // Use gray to blend with background
});
```

**Alternative: Freeze dynamic content before screenshotting.**

```typescript
// Freeze clock to eliminate timestamp variations
await page.clock.setFixedTime(new Date('2024-01-15T10:00:00Z'));

// Replace avatar images with a stable placeholder
await page.route('**/avatars/**', (route) =>
  route.fulfill({
    contentType: 'image/png',
    path: 'tests/fixtures/placeholder-avatar.png',
  })
);
```

**Trade-off**: Masking hides areas from comparison entirely -- a regression inside a masked area is invisible. Freezing content (clock, images) preserves comparison coverage but requires more setup. Freeze when you can; mask as a last resort.

## Organizing Visual Tests

```typescript
// Separate visual tests from functional tests.
// Visual tests are slow, flaky, and need different CI treatment.
//
// tests/
//   e2e/          <- Functional tests
//   visual/       <- Visual regression tests
//     components/  <- Individual component screenshots
//     pages/       <- Full page screenshots

// playwright.config.ts
projects: [
  {
    name: 'functional',
    testDir: './tests/e2e',
  },
  {
    name: 'visual',
    testDir: './tests/visual',
    use: {
      // Consistent viewport for visual comparison
      viewport: { width: 1280, height: 720 },
    },
    // Run visual tests only on Chromium (reduces baseline count by 3x)
    use: { ...devices['Desktop Chrome'] },
    // Visual tests are inherently slower
    timeout: 45_000,
    expect: { timeout: 10_000 },
  },
],
```

**Trade-off**: Running visual tests on only one browser saves maintenance but misses browser-specific rendering bugs. For most teams, Chromium-only visual tests catch 90% of CSS regressions. Add Firefox/WebKit only if you have known cross-browser rendering issues.
