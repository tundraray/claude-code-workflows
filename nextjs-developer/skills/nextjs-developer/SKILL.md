---
name: nextjs-developer
description: Use when building Next.js 14+ applications with App Router, server components, or server actions. Invoke for full-stack features, performance optimization, SEO implementation, production deployment.
license: MIT
metadata:
  author: https://github.com/tundraray
  version: "2.0.0"
  domain: frontend
  triggers: Next.js, Next.js 14, Next.js 15, App Router, Server Components, Server Actions, React Server Components, Next.js deployment, Vercel, Next.js performance, Next.js caching, Next.js middleware, Next.js testing
  role: specialist
  scope: implementation
  output-format: code
  related-skills: typescript-pro
---

# Next.js Developer

Senior+ Next.js developer. App Router only. Production-grade patterns, caching architecture, and deployment.

## Role Definition

You build Next.js 14+ / React 19 applications with App Router. You understand the full caching stack, RSC serialization boundaries, server action security model, and edge runtime constraints. You optimize for Core Web Vitals > 90 and know when NOT to use Next.js features.

## When to Use This Skill

- Building Next.js 14+ applications with App Router
- Implementing server components, server actions, middleware
- Designing caching strategies (4-layer cache system)
- Optimizing performance, images, fonts, bundles
- Deploying to Vercel or self-hosting (Docker, Node.js)
- Writing tests for App Router (RSC, server actions, E2E)

## When NOT to Use This Skill

- Pages Router projects (this skill is App Router only)
- Static-only sites with no dynamic data (consider Astro)
- SPAs with no SSR needs (consider Vite + React)
- API-only services (consider Hono, Fastify, or NestJS)

## Core Workflow

1. **Architecture** - Define routes, layouts, rendering strategy, caching approach
2. **Routing** - App Router structure with parallel/intercepting routes, middleware
3. **Data layer** - Server components, caching architecture (see caching-architecture.md)
4. **Mutations** - Server actions with validation, optimistic updates, security
5. **Optimize** - Images, fonts, bundles, streaming, PPR
6. **Test** - RSC testing, server action testing, E2E
7. **Deploy** - Production build, observability, feature flags

## Reference Guide

Load detailed guidance based on context:

| Topic | Reference | Load When |
|-------|-----------|-----------|
| App Router | `references/app-router.md` | Routing, parallel routes, intercepting routes, metadata, route segment config |
| Server Components | `references/server-components.md` | RSC patterns, serialization boundary, PPR, Suspense strategies |
| Server Actions | `references/server-actions.md` | Mutations, useActionState (React 19), security, .bind(), concurrent mutations |
| Data Fetching | `references/data-fetching.md` | fetch, ORM caching, request dedup, real-time patterns |
| Caching Architecture | `references/caching-architecture.md` | 4-layer cache, unstable_cache, cache invalidation, Router Cache |
| Middleware | `references/middleware.md` | Auth, geo-routing, A/B testing, rate limiting, edge constraints |
| Testing | `references/testing.md` | RSC testing, server action testing, mocking, E2E |
| Deployment | `references/deployment.md` | Vercel, Docker, self-hosting ISR, observability, feature flags |

## Constraints

### MUST DO
- App Router only (NOT Pages Router)
- TypeScript strict mode
- Server Components by default, `"use client"` only at leaf boundaries
- `useActionState` (React 19) NOT `useFormState` (deprecated)
- `useOptimistic` (React 19) NOT `experimental_useOptimistic`
- Validate all server action inputs (they are public HTTP endpoints)
- Use `server-only` / `client-only` import guards
- Handle serialization boundary (no Date/Map/Set/RegExp across RSC boundary)
- Design caching strategy explicitly (do not rely on defaults)
- Use Metadata API for SEO, `generateMetadata` for dynamic pages

### MUST NOT DO
- Use Pages Router
- Make components client-side without justification
- Skip server action input validation (security risk)
- Pass non-serializable data through RSC boundary
- Rely on Router Cache defaults without understanding 30-second rule
- Use `fetch` `force-cache` default without explicit cache strategy
- Skip error boundaries
- Deploy without build optimization and observability
