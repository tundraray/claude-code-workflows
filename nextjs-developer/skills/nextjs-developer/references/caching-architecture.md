# Caching Architecture

> Next.js 14+. The most misunderstood aspect of Next.js. Four cache layers, each with different scope, lifetime, and invalidation.

## The Four Cache Layers

```
Request Flow:

Browser ──→ Router Cache (client) ──→ Full Route Cache (server) ──→ Data Cache (server) ──→ Origin
                 │                          │                            │
            Client-side               HTML + RSC Payload            fetch() results
            30s dynamic               Built at build time         Persistent between
            5min static               Rebuilt on revalidation      requests
```

### Layer 1: Request Memoization

**Scope:** Single server render pass. **Lifetime:** Duration of one request. **Mechanism:** React deduplicates identical `fetch()` calls automatically.

```tsx
// Two components in the same render tree call the same URL.
// Only ONE network request is made.

// components/user-name.tsx
async function UserName({ id }: { id: string }) {
  const user = await fetch(`/api/users/${id}`).then(r => r.json()) // Request 1
  return <span>{user.name}</span>
}

// components/user-avatar.tsx
async function UserAvatar({ id }: { id: string }) {
  const user = await fetch(`/api/users/${id}`).then(r => r.json()) // Deduped with Request 1
  return <img src={user.avatar} />
}
```

**For non-fetch functions** (ORM queries, raw SQL), use `React.cache()`:

```tsx
import { cache } from 'react'

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } })
})
// Multiple calls to getUser('123') in the same render = one DB query
```

**When it does NOT work:**
- Different `fetch()` options (different headers, method, etc.) = different cache keys
- `React.cache()` does not persist between requests -- it is purely per-render
- POST requests are NOT deduplicated

### Layer 2: Data Cache

**Scope:** Server, persistent between requests. **Lifetime:** Until revalidated. **Mechanism:** `fetch()` results stored by URL + options.

```tsx
// Cached indefinitely (default behavior in Next.js 14)
// Next.js 15 changed default to NO caching
fetch('https://api.example.com/data')

// Explicitly cached with time-based revalidation
fetch('https://api.example.com/data', {
  next: { revalidate: 3600 } // Re-fetch after 1 hour
})

// Explicitly cached with tag for on-demand invalidation
fetch('https://api.example.com/posts', {
  next: { tags: ['posts'] }
})

// Opt out of Data Cache entirely
fetch('https://api.example.com/data', {
  cache: 'no-store'
})
```

**For ORM queries**, use `unstable_cache`:

```tsx
import { unstable_cache } from 'next/cache'

const getCachedPosts = unstable_cache(
  async (categoryId: string) => {
    return db.post.findMany({ where: { categoryId } })
  },
  ['posts'],                    // Key prefix
  { tags: ['posts'], revalidate: 300 }
)
```

**Stale-while-revalidate behavior:** After `revalidate` time expires, the NEXT request still gets the stale cached value. Revalidation happens in the background. The request AFTER that gets the fresh value. This means data can be up to 2x the revalidate interval old in the worst case.

### Layer 3: Full Route Cache

**Scope:** Server. **Lifetime:** Until revalidated or rebuilt. **Mechanism:** HTML + RSC Payload generated at build time for static routes.

A route is static if:
- No `cookies()`, `headers()`, `searchParams` usage
- No `cache: 'no-store'` fetch calls
- No `export const dynamic = 'force-dynamic'`

```tsx
// This page is STATIC: cached as HTML + RSC Payload at build time
export default async function About() {
  const content = await fetch('https://cms.example.com/about', {
    next: { revalidate: 3600 }
  }).then(r => r.json())

  return <div>{content.body}</div>
}

// This page is DYNAMIC: rendered on every request
export default async function Dashboard() {
  const session = await cookies() // Using cookies makes it dynamic
  return <div>Welcome {session.get('name')?.value}</div>
}
```

**Opt out:**
```tsx
export const dynamic = 'force-dynamic'  // Always render on request
// or
export const revalidate = 0             // Same effect
```

### Layer 4: Router Cache

**Scope:** Client browser. **Lifetime:** Session-based. **Mechanism:** Previously visited routes cached in browser memory.

```
Static routes:  cached for 5 minutes
Dynamic routes: cached for 30 seconds
Prefetched routes (Link hover): cached immediately
```

**This is why data "gets stuck" after navigation.** User navigates to `/posts`, sees fresh data. Navigates away. Comes back within 30 seconds. Sees the old data, even though `revalidatePath('/posts')` was called on the server.

**Invalidation:**

```tsx
// Client-side: clear Router Cache for current page
import { useRouter } from 'next/navigation'
const router = useRouter()
router.refresh()

// Server-side: revalidatePath/revalidateTag invalidate Data Cache + Full Route Cache
// BUT Router Cache on already-connected clients is NOT invalidated
// Those clients need to wait 30s or call router.refresh()
```

## Cache Invalidation Strategies

### Time-Based (Automatic)

```tsx
// Route segment level
export const revalidate = 3600 // All fetches in this page revalidate at 3600s

// Per-fetch level (more granular)
fetch(url, { next: { revalidate: 60 } })   // This fetch: 60s
fetch(url2, { next: { revalidate: 3600 } }) // This fetch: 1 hour
```

### On-Demand: `revalidateTag`

```tsx
// Tag fetches during data retrieval
const posts = await fetch('/api/posts', { next: { tags: ['posts'] } })
const post = await fetch(`/api/posts/${id}`, { next: { tags: ['posts', `post-${id}`] } })

// Invalidate in server action or route handler
import { revalidateTag } from 'next/cache'

export async function updatePost(id: string, data: PostData) {
  await db.post.update({ where: { id }, data })

  revalidateTag(`post-${id}`) // Invalidate this specific post
  revalidateTag('posts')      // Invalidate all post lists
}
```

### On-Demand: `revalidatePath`

```tsx
import { revalidatePath } from 'next/cache'

// Revalidate a specific page
revalidatePath('/posts/my-post')

// Revalidate all pages under a layout
revalidatePath('/posts', 'layout')

// Revalidate everything (nuclear option)
revalidatePath('/', 'layout')
```

**Trade-off:** `revalidateTag` is more precise (only affects tagged fetches). `revalidatePath` is simpler but broader (revalidates the entire route or layout tree). Prefer tags for granular control.

## Opt-Out Patterns

```tsx
// 1. Per-fetch: no caching
fetch(url, { cache: 'no-store' })

// 2. Per-route: force dynamic rendering
export const dynamic = 'force-dynamic'

// 3. Via noStore() import (marks the render as dynamic)
import { unstable_noStore as noStore } from 'next/cache'

export default async function Page() {
  noStore() // Entire page becomes dynamic
  const data = await getDataFromDB()
  return <div>{data}</div>
}
```

## Common Caching Patterns

### Pattern: CMS Content with Webhook Revalidation

```tsx
// app/blog/[slug]/page.tsx
export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await fetch(`${CMS_URL}/posts/${slug}`, {
    next: { tags: [`post-${slug}`, 'posts'] },
  }).then(r => r.json())

  return <article>{/* render */}</article>
}

// app/api/revalidate/route.ts — CMS webhook endpoint
import { revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const secret = request.headers.get('x-webhook-secret')
  if (secret !== process.env.CMS_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug, event } = await request.json()

  if (event === 'update' || event === 'publish') {
    revalidateTag(`post-${slug}`)
  }
  if (event === 'delete') {
    revalidateTag('posts') // Invalidate list pages
  }

  return Response.json({ revalidated: true })
}
```

### Pattern: User-Specific Data (No Caching)

```tsx
// lib/data.ts
import { cache } from 'react'
import { cookies } from 'next/headers'

// Per-render dedup via React.cache(), but NO persistent caching
// because user data changes per session
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return null

  return db.user.findUnique({ where: { id: decodeToken(token).userId } })
})
```

### Pattern: Expensive Computation with Cache

```tsx
import { unstable_cache } from 'next/cache'

// Cache the result of an expensive aggregation
const getDashboardStats = unstable_cache(
  async (orgId: string) => {
    // This runs once, then is cached for 5 minutes
    const [revenue, users, orders] = await Promise.all([
      db.order.aggregate({ where: { orgId }, _sum: { total: true } }),
      db.user.count({ where: { orgId } }),
      db.order.count({ where: { orgId, createdAt: { gte: lastMonth } } }),
    ])

    return { revenue: revenue._sum.total, users, orders }
  },
  ['dashboard-stats'],
  { tags: ['dashboard'], revalidate: 300 }
)
```

## Next.js 14 vs 15 Cache Defaults

| Behavior | Next.js 14 | Next.js 15 |
|----------|-----------|-----------|
| `fetch()` default | `force-cache` (cached) | `no-store` (NOT cached) |
| Route Handlers GET | Cached by default | NOT cached by default |
| Client Router Cache | 30s dynamic, 5min static | Same, but `staleTimes` config available |

**Next.js 15 migration:** If upgrading from 14, your app may suddenly make many more network requests because `fetch()` no longer caches by default. Add explicit `{ next: { revalidate: N } }` or `{ cache: 'force-cache' }` to fetches that should be cached.

## When NOT to Cache

- **User-specific data** (session, cart, preferences) -- cache causes data leaking between users
- **Real-time data** (chat, notifications, live scores) -- stale data is unacceptable
- **Security-sensitive data** (payment info, PII) -- cache increases exposure surface
- **Rapidly changing data** (stock prices, auction bids) -- stale-while-revalidate is too slow

## Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Data stuck after mutation | Missing `revalidateTag` / `revalidatePath` | Add revalidation in server action |
| Data fresh on reload but stale on navigation | Router Cache (30s client-side) | Use `router.refresh()` or accept 30s staleness |
| Data cached between different users | Caching user-specific data | Use `cache: 'no-store'` or `noStore()` for user data |
| `unstable_cache` not updating | Wrong tag in `revalidateTag()` | Ensure tag strings match exactly |
| Build takes forever | All pages statically generated | Limit `generateStaticParams`, set `dynamicParams: true` |
| Dev mode never caches | Expected: dev disables Data Cache | Test caching behavior with `next build && next start` |
| After Next.js 15 upgrade, app is slow | `fetch()` default changed to `no-store` | Add explicit cache options to all fetch calls |
