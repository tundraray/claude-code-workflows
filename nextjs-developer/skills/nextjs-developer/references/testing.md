# Testing

> Next.js 14+ / React 19 App Router. Covers unit testing RSC, server actions, and E2E with Playwright.

## Vitest Configuration for App Router

Vitest is preferred over Jest for App Router projects. It has native ESM support, faster execution, and better TypeScript integration.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Separate server tests (Node env) from client tests (jsdom)
    environmentMatchGlobs: [
      ['**/*.server.test.ts', 'node'],     // Server Components, server actions
      ['**/*.client.test.tsx', 'jsdom'],    // Client Components
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
```

**If using Jest instead:**

```ts
// jest.config.ts
import nextJest from 'next/jest'

const createJestConfig = nextJest({ dir: './' })

export default createJestConfig({
  testEnvironment: 'jsdom',
  setupFilesAfterSetup: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Run server tests in Node environment
  projects: [
    {
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: ['**/*.server.test.ts'],
    },
    {
      displayName: 'client',
      testEnvironment: 'jsdom',
      testMatch: ['**/*.client.test.tsx'],
    },
  ],
})
```

## Testing Async Server Components

Server Components are async functions that return JSX. Test them by calling the function directly and inspecting the output.

```tsx
// app/posts/page.tsx
import { db } from '@/lib/db'

export default async function PostsPage() {
  const posts = await db.post.findMany({ orderBy: { createdAt: 'desc' } })

  return (
    <main>
      <h1>Posts</h1>
      <ul>
        {posts.map(post => (
          <li key={post.id} data-testid={`post-${post.id}`}>
            {post.title}
          </li>
        ))}
      </ul>
    </main>
  )
}
```

```tsx
// app/posts/page.server.test.ts
import { describe, it, expect, vi } from 'vitest'
import PostsPage from './page'

// Mock the database module
vi.mock('@/lib/db', () => ({
  db: {
    post: {
      findMany: vi.fn(),
    },
  },
}))

import { db } from '@/lib/db'

describe('PostsPage', () => {
  it('renders posts from database', async () => {
    // Arrange
    const mockPosts = [
      { id: '1', title: 'First Post', createdAt: new Date() },
      { id: '2', title: 'Second Post', createdAt: new Date() },
    ]
    vi.mocked(db.post.findMany).mockResolvedValue(mockPosts)

    // Act: call the async Server Component directly
    const result = await PostsPage()

    // Assert: inspect the JSX tree
    // For deeper inspection, render to HTML
    const { renderToString } = await import('react-dom/server')
    const html = renderToString(result)

    expect(html).toContain('First Post')
    expect(html).toContain('Second Post')
  })

  it('renders empty list when no posts', async () => {
    vi.mocked(db.post.findMany).mockResolvedValue([])

    const result = await PostsPage()
    const { renderToString } = await import('react-dom/server')
    const html = renderToString(result)

    expect(html).toContain('Posts')
    expect(html).not.toContain('<li')
  })
})
```

**Trade-off:** Direct function call testing is fast and isolated, but does not test hydration, streaming, or client-side behavior. Use E2E tests for those.

## Mocking `headers()`, `cookies()`, `fetch()`

### Mocking `headers()` and `cookies()`

```tsx
// app/dashboard/page.tsx
import { headers, cookies } from 'next/headers'

export default async function Dashboard() {
  const headersList = await headers()
  const cookieStore = await cookies()
  const locale = headersList.get('accept-language')?.split(',')[0] ?? 'en'
  const theme = cookieStore.get('theme')?.value ?? 'light'

  return <div data-theme={theme}>Locale: {locale}</div>
}
```

```tsx
// app/dashboard/page.server.test.ts
import { describe, it, expect, vi } from 'vitest'

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}))

import { headers, cookies } from 'next/headers'
import Dashboard from './page'

describe('Dashboard', () => {
  it('uses locale from headers and theme from cookies', async () => {
    // Mock headers() to return a Headers-like object
    vi.mocked(headers).mockResolvedValue(
      new Headers({ 'accept-language': 'de-DE,en;q=0.9' }) as any
    )

    // Mock cookies() to return a cookie store
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === 'theme') return { name: 'theme', value: 'dark' }
        return undefined
      }),
    } as any)

    const result = await Dashboard()
    const { renderToString } = await import('react-dom/server')
    const html = renderToString(result)

    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('Locale: de-DE')
  })
})
```

### Mocking `fetch()`

```tsx
// __tests__/data-fetching.server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Global fetch mock
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

it('fetches and caches data with correct options', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ posts: [{ id: '1', title: 'Test' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )

  const { getPosts } = await import('@/lib/api')
  const posts = await getPosts()

  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/posts'),
    expect.objectContaining({
      next: { tags: ['posts'], revalidate: 300 },
    })
  )
  expect(posts).toHaveLength(1)
})
```

## Testing Server Actions

Server actions are async functions. Test them by calling directly with FormData.

```tsx
// app/actions/post.ts
'use server'

import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { revalidateTag } from 'next/cache'

const CreatePostSchema = z.object({
  title: z.string().min(3),
  content: z.string().min(10),
})

export async function createPost(prevState: any, formData: FormData) {
  const session = await auth()
  if (!session) return { success: false, error: 'Unauthorized' }

  const parsed = CreatePostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  })

  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors }
  }

  await db.post.create({ data: { ...parsed.data, authorId: session.user.id } })
  revalidateTag('posts')
  return { success: true }
}
```

```tsx
// app/actions/post.server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: { post: { create: vi.fn() } },
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { revalidateTag } from 'next/cache'
import { createPost } from './post'

// Helper: build FormData from object
function buildFormData(data: Record<string, string>): FormData {
  const fd = new FormData()
  Object.entries(data).forEach(([k, v]) => fd.append(k, v))
  return fd
}

describe('createPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated users', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const result = await createPost(
      {},
      buildFormData({ title: 'Test', content: 'Test content here' })
    )

    expect(result).toEqual({ success: false, error: 'Unauthorized' })
    expect(db.post.create).not.toHaveBeenCalled()
  })

  it('returns validation errors for invalid input', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)

    const result = await createPost(
      {},
      buildFormData({ title: 'AB', content: 'short' }) // title too short, content too short
    )

    expect(result.success).toBe(false)
    expect(result.fieldErrors?.title).toBeDefined()
    expect(result.fieldErrors?.content).toBeDefined()
  })

  it('creates post and revalidates cache', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as any)
    vi.mocked(db.post.create).mockResolvedValue({ id: 'post-1' } as any)

    const result = await createPost(
      {},
      buildFormData({ title: 'Valid Title', content: 'Valid content that is long enough' })
    )

    expect(result).toEqual({ success: true })
    expect(db.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Valid Title',
        authorId: 'user-1',
      }),
    })
    expect(revalidateTag).toHaveBeenCalledWith('posts')
  })
})
```

## MSW for Server Components

Mock Service Worker intercepts `fetch()` at the network level. For Server Components, use the Node.js server (not the browser service worker).

```ts
// __tests__/msw/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('https://api.example.com/posts', () => {
    return HttpResponse.json([
      { id: '1', title: 'MSW Post', content: 'Mocked by MSW' },
    ])
  }),

  http.get('https://api.example.com/posts/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      title: `Post ${params.id}`,
      content: 'Detailed content',
    })
  }),
]
```

```ts
// __tests__/msw/server.ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

```ts
// vitest.setup.ts
import { server } from './__tests__/msw/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

```tsx
// app/posts/page.integration.test.ts
// This test uses real fetch() intercepted by MSW -- no manual mocking
import { describe, it, expect } from 'vitest'
import PostsPage from './page'

describe('PostsPage (MSW integration)', () => {
  it('renders posts from API', async () => {
    const result = await PostsPage()
    const { renderToString } = await import('react-dom/server')
    const html = renderToString(result)

    expect(html).toContain('MSW Post')
  })
})
```

**Trade-off:** MSW tests are more realistic (testing actual fetch behavior) but slower and harder to debug than direct mocks. Use MSW for integration tests, direct mocks for unit tests.

## Playwright E2E

### Configuration

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry', // Collect trace on failure for debugging
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],

  // Start Next.js dev server before tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // Next.js can be slow to start
  },
})
```

### Testing SSR Content

```ts
// e2e/blog.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Blog', () => {
  test('renders server-side content without JavaScript', async ({ page }) => {
    // Disable JS to verify SSR works
    await page.context().setJavaScriptEnabled(false)

    await page.goto('/blog')

    // Content should be visible even without JS (SSR)
    await expect(page.getByRole('heading', { name: 'Blog' })).toBeVisible()
    await expect(page.getByTestId('post-list')).not.toBeEmpty()
  })

  test('navigates between posts with client-side routing', async ({ page }) => {
    await page.goto('/blog')

    // Click a post link (client-side navigation via Next.js Link)
    await page.getByRole('link', { name: /first post/i }).click()

    // Verify URL changed without full page reload
    await expect(page).toHaveURL(/\/blog\//)
    await expect(page.getByRole('article')).toBeVisible()
  })
})
```

### Testing Server Actions via Forms

```ts
// e2e/create-post.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Create Post', () => {
  test.beforeEach(async ({ page }) => {
    // Login first (adjust to your auth flow)
    await page.goto('/login')
    await page.fill('[name=email]', 'test@example.com')
    await page.fill('[name=password]', 'password')
    await page.click('button[type=submit]')
    await page.waitForURL('/dashboard')
  })

  test('creates a post via server action', async ({ page }) => {
    await page.goto('/posts/new')

    await page.fill('[name=title]', 'E2E Test Post')
    await page.fill('[name=content]', 'This is content from an E2E test')
    await page.click('button[type=submit]')

    // Server action processes, revalidates, and redirects
    await expect(page).toHaveURL(/\/posts\//)
    await expect(page.getByText('E2E Test Post')).toBeVisible()
  })

  test('shows validation errors for invalid input', async ({ page }) => {
    await page.goto('/posts/new')

    await page.fill('[name=title]', 'AB') // Too short
    await page.click('button[type=submit]')

    // Validation error displayed (server action returns error, useActionState renders it)
    await expect(page.getByText(/at least 3/i)).toBeVisible()
  })
})
```

### Testing Loading and Streaming

```ts
// e2e/streaming.spec.ts
import { test, expect } from '@playwright/test'

test('shows loading state then content', async ({ page }) => {
  await page.goto('/dashboard')

  // loading.tsx or Suspense fallback should appear first
  const skeleton = page.getByTestId('dashboard-skeleton')
  // It may already have resolved, so check if it was ever visible OR content is present
  const content = page.getByTestId('dashboard-content')

  // Wait for actual content (streaming completes)
  await expect(content).toBeVisible({ timeout: 10000 })
})
```

## When NOT to Test

- **Next.js built-in behavior:** Do not test that `loading.tsx` shows during Suspense. That is framework behavior.
- **Static generation output:** Do not test the exact HTML structure of SSG pages. Test the data and logic.
- **Third-party library behavior:** Do not test that `next/image` optimizes images.
- **Route matching:** Do not test that `/blog/[slug]` matches `/blog/hello`. That is the framework's job.

Focus tests on: your data fetching logic, server action validation/authorization, component rendering with different data states, and user flows (E2E).

## Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ReferenceError: Request is not defined` | Server test running in jsdom | Use `environmentMatchGlobs` to run server tests in `node` |
| `Cannot find module 'next/headers'` | Missing Next.js module mocks | Mock `next/headers`, `next/cache`, `next/navigation` |
| Playwright tests flaky on CI | Next.js dev server slow to start | Increase `webServer.timeout`, use `next build && next start` in CI |
| Server action test passes but action fails in browser | Not testing with real FormData | Use `new FormData()` in tests, not plain objects |
| MSW handlers not intercepting | Server not started in setup | Ensure `server.listen()` is in `beforeAll` |
| Hydration mismatch in E2E but not unit tests | Unit tests skip hydration | Add E2E test with JS enabled to catch hydration issues |
