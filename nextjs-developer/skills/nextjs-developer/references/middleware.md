# Middleware

> Next.js 14+. Middleware runs on the Edge runtime before every matched request.

## How Middleware Works

Middleware is a single `middleware.ts` file at the project root (NOT inside `app/`). It executes before the route resolves, before layouts render, before any Server Component executes. It runs on the Edge runtime -- always.

```
Request → Middleware → Route resolution → Layout → Page
```

**Key constraint:** You cannot change the runtime. Middleware always runs on Edge. This means no Node.js APIs (fs, net, child_process, dns, etc.).

## Matcher Configuration

```tsx
// middleware.ts
export const config = {
  matcher: [
    // Match all routes except static assets and internal Next.js routes
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**Failure mode:** Without a proper matcher, middleware runs on every static asset request (CSS, JS, images). This adds latency to every resource and can break image optimization. Always exclude `_next/static`, `_next/image`, and common asset extensions.

### Multiple Matchers

```tsx
export const config = {
  matcher: [
    '/dashboard/:path*',    // All dashboard routes
    '/api/:path*',          // All API routes
    '/admin/:path*',        // All admin routes
  ],
}
```

## Auth Middleware

Verify authentication before the page renders. Redirect unauthenticated users without loading any page code.

```tsx
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/api/auth']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip auth check for public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  const token = request.cookies.get('session')?.value

  if (!token) {
    // Preserve the original URL so we can redirect back after login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    // jose works on Edge (unlike jsonwebtoken which requires Node.js)
    const secret = new TextEncoder().encode(process.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)

    // Attach user info to headers for downstream use
    const response = NextResponse.next()
    response.headers.set('x-user-id', payload.sub as string)
    response.headers.set('x-user-role', payload.role as string)
    return response
  } catch {
    // Token expired or invalid -- clear it and redirect
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('session')
    return response
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

### Token Refresh in Middleware

```tsx
// Refresh token if it expires within 5 minutes
const REFRESH_THRESHOLD = 5 * 60 // seconds

async function refreshIfNeeded(request: NextRequest, payload: JWTPayload): Promise<NextResponse> {
  const response = NextResponse.next()

  const exp = payload.exp ?? 0
  const now = Math.floor(Date.now() / 1000)

  if (exp - now < REFRESH_THRESHOLD) {
    // Issue new token with extended expiry
    const newToken = await signJWT({ sub: payload.sub, role: payload.role })
    response.cookies.set('session', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
    })
  }

  return response
}
```

**Trade-off:** Auth in middleware protects all routes uniformly but adds latency to every request. For APIs that need different auth (API keys, OAuth), handle auth in Route Handlers instead.

## Geo-Routing

```tsx
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const country = request.geo?.country ?? 'US'
  const city = request.geo?.city ?? 'unknown'

  // Route to country-specific content
  if (country === 'DE' && !request.nextUrl.pathname.startsWith('/de')) {
    return NextResponse.redirect(new URL(`/de${request.nextUrl.pathname}`, request.url))
  }

  // Pass geo data to Server Components via headers
  const response = NextResponse.next()
  response.headers.set('x-geo-country', country)
  response.headers.set('x-geo-city', city)
  return response
}
```

**Limitation:** `request.geo` is only populated on Vercel. Self-hosted deployments need a reverse proxy (nginx, Cloudflare) to set geo headers, or use a GeoIP database like MaxMind.

## A/B Testing

Cookie-based split: assign users to a variant on first visit, persist via cookie, rewrite to variant route.

```tsx
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const EXPERIMENT_COOKIE = 'ab-checkout'
const VARIANTS = ['control', 'variant-a', 'variant-b'] as const

export function middleware(request: NextRequest) {
  // Only apply to experiment routes
  if (!request.nextUrl.pathname.startsWith('/checkout')) {
    return NextResponse.next()
  }

  // Check for existing assignment
  let variant = request.cookies.get(EXPERIMENT_COOKIE)?.value

  if (!variant || !VARIANTS.includes(variant as any)) {
    // Assign randomly on first visit
    // Using simple random -- for production, use deterministic hashing on user ID
    variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)]
  }

  // Rewrite URL to variant page (URL stays the same for the user)
  const url = request.nextUrl.clone()
  url.pathname = `/checkout/${variant}${request.nextUrl.pathname.replace('/checkout', '')}`

  const response = NextResponse.rewrite(url)

  // Persist assignment for 30 days
  response.cookies.set(EXPERIMENT_COOKIE, variant, {
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })

  return response
}
```

**File structure:**
```
app/
├── checkout/
│   ├── control/page.tsx        # Original checkout
│   ├── variant-a/page.tsx      # New checkout design
│   └── variant-b/page.tsx      # Simplified checkout
```

**Trade-off:** Middleware-based A/B testing is fast (no client-side flicker) and SEO-safe (same URL). But it cannot react to client-side events. For complex experiments (multi-step funnels, client-side interactions), use a client-side SDK (Statsig, LaunchDarkly).

## Multi-Tenant URL Rewriting

```tsx
// middleware.ts
export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  // Extract subdomain: tenant1.app.com -> tenant1
  const subdomain = hostname.split('.')[0]

  // Skip for main domain and localhost
  if (subdomain === 'www' || subdomain === 'app' || hostname.includes('localhost')) {
    return NextResponse.next()
  }

  // Rewrite to tenant-specific route
  // URL: tenant1.app.com/dashboard -> internally serves /tenants/tenant1/dashboard
  const url = request.nextUrl.clone()
  url.pathname = `/tenants/${subdomain}${request.nextUrl.pathname}`

  return NextResponse.rewrite(url)
}
```

## Rate Limiting

Edge-compatible rate limiting using Upstash Redis (HTTP-based, works on Edge).

```tsx
// middleware.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
  analytics: true,
})

export async function middleware(request: NextRequest) {
  // Only rate limit API routes
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  // Use IP for anonymous, user ID for authenticated
  const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? 'unknown'
  const identifier = request.cookies.get('session')?.value
    ? `user:${request.cookies.get('session')!.value}`
    : `ip:${ip}`

  const { success, limit, remaining, reset } = await ratelimit.limit(identifier)

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
          'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    )
  }

  return NextResponse.next()
}
```

**Trade-off:** Rate limiting in middleware protects all matched routes uniformly. But it adds a Redis round-trip to every request. For high-traffic routes where latency matters, consider rate limiting at the CDN/reverse proxy level instead.

## Middleware Composition

Middleware is a single function. Compose logic with an early-return pattern.

```tsx
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 1. Maintenance mode check (highest priority)
  if (process.env.MAINTENANCE_MODE === 'true') {
    return NextResponse.rewrite(new URL('/maintenance', request.url))
  }

  // 2. Rate limiting for API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const rateLimitResult = await checkRateLimit(request)
    if (rateLimitResult) return rateLimitResult // Returns 429 response
  }

  // 3. Auth check for protected routes
  if (isProtectedRoute(request.nextUrl.pathname)) {
    const authResult = await checkAuth(request)
    if (authResult) return authResult // Returns redirect to /login
  }

  // 4. Geo-routing
  const geoResult = handleGeoRouting(request)
  if (geoResult) return geoResult

  // 5. Default: continue to route
  return NextResponse.next()
}

function isProtectedRoute(pathname: string): boolean {
  const protectedPrefixes = ['/dashboard', '/admin', '/settings']
  return protectedPrefixes.some(prefix => pathname.startsWith(prefix))
}
```

**When NOT to use middleware:** Heavy computation (CPU-bound), database queries requiring Node.js drivers, file system operations, anything that needs more than ~50ms. Middleware should be fast -- it runs on every matched request.

## Edge Runtime Limitations (Reference)

Cannot use in middleware or any `runtime = 'edge'` route:

```
BLOCKED Node.js APIs:
  fs, path (partial), child_process, net, tls, dns, dgram,
  cluster, worker_threads, os (partial), stream (use Web Streams)

BLOCKED patterns:
  eval(), new Function(), require() for native modules,
  process.env mutation, global state across requests

AVAILABLE alternatives:
  fetch() (native), Web Crypto API (instead of node:crypto),
  TextEncoder/TextDecoder, URL/URLSearchParams,
  Headers, Request, Response (Web standard APIs),
  crypto.subtle (for JWT verification via jose library)
```

## Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Static assets slow / broken | Middleware matching `_next/static` | Add `_next/static` to matcher exclusion |
| `Dynamic server usage` error | Using Node.js API in middleware | Replace with edge-compatible alternative |
| Infinite redirect loop | Middleware redirecting to a route that also triggers middleware | Add the redirect target to exclusion list |
| A/B test cookie not persisting | Cookie set on rewrite but not on redirect | Use `NextResponse.rewrite()`, not `redirect()`, for A/B |
| `request.geo` is undefined | Running outside Vercel | Use reverse proxy geo headers or GeoIP database |
| Middleware runs on every request | Missing or overly broad matcher | Narrow matcher pattern, exclude asset paths |
