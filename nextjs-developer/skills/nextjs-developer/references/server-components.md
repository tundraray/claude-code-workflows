# React Server Components

> Next.js 14+ / React 19. Components are server by default.

## `"use client"` Semantics

`"use client"` does NOT mean "this component runs on the client." It marks the **entry point to the client module graph**. Everything imported by a `"use client"` file also becomes client code, even if those files do not have the directive.

```tsx
// components/dashboard.tsx
'use client'

// Both of these become client modules, even without 'use client' in their files
import { Chart } from './chart'
import { formatDate } from './utils'
```

**Implication:** Place `"use client"` as deep in the tree as possible. A `"use client"` at the top of your component tree makes EVERYTHING client-side.

## Import Guards: `server-only` / `client-only`

Prevent accidental import across boundaries. These packages throw build-time errors.

```bash
npm install server-only client-only
```

```tsx
// lib/db.ts — must never be imported in client code
import 'server-only'
import { PrismaClient } from '@prisma/client'

export const db = new PrismaClient()

// hooks/use-local-storage.ts — must never be imported in server code
import 'client-only'

export function useLocalStorage(key: string) {
  // ...
}
```

**Failure mode without guards:** Database credentials bundled into client JavaScript. No build error, no runtime error -- just leaked secrets. Use `server-only` on every file that touches secrets, databases, or internal APIs.

## Serialization Boundary

Data passed from Server Components to Client Components must be serializable by React. This is the RSC payload boundary.

### What Does NOT Serialize

```
Date        -> passes as ISO string, but loses Date methods
Map / Set   -> ERROR: not serializable
RegExp      -> ERROR: not serializable
Function    -> ERROR: not serializable (except Server Actions)
Class       -> loses prototype, becomes plain object
Error       -> serializes message only, loses stack
undefined   -> silently dropped from objects
```

### Production Pattern: Transform at Boundary

```tsx
// app/page.tsx (Server Component)
import { UserCard } from '@/components/user-card' // 'use client'

export default async function Page() {
  const user = await db.user.findUnique({
    where: { id: '1' },
    select: { id: true, name: true, createdAt: true, roles: true },
  })

  // Transform non-serializable data BEFORE passing to client
  return (
    <UserCard
      user={{
        ...user,
        createdAt: user.createdAt.toISOString(),  // Date -> string
        roles: Array.from(user.roles),             // Set -> array (if applicable)
      }}
    />
  )
}
```

**Diagnosis:** If you see `Error: Only plain objects, and a few built-ins, can be passed to Client Components` -- check for Date objects, Maps, Sets, or class instances crossing the boundary.

## Composition Pattern: Server Children in Client Parents

Client Components can render Server Components passed as `children` or any React node prop. The server content is pre-rendered and streamed in.

```tsx
// components/tabs.tsx
'use client'
import { useState } from 'react'

export function Tabs({
  tabOne,
  tabTwo,
}: {
  tabOne: React.ReactNode  // Server-rendered content
  tabTwo: React.ReactNode
}) {
  const [active, setActive] = useState(0)

  return (
    <div>
      <nav>
        <button onClick={() => setActive(0)}>Tab 1</button>
        <button onClick={() => setActive(1)}>Tab 2</button>
      </nav>
      {/* Server Components rendered on server, hydrated here */}
      {active === 0 ? tabOne : tabTwo}
    </div>
  )
}

// app/page.tsx (Server Component)
import { Tabs } from '@/components/tabs'
import { ExpensiveServerList } from '@/components/server-list'
import { AnotherServerWidget } from '@/components/server-widget'

export default async function Page() {
  return (
    <Tabs
      tabOne={<ExpensiveServerList />}  // Fetches data on server
      tabTwo={<AnotherServerWidget />}  // Also server-rendered
    />
  )
}
```

**When NOT to use this pattern:** When the client component needs to control when/whether the server content renders conditionally at runtime. Server content is always pre-rendered regardless of client state.

## Suspense Strategies

### Cascading Suspense (Sequential Loading)

Each boundary waits for the previous. Use when content depends on prior content being visible (e.g., header, then body, then comments).

```tsx
export default function Page() {
  return (
    <Suspense fallback={<HeaderSkeleton />}>
      <Header />
      <Suspense fallback={<ContentSkeleton />}>
        <Content />
        <Suspense fallback={<CommentsSkeleton />}>
          <Comments />
        </Suspense>
      </Suspense>
    </Suspense>
  )
}
```

### Parallel Suspense (Independent Loading)

Each section loads independently. Use for dashboard-style layouts where sections are unrelated.

```tsx
export default function Dashboard() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* These stream independently -- fast sections appear first */}
      <Suspense fallback={<ChartSkeleton />}>
        <RevenueChart />
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <RecentOrders />
      </Suspense>
      <Suspense fallback={<StatsSkeleton />}>
        <UserStats />
      </Suspense>
    </div>
  )
}
```

**Trade-off:** More Suspense boundaries = more granular loading UX, but more layout shift. Fewer boundaries = less shift, but slower perceived load. Group related content under one boundary.

### Avoiding Suspense Waterfalls

```tsx
// BAD: Sequential fetches inside nested components
async function Parent() {
  const user = await getUser()        // 200ms
  return <Child userId={user.id} />   // Child then fetches posts: 200ms
}                                      // Total: 400ms

// GOOD: Parallel fetch with Promise, render with Suspense
async function Parent() {
  const userPromise = getUser()
  const postsPromise = getPosts()

  return (
    <>
      <Suspense fallback={<UserSkeleton />}>
        <UserCard promise={userPromise} />
      </Suspense>
      <Suspense fallback={<PostsSkeleton />}>
        <PostsList promise={postsPromise} />
      </Suspense>
    </>
  )
}
```

## Partial Prerendering (PPR)

> Next.js 15+ experimental. Combines static shell with dynamic holes in a single HTTP response.

Static parts are served from CDN instantly. Dynamic parts stream in via Suspense boundaries.

```tsx
// next.config.ts
const config = {
  experimental: {
    ppr: 'incremental', // Enable per-route
  },
}

// app/product/[id]/page.tsx
export const experimental_ppr = true

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getProduct(id)  // Static: cached at build

  return (
    <div>
      {/* Static shell: product info, images, description */}
      <h1>{product.name}</h1>
      <ProductImages images={product.images} />

      {/* Dynamic hole: personalized recommendations stream in */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <PersonalizedRecommendations userId={getCurrentUserId()} />
      </Suspense>

      {/* Dynamic hole: live inventory */}
      <Suspense fallback={<span>Checking stock...</span>}>
        <InventoryStatus productId={id} />
      </Suspense>
    </div>
  )
}
```

**Trade-off:** PPR gives near-static TTFB with dynamic content. But it requires careful Suspense boundary placement -- every dynamic section needs its own boundary. If your page is mostly dynamic, PPR adds complexity for minimal gain.

**When NOT to use PPR:** Fully static pages (regular SSG is simpler), fully dynamic pages (SSR is more straightforward), or pages where the "static shell" is trivial.

## RSC Payload Optimization

The RSC payload is the serialized representation of Server Component output sent to the client for hydration and client-side navigation.

### Keep the Payload Small

```tsx
// BAD: Passing entire database record with 30 fields
const product = await db.product.findUnique({ where: { id } })
return <ProductCard product={product} />  // Entire row in RSC payload

// GOOD: Select only what the component needs
const product = await db.product.findUnique({
  where: { id },
  select: { id: true, name: true, price: true, imageUrl: true },
})
return <ProductCard product={product} />
```

### Avoid Rendering Large Lists Without Pagination

Every item in a server-rendered list becomes part of the RSC payload. 1000 items = large payload on every navigation.

```tsx
// BAD: All items in payload
const allProducts = await db.product.findMany()
return allProducts.map(p => <ProductCard key={p.id} product={p} />)

// GOOD: Paginated with cursor, only current page in payload
const products = await db.product.findMany({
  take: 20,
  cursor: cursor ? { id: cursor } : undefined,
})
```

## Context and Providers

React Context does not work in Server Components. Providers must be Client Components wrapping the tree.

```tsx
// app/providers.tsx
'use client'

import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  // useState ensures one QueryClient per request (no sharing between users)
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60 * 1000 },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system">
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}

// app/layout.tsx (Server Component)
import { Providers } from './providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

## Third-Party Library Wrapping

Libraries that use client-only APIs (DOM, hooks, browser events) must be wrapped in a `"use client"` boundary.

```tsx
// components/analytics.tsx
'use client'

// Re-export the third-party component from a 'use client' file.
// This is the minimal boundary -- do NOT add 'use client' to your page.
export { default as PostHogPageView } from 'posthog-js/react'
```

## Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Only plain objects can be passed to Client Components` | Non-serializable data crossing boundary | Transform Date/Map/Set before passing |
| Database URL in client bundle | Missing `server-only` guard | Add `import 'server-only'` to db files |
| Entire page is client-side | `"use client"` too high in tree | Move directive to leaf components |
| Hydration mismatch | Server/client render different output | Check for `Date.now()`, `Math.random()`, locale-dependent formatting |
| Component not updating after navigation | Layout state preserved (not remounted) | Use `template.tsx` or key prop on layout children |
