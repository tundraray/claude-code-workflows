# Controllers & Routing — Advanced Patterns

> NestJS 10+ | @nestjs/common 10+ | @nestjs/swagger 7+

## Interceptors — The Real Power of the Request Pipeline

Interceptors wrap the entire handler execution in an RxJS observable, giving you before/after/error hooks.

### Response Transformation

```typescript
// Standardize all API responses without touching every controller
@Injectable()
export class ResponseWrapperInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
```

### Timeout Interceptor

```typescript
// Kill requests that exceed SLA — prevents thread starvation
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs = 10_000) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          throw new RequestTimeoutException(
            `Request exceeded ${this.timeoutMs}ms timeout`,
          );
        }
        throw err;
      }),
    );
  }
}
```

**When NOT to use interceptors**: File uploads, SSE streams, WebSocket handlers. The RxJS `timeout` will kill long-running uploads. Use middleware for these.

### Cache Interceptor with ETag Support

```typescript
// HTTP-level caching — reduces server load for read-heavy endpoints
@Injectable()
export class ETagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const response = context.switchToHttp().getResponse();
        const request = context.switchToHttp().getRequest();

        const body = JSON.stringify(data);
        const etag = `"${createHash('md5').update(body).digest('hex')}"`;

        response.setHeader('ETag', etag);
        response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

        if (request.headers['if-none-match'] === etag) {
          response.status(304);
          return; // Empty body for 304
        }

        return data;
      }),
    );
  }
}
```

**Trade-off**: MD5 hashing every response body adds ~0.5ms for 1KB payloads, ~5ms for 100KB. For large payloads, use `Last-Modified` header with DB timestamp instead.

### Logging Interceptor — Production-Grade

```typescript
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const correlationId = request.headers['x-correlation-id'] || randomUUID();
    const start = performance.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const duration = Math.round(performance.now() - start);
        // Structured logging for log aggregation (ELK, Datadog)
        this.logger.log({
          correlationId,
          method,
          url,
          statusCode: response.statusCode,
          duration,
          ip,
          userAgent,
        });
      }),
      catchError((error) => {
        const duration = Math.round(performance.now() - start);
        this.logger.error({
          correlationId,
          method,
          url,
          duration,
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }),
    );
  }
}
```

---

## Custom Parameter Decorators

### @CurrentUser() — Extract Authenticated User

```typescript
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    // Return specific field or entire user object
    return field ? user?.[field] : user;
  },
);

// Usage — cleaner than @Req() + manual extraction
@Get('profile')
getProfile(@CurrentUser() user: AuthUser) { ... }

@Patch('settings')
updateSettings(@CurrentUser('id') userId: string, @Body() dto: UpdateSettingsDto) { ... }
```

### @Tenant() — Multi-Tenancy Extraction

```typescript
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    // Tenant from subdomain: acme.app.com → acme
    const host = request.hostname;
    const tenant = host.split('.')[0];
    if (!tenant || tenant === 'www') {
      throw new BadRequestException('Tenant not resolved from hostname');
    }
    return tenant;
  },
);
```

---

## Streaming Responses (NestJS 10+)

### StreamableFile for Large Downloads

```typescript
@Get('export')
async exportCsv(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
  // passthrough: true — lets NestJS still handle interceptors/filters
  res.set({
    'Content-Type': 'text/csv',
    'Content-Disposition': 'attachment; filename="export.csv"',
  });

  const stream = await this.reportsService.generateCsvStream();
  return new StreamableFile(stream);
}
```

**Critical**: Use `@Res({ passthrough: true })`, not `@Res()`. Without `passthrough`, NestJS skips interceptors, exception filters, and response serialization.

### Server-Sent Events

```typescript
@Sse('events')
events(): Observable<MessageEvent> {
  return this.notificationsService.getEventStream().pipe(
    map((event) => ({
      data: JSON.stringify(event),
      id: event.id,
      // Retry hint for client reconnection
      retry: 5000,
    })),
  );
}
```

**Failure mode**: SSE connections count against Node.js connection limit (default ~1000 in most reverse proxies). Set Nginx `proxy_read_timeout 3600s` and increase `worker_connections`. For >10k concurrent SSE clients, use a dedicated service or switch to WebSockets.

---

## Versioning Trade-offs

### URI Versioning (default)
```typescript
app.enableVersioning({ type: VersioningType.URI }); // /v1/users, /v2/users
```
- **Pro**: Visible in URLs, easy to route at load balancer level
- **Con**: Duplicates controller code unless you use inheritance/composition
- **Best for**: Public APIs, when clients cache by URL

### Header Versioning
```typescript
app.enableVersioning({ type: VersioningType.HEADER, header: 'X-API-Version' });
```
- **Pro**: Clean URLs, no path duplication
- **Con**: Invisible to caches (unless Vary header is set), harder to test in browser
- **Best for**: Internal APIs, mobile app backends

### Media Type Versioning
```typescript
app.enableVersioning({ type: VersioningType.MEDIA_TYPE, key: 'v=' });
// Accept: application/json;v=2
```
- **Pro**: REST purists approve, content negotiation native
- **Con**: Most client HTTP libraries make this awkward
- **Best for**: APIs following strict REST/HATEOAS

### Version-Neutral Endpoints (NestJS 10+)
```typescript
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController { ... }
```

**When NOT to version**: Internal microservice-to-microservice APIs where you control both sides. Use contract tests instead — versioning adds cognitive overhead.

---

## Cursor-Based vs Offset-Based Pagination

### Offset-Based
```typescript
@Get()
findAll(@Query() query: PaginationDto) {
  // SELECT * FROM articles ORDER BY created_at DESC LIMIT 20 OFFSET 40
  return this.service.findAll(query.page, query.limit);
}
```
- **Pro**: Simple, users can jump to any page
- **Con**: Performance degrades linearly with offset (Postgres scans and discards rows). At offset 100,000 with 20 limit, Postgres reads 100,020 rows.
- **Con**: Inconsistent results when data changes between pages (inserts shift items)

### Cursor-Based (recommended for large datasets)
```typescript
@Get()
findAll(@Query('cursor') cursor?: string, @Query('limit') limit = 20) {
  // SELECT * FROM articles WHERE created_at < $cursor ORDER BY created_at DESC LIMIT 21
  // Fetch limit+1 to determine hasNextPage without COUNT query
  return this.service.findWithCursor(cursor, limit);
}
```

Response shape:
```json
{
  "data": [...],
  "pageInfo": {
    "hasNextPage": true,
    "endCursor": "2024-01-15T10:30:00Z_abc123"
  }
}
```

- **Pro**: O(1) performance regardless of dataset position (uses index seek, not scan)
- **Pro**: Stable under concurrent writes
- **Con**: Cannot jump to arbitrary page
- **Con**: Cursor must be opaque (base64-encode compound keys to prevent client manipulation)

**Threshold**: Use offset for datasets <10k rows. Switch to cursor when offset queries exceed 50ms (check `EXPLAIN ANALYZE`).

---

## Cache Headers — Production Configuration

```typescript
// cache.decorator.ts — declarative cache control
export const CacheHeaders = (options: {
  public?: boolean;
  maxAge?: number;
  staleWhileRevalidate?: number;
}) => SetMetadata('cacheHeaders', options);

// cache-headers.interceptor.ts
@Injectable()
export class CacheHeadersInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(() => {
        const options = this.reflector.get('cacheHeaders', context.getHandler());
        if (!options) return;

        const response = context.switchToHttp().getResponse();
        const directives = [
          options.public ? 'public' : 'private',
          `max-age=${options.maxAge || 0}`,
        ];
        if (options.staleWhileRevalidate) {
          directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
        }
        response.setHeader('Cache-Control', directives.join(', '));
      }),
    );
  }
}

// Usage
@Get('config')
@CacheHeaders({ public: true, maxAge: 3600, staleWhileRevalidate: 86400 })
getPublicConfig() { ... }
```

**Failure mode**: Setting `public, max-age=300` on authenticated endpoints caches user-specific data in CDN/shared caches. Always use `private` for authenticated responses.
