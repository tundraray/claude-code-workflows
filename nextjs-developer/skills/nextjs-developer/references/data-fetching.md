# Data Fetching

> Next.js 14+ / React 19. See `references/caching-architecture.md` for the full 4-layer cache deep dive.

## Caching Overview (Brief)

Next.js has 4 cache layers. Misunderstanding any layer causes "stale data" bugs.

1. **Request Memoization** -- `React.cache()` + `fetch()` dedup within a single render. Automatic for `fetch()`.
2. **Data Cache** -- `fetch()` results persisted between requests. Controlled via `cache` and `next.revalidate`.
3. **Full Route Cache** -- HTML + RSC Payload cached at build time for static routes.
4. **Router Cache** -- Client-side. 30 seconds for dynamic routes, 5 minutes for static. Cannot be disabled per-route.

See `references/caching-architecture.md` for invalidation strategies, opt-out patterns, and `unstable_cache`.

## `unstable_cache` for ORM Queries

`fetch()` caching does not apply to direct database calls (Prisma, Drizzle, raw SQL). Use `unstable_cache` to bring them into the Data Cache.

```tsx
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'

// Wrap ORM queries to opt into Data Cache with tags
const getPostsByAuthor = unstable_cache(
  async (authorId: string) => {
    return db.post.findMany({
      where: { authorId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    })
  },
  // Cache key parts: combined with args to form the full key
  ['posts-by-author'],
  {
    tags: ['posts'],        // For on-demand revalidation via revalidateTag('posts')
    revalidate: 300,        // Seconds. Fallback time-based revalidation.
  }
)

// Usage in Server Component
export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const posts = await getPostsByAuthor(id)  // Cached
  return <PostList posts={posts} />
}
```

**Trade-off:** `unstable_cache` is the only way to cache ORM queries in the Data Cache. The API is marked "unstable" but is widely used in production. Future versions may rename it to `cache` (from `next/cache`).

**When NOT to use:** Real-time data (chat, live scores), user-specific data that changes per request (shopping cart), or data behind authentication where stale reads are unacceptable.

## Request Deduplication

### Automatic: `fetch()` Within Single Render

React automatically deduplicates identical `fetch()` calls within a single server render. Two components calling `fetch('/api/user/123')` result in one network request.

**Scope:** Single render pass only. Does NOT dedup across different user requests.

```tsx
// Both components call the same URL -- only one fetch executes
// lib/api.ts
export async function getUser(id: string) {
  const res = await fetch(`https://api.example.com/users/${id}`)
  return res.json()
}

// components/user-name.tsx (Server Component)
export async function UserName({ id }: { id: string }) {
  const user = await getUser(id) // Deduped with UserAvatar's call
  return <span>{user.name}</span>
}

// components/user-avatar.tsx (Server Component)
export async function UserAvatar({ id }: { id: string }) {
  const user = await getUser(id) // Same URL, same render = deduped
  return <img src={user.avatar} alt={user.name} />
}
```

### Manual: `React.cache()` for Non-Fetch Functions

`fetch()` dedup is automatic. For ORM queries, use `React.cache()` for per-render dedup.

```tsx
import { cache } from 'react'
import { db } from '@/lib/db'

// Deduped within a single render pass
export const getCurrentUser = cache(async () => {
  const session = await auth()
  if (!session) return null
  return db.user.findUnique({ where: { id: session.userId } })
})

// Call from multiple Server Components -- only one DB query
```

**Limitation:** `React.cache()` is per-render only. It does NOT persist between requests. For cross-request caching of ORM queries, combine with `unstable_cache`.

## Router Cache: The 30-Second Rule

The client-side Router Cache stores previously visited routes. On client-side navigation (Link, router.push), Next.js uses the cached version.

- **Static routes:** Cached for 5 minutes
- **Dynamic routes:** Cached for 30 seconds

**This means:** After a server action revalidates data and the user navigates back to a page, they may still see stale data for up to 30 seconds.

```tsx
// Workaround: force revalidation on navigation
import { useRouter } from 'next/navigation'

const router = useRouter()
router.refresh() // Clears Router Cache for current route
```

**`router.refresh()` vs `revalidatePath()`:**
- `revalidatePath()` invalidates the server-side Data Cache and Full Route Cache
- `router.refresh()` clears the client-side Router Cache for the current page
- After a mutation, you often need both: `revalidatePath()` in the server action + client may still see stale data for 30s from Router Cache

## Patterns for Real-Time Data

### SWR + Server Components (Hybrid)

Server-render the initial data, then keep it fresh on the client.

```tsx
// app/dashboard/page.tsx (Server Component)
import { StatsPanel } from '@/components/stats-panel'

export default async function Dashboard() {
  // Server-rendered initial data -- fast first paint, SEO-friendly
  const initialStats = await getStats()

  return <StatsPanel initialData={initialStats} />
}

// components/stats-panel.tsx
'use client'

import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function StatsPanel({ initialData }: { initialData: Stats }) {
  const { data } = useSWR('/api/stats', fetcher, {
    fallbackData: initialData,    // Use server-rendered data as initial
    refreshInterval: 5000,         // Poll every 5 seconds
    revalidateOnFocus: true,       // Refresh when tab regains focus
  })

  return <div>{/* render data */}</div>
}
```

### Server-Sent Events (SSE) for Push Updates

```tsx
// app/api/events/route.ts
export const runtime = 'nodejs' // SSE requires Node.js runtime (not edge)

export async function GET(req: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial data
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true })}\n\n`))

      // Subscribe to changes (e.g., database listener, Redis pub/sub)
      const unsubscribe = subscribeToChanges((event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      })

      // Clean up when client disconnects
      req.signal.addEventListener('abort', () => {
        unsubscribe()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

**Trade-off: Polling vs SSE vs WebSocket**

| Approach | Latency | Complexity | Serverless-Compatible |
|----------|---------|------------|----------------------|
| SWR polling | 1-30s | Low | Yes |
| SSE | Sub-second | Medium | No (needs long-lived connection) |
| WebSocket | Real-time | High | No (use external service like Ably, Pusher) |

## Error Handling Pattern

```tsx
// lib/fetcher.ts
import 'server-only'

export async function fetchAPI<T>(
  path: string,
  options?: RequestInit & { tags?: string[]; revalidate?: number }
): Promise<T> {
  const { tags, revalidate, ...fetchOptions } = options ?? {}

  const res = await fetch(`${process.env.API_BASE_URL}${path}`, {
    ...fetchOptions,
    next: {
      ...(tags && { tags }),
      ...(revalidate !== undefined && { revalidate }),
    },
  })

  if (!res.ok) {
    // Throw to activate nearest error.tsx boundary
    // Include status for error boundary to differentiate
    throw new Error(`API error: ${res.status} ${res.statusText}`, {
      cause: { status: res.status, url: path },
    })
  }

  return res.json()
}

// Usage
export default async function Page() {
  // If this throws, error.tsx renders
  const posts = await fetchAPI<Post[]>('/posts', {
    tags: ['posts'],
    revalidate: 60,
  })

  return <PostList posts={posts} />
}
```

## Static Generation with `generateStaticParams`

```tsx
// app/blog/[slug]/page.tsx

export async function generateStaticParams() {
  const posts = await fetchAPI<Post[]>('/posts')
  return posts.map((post) => ({ slug: post.slug }))
}

// dynamicParams controls what happens for slugs NOT returned above:
// true (default): render on-demand and cache
// false: return 404
export const dynamicParams = true

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await fetchAPI<Post>(`/posts/${slug}`, {
    tags: [`post-${slug}`],
  })

  return <article>{/* render */}</article>
}
```

## When NOT to Fetch in Server Components

- **User-initiated data:** Search results, infinite scroll, filter changes -- use client-side fetching (SWR/React Query) with Route Handlers
- **Authenticated real-time data:** Chat, notifications -- use WebSocket/SSE on client
- **After client-side state change:** Data that depends on client state (selected tab, form input) -- fetch on client

## Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Data never updates | `fetch()` cached forever by default | Add `revalidate` or `cache: 'no-store'` |
| Data updates on server but stale on client navigation | Router Cache (30s rule) | Call `router.refresh()` or wait 30s |
| Same data fetched multiple times (perf) | Not using `React.cache()` for ORM calls | Wrap with `cache()` for per-render dedup |
| `unstable_cache` returns stale data after mutation | Missing `revalidateTag()` call | Add matching tag revalidation in server action |
| `generateStaticParams` builds too slowly | Fetching all items at build time | Limit to top N items, set `dynamicParams: true` for rest |
| `fetch` call not cached in development | Dev mode disables Data Cache by default | Expected behavior; test caching in production build |
