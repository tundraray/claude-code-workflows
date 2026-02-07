# App Router Architecture

> Next.js 14+ / React 19. App Router only.

## Non-Obvious File Conventions

The basic files (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`) are well-known. Focus on the ones that break production when missing or misconfigured.

### `default.tsx` — Parallel Route Fallback (Mandatory)

Parallel routes require `default.tsx`. Without it, hard navigation to a URL that does not match the slot produces a 404.

```tsx
// app/dashboard/@analytics/default.tsx
// Required: renders when the parallel slot has no matching route
// for the current URL during hard navigation (full page load).
// Soft navigation (client-side) preserves the last active state instead.
export default function Default() {
  return null // or a fallback UI
}
```

**Failure mode:** User bookmarks `/dashboard/settings`. The `@analytics` slot has no `settings/page.tsx`. Without `default.tsx`, the entire page 404s on hard navigation. With it, the slot renders the fallback.

### `template.tsx` vs `layout.tsx`

```
layout.tsx   — persists across navigations, state preserved, NOT remounted
template.tsx — remounts on every navigation, fresh state each time
```

**When to use `template.tsx`:** Page-enter animations, per-page analytics tracking, resetting form state on route change. Trade-off: loses React state on every navigation.

### `route.ts` — Conflicts with `page.tsx`

A route segment cannot have both `route.ts` and `page.tsx`. The `route.ts` wins and the page will not render. This is a silent failure.

## Route Segment Config

Export these constants from any `page.tsx` or `layout.tsx` to control behavior per-segment.

```tsx
// Controls rendering strategy: 'auto' | 'force-dynamic' | 'error' | 'force-static'
export const dynamic = 'force-dynamic'

// Revalidation interval in seconds. false = never, 0 = always
export const revalidate = 3600

// Runtime: 'nodejs' | 'edge'
export const runtime = 'edge'

// Deploy to specific regions (Vercel). Array of region codes.
export const preferredRegion = ['iad1', 'sfo1']

// Max execution time in seconds. Vercel: 5s (hobby), 15s (pro), 900s (enterprise)
export const maxDuration = 30

// Whether dynamic params beyond generateStaticParams are allowed
// false = return 404 for unknown params (strict static generation)
export const dynamicParams = false
```

**Trade-off:** `dynamicParams = false` is safer (no unexpected server load) but means new content requires a rebuild or revalidation call. Set `true` for user-generated content where slugs are unpredictable.

## Parallel Routes

Render multiple pages simultaneously in the same layout. Each slot is an independent route tree.

```tsx
// app/dashboard/layout.tsx
export default function Layout({
  children,       // default slot (app/dashboard/page.tsx)
  analytics,      // @analytics slot
  notifications,  // @notifications slot
}: {
  children: React.ReactNode
  analytics: React.ReactNode
  notifications: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-12">
      <main className="col-span-8">{children}</main>
      <aside className="col-span-4">
        {analytics}
        {notifications}
      </aside>
    </div>
  )
}
```

**Critical:** Each parallel slot (`@analytics`, `@notifications`) needs its own `default.tsx` and can have its own `loading.tsx` and `error.tsx`. They stream independently.

### Conditional Slots

```tsx
// app/dashboard/layout.tsx
import { auth } from '@/lib/auth'

export default async function Layout({
  children,
  admin,
  user,
}: {
  children: React.ReactNode
  admin: React.ReactNode
  user: React.ReactNode
}) {
  const session = await auth()
  // Render different parallel routes based on role
  return session?.role === 'admin' ? admin : user
}
```

## Intercepting Routes

Show a route in a modal (or different layout) when navigated to from within the app, but show the full page on direct URL access or refresh.

### Convention Syntax

```
(.)    — intercepts same level
(..)   — intercepts one level up
(..)(..) — intercepts two levels up
(...)  — intercepts from app root
```

### Production Example: Photo Modal

```
app/
├── @modal/
│   ├── default.tsx              # Required: returns null
│   └── (.)photos/[id]/
│       └── page.tsx             # Modal view (intercepted)
├── photos/[id]/
│   └── page.tsx                 # Full page view (direct navigation)
└── layout.tsx                   # Renders both children + @modal slot
```

```tsx
// app/layout.tsx
export default function Layout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <>
      {children}
      {modal}
    </>
  )
}

// app/@modal/(.)photos/[id]/page.tsx
import { Modal } from '@/components/modal'

export default async function PhotoModal({
  params,
}: {
  params: Promise<{ id: string }>  // Next.js 15: params is async
}) {
  const { id } = await params
  const photo = await getPhoto(id)

  return (
    <Modal>
      <img src={photo.url} alt={photo.alt} />
    </Modal>
  )
}

// app/photos/[id]/page.tsx — full page on direct navigation / refresh
export default async function PhotoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const photo = await getPhoto(id)

  return (
    <div className="photo-full">
      <img src={photo.url} alt={photo.alt} />
      <p>{photo.description}</p>
    </div>
  )
}
```

**Failure mode:** Forgetting `@modal/default.tsx` causes 404 on any route that does not match the interceptor. The modal slot must always have a fallback.

**When NOT to use intercepting routes:** Simple modals that do not need shareable URLs. Use client-side state instead -- intercepting routes add significant routing complexity.

## Advanced Metadata

### Dynamic OG Images

```tsx
// app/blog/[slug]/opengraph-image.tsx
// File convention: auto-generates OG image for this route segment
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Blog post'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({
  params,
}: {
  params: { slug: string }
}) {
  const post = await getPost(params.slug)

  return new ImageResponse(
    (
      <div style={{
        display: 'flex',
        fontSize: 60,
        background: 'linear-gradient(to bottom, #1a1a2e, #16213e)',
        color: 'white',
        width: '100%',
        height: '100%',
        padding: 50,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {post.title}
      </div>
    ),
    { ...size }
  )
}
```

### Async Metadata with Parent Merging

```tsx
// app/blog/[slug]/page.tsx
import type { Metadata, ResolvingMetadata } from 'next'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata  // Access parent layout's metadata
): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  const parentMeta = await parent

  // Merge with parent's openGraph images instead of replacing
  const previousImages = parentMeta.openGraph?.images || []

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage, ...previousImages],
    },
  }
}
```

### File Convention Metadata

```tsx
// app/sitemap.ts — generates /sitemap.xml
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts()

  const blogUrls = posts.map((post) => ({
    url: `https://example.com/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  return [
    { url: 'https://example.com', lastModified: new Date(), priority: 1 },
    ...blogUrls,
  ]
}

// app/robots.ts — generates /robots.txt
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/'] },
    ],
    sitemap: 'https://example.com/sitemap.xml',
  }
}
```

## Middleware Integration with Routing

Middleware executes before the route is resolved. It can rewrite, redirect, or modify headers for all matched routes.

```tsx
// middleware.ts (project root, NOT inside app/)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Rewrite changes the internal route without changing the URL
  // This enables multi-tenant routing
  const hostname = request.headers.get('host') || ''
  const subdomain = hostname.split('.')[0]

  if (subdomain !== 'www' && subdomain !== 'example') {
    // Rewrite tenant.example.com/page to /tenants/[tenant]/page internally
    return NextResponse.rewrite(
      new URL(`/tenants/${subdomain}${request.nextUrl.pathname}`, request.url)
    )
  }
}

export const config = {
  // CRITICAL: exclude static assets, or middleware runs on every image/CSS/JS request
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

See `references/middleware.md` for auth, A/B testing, rate limiting patterns.

## Trade-offs Summary

| Decision | Benefit | Cost |
|----------|---------|------|
| Parallel routes | Independent loading/error states per slot | `default.tsx` required everywhere, complex debugging |
| Intercepting routes | Modal + shareable URL | Significant routing complexity, easy to break with missing defaults |
| `dynamicParams: false` | Predictable server load, no surprise renders | New content requires rebuild/revalidation |
| Edge runtime on pages | Faster TTFB globally | Cannot use Node.js APIs (fs, net, etc.) |
| Route groups `(name)` | Separate layouts per section | URL structure not visible in folder names |
