# Deployment & Production

> Next.js 14+. Covers Vercel, Docker self-hosting, edge constraints, observability, and feature flags.

## Docker Multi-Stage Build

The production-proven Dockerfile for self-hosting Next.js with standalone output.

```dockerfile
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env vars must be available here
# Runtime env vars (DATABASE_URL etc.) are read at request time
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# standalone output includes minimal node_modules
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# sharp for image optimization in production (optional but recommended)
# RUN npm install sharp

CMD ["node", "server.js"]
```

**Requires `next.config.js`:**
```js
module.exports = {
  output: 'standalone', // Bundles dependencies into .next/standalone
}
```

**Failure mode:** Forgetting `output: 'standalone'` means `.next/standalone` does not exist. The Docker image builds but `server.js` is missing.

## ISR on Self-Hosted (Gotchas)

ISR (Incremental Static Regeneration) works out-of-the-box on Vercel. Self-hosting requires additional configuration.

### Problem: Persistent Cache Storage

By default, ISR cache lives in `.next/cache` on the local filesystem. In a multi-instance deployment (Kubernetes, ECS), each instance has its own cache. Revalidation on one instance does not affect others.

```js
// next.config.js
module.exports = {
  // Custom cache handler for shared storage
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0, // Disable in-memory cache, use external only
}
```

```js
// cache-handler.js — Redis-backed example
const { createClient } = require('redis')

const client = createClient({ url: process.env.REDIS_URL })
client.connect()

module.exports = class CacheHandler {
  async get(key) {
    const data = await client.get(key)
    return data ? JSON.parse(data) : null
  }

  async set(key, data, ctx) {
    const ttl = ctx.revalidate || 60
    await client.set(key, JSON.stringify(data), { EX: ttl })
  }

  async revalidateTag(tag) {
    // Implement tag-based invalidation
    // Scan for keys with this tag and delete them
    const keys = await client.keys(`*:tag:${tag}:*`)
    if (keys.length) await client.del(keys)
  }
}
```

**Trade-off:** External cache (Redis) adds a network hop to every cache read. But it ensures consistency across instances. For single-instance deployments, the default filesystem cache is fine.

### `dynamicParams: true` vs `false`

```tsx
// true (default): Unknown params render on-demand, then cache (ISR behavior)
// false: Unknown params return 404 (strict static generation)
export const dynamicParams = true

export async function generateStaticParams() {
  // Only these slugs are pre-built
  return topPosts.map(p => ({ slug: p.slug }))
}
```

**Self-hosting with `dynamicParams: true`:** The first request for a new slug triggers on-demand rendering. The result is cached in `.next/cache`. If that cache is not shared (see above), other instances will also render on first request.

## Edge Runtime Limitations

The Edge runtime runs in V8 isolates (like Cloudflare Workers). Fast cold starts, global distribution, but limited API surface.

### APIs That Do NOT Work on Edge

```
Node.js built-in modules:
  fs, path, child_process, net, tls, dns, dgram,
  cluster, worker_threads, crypto (partial — Web Crypto works)

npm packages that use native bindings:
  bcrypt (use bcryptjs), sharp (use Vercel Image Optimization),
  better-sqlite3, pg-native, any package with .node binaries

Other limitations:
  - No process.env mutation at runtime (read-only)
  - No eval() or new Function() (V8 isolate restriction)
  - Response body must complete within execution limit
  - No streaming from Node.js streams (use Web Streams API)
  - Maximum execution time: typically 30s (varies by provider)
  - Maximum memory: typically 128MB (varies by provider)
```

**When to use Edge:** Middleware (always runs on edge), latency-critical API routes without Node.js dependencies, static page rendering.

**When NOT to use Edge:** Database queries with Node.js drivers (pg, mysql2), file system operations, CPU-intensive tasks, anything needing Node.js APIs.

## Observability

### OpenTelemetry Integration

```js
// next.config.js
module.exports = {
  experimental: {
    instrumentationHook: true, // Enable instrumentation.ts
  },
}
```

```ts
// instrumentation.ts (project root)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only load OTel in Node.js runtime (not edge)
    const { NodeSDK } = await import('@opentelemetry/sdk-node')
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    )

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable fs instrumentation to reduce noise
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    })

    sdk.start()
  }
}
```

### Sentry Integration

```ts
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,           // 10% of transactions in production
  replaysSessionSampleRate: 0.01,  // 1% of sessions
  replaysOnErrorSampleRate: 1.0,   // 100% of sessions with errors
})

// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN, // Server-side: no NEXT_PUBLIC_ needed
  tracesSampleRate: 0.1,
})

// sentry.edge.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
})
```

### Structured Logging

```ts
// lib/logger.ts
import 'server-only'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
    // Include trace context if available
    ...(process.env.OTEL_TRACE_ID && { traceId: process.env.OTEL_TRACE_ID }),
  }

  // JSON output for log aggregation (Datadog, ELK, CloudWatch)
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry))
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
}
```

## Feature Flags

### Edge Config (Vercel)

```tsx
// lib/flags.ts
import { get } from '@vercel/edge-config'

export async function getFeatureFlag(key: string): Promise<boolean> {
  const value = await get<boolean>(key)
  return value ?? false
}

// app/page.tsx
import { getFeatureFlag } from '@/lib/flags'

export default async function Page() {
  const showNewCheckout = await getFeatureFlag('new-checkout')

  return showNewCheckout ? <NewCheckout /> : <LegacyCheckout />
}
```

### LaunchDarkly Server-Side

```tsx
// lib/launchdarkly.ts
import 'server-only'
import * as LaunchDarkly from '@launchdarkly/node-server-sdk'

let client: LaunchDarkly.LDClient | null = null

async function getClient() {
  if (!client) {
    client = LaunchDarkly.init(process.env.LAUNCHDARKLY_SDK_KEY!)
    await client.waitForInitialization()
  }
  return client
}

export async function getFlag<T>(key: string, defaultValue: T, context?: LaunchDarkly.LDContext): Promise<T> {
  const ld = await getClient()
  const ctx = context ?? { kind: 'user', key: 'anonymous' }
  return ld.variation(key, ctx, defaultValue)
}
```

**Trade-off:** Edge Config is fast (no SDK initialization, single KV read) but limited to Vercel. LaunchDarkly is platform-agnostic with targeting rules, but adds SDK overhead and requires initialization.

## Production next.config.js

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.example.com' },
    ],
  },

  // Tree-shake barrel exports (e.g., @mui/icons-material)
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material', 'lodash-es'],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
```

## Health Check with Dependency Verification

```tsx
// app/api/health/route.ts
import { db } from '@/lib/db'

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {}

  try {
    await db.$queryRaw`SELECT 1`
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
  }

  try {
    await fetch(process.env.EXTERNAL_API_URL + '/health', { signal: AbortSignal.timeout(3000) })
    checks.externalApi = 'ok'
  } catch {
    checks.externalApi = 'error'
  }

  const allHealthy = Object.values(checks).every(v => v === 'ok')

  return Response.json(
    { status: allHealthy ? 'healthy' : 'degraded', checks, timestamp: Date.now() },
    { status: allHealthy ? 200 : 503 }
  )
}
```

## Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| ISR works on Vercel but not self-hosted | Cache not shared across instances | Implement custom `cacheHandler` with Redis/S3 |
| `output: 'standalone'` missing files | `public/` and `.next/static` not copied | Copy them alongside `standalone/` in Dockerfile |
| Edge function timeout | Node.js API used on edge runtime | Switch to `runtime = 'nodejs'` or replace package |
| Environment variable undefined at runtime | Baked in at build time | Use `process.env.VAR` (not `NEXT_PUBLIC_`) in server code; ensure runtime env is set |
| Image optimization 500 errors in Docker | `sharp` not installed | Add `npm install sharp` in runner stage |
| Build-time `DATABASE_URL` required | Prisma generates types at build time | Pass build-time env or use `prisma generate` separately |
