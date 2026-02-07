# Security Hardening — Production Checklist

> NestJS 10+ | @nestjs/throttler 5+ | helmet 7+ | PostgreSQL 14+

## Rate Limiting with @nestjs/throttler

### Basic Setup with Redis Store (NestJS 10+)

```typescript
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: 1000,   // 1 second window
            limit: 10,    // 10 requests per second per IP
          },
          {
            name: 'medium',
            ttl: 60000,  // 1 minute window
            limit: 100,   // 100 requests per minute per IP
          },
          {
            name: 'long',
            ttl: 3600000, // 1 hour window
            limit: 1000,  // 1000 requests per hour per IP
          },
        ],
        // Redis store for distributed rate limiting across instances
        storage: new ThrottlerStorageRedisService(
          new Redis({
            host: config.getOrThrow('REDIS_HOST'),
            port: config.get('REDIS_PORT', 6379),
          }),
        ),
      }),
    }),
  ],
  providers: [
    // Apply globally — all routes rate-limited by default
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

### Per-Endpoint Override

```typescript
// Strict limit on auth endpoints to prevent brute force
@Throttle({ short: { limit: 3, ttl: 1000 }, medium: { limit: 10, ttl: 60000 } })
@Post('login')
async login(@Body() dto: LoginDto) { ... }

// Skip rate limiting for health checks
@SkipThrottle()
@Get('health')
health() { return { status: 'ok' }; }
```

### Custom Throttle Key (per-user instead of per-IP)

```typescript
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  async getTracker(req: Request): Promise<string> {
    // Use authenticated user ID if available, fall back to IP
    return req.user?.id || req.ip;
  }

  // Customize error response
  protected throwThrottlingException(): Promise<void> {
    throw new HttpException(
      {
        statusCode: 429,
        message: 'Rate limit exceeded. Try again later.',
        retryAfter: 60,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
```

**Failure mode**: Behind a load balancer without `trust proxy`, all requests appear from the same IP (the LB's IP). All users share one rate limit bucket. Set `app.set('trust proxy', 1)` and use `X-Forwarded-For`.

**When NOT to use @nestjs/throttler**: If Nginx or your API gateway (Kong, AWS API Gateway) already handles rate limiting. Double rate limiting wastes resources and creates confusing 429 responses at different layers.

---

## Helmet — Security Headers

```typescript
import helmet from 'helmet';

const app = await NestFactory.create(AppModule);
app.use(
  helmet({
    // Content Security Policy — prevents XSS
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // No 'unsafe-inline' — use nonces instead
        styleSrc: ["'self'", "'unsafe-inline'"], // Required for most CSS frameworks
        imgSrc: ["'self'", 'data:', 'https://cdn.example.com'],
        connectSrc: ["'self'", 'https://api.example.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    // Prevent clickjacking
    frameguard: { action: 'deny' },
    // Disable MIME type sniffing
    noSniff: true,
    // Force HTTPS
    hsts: {
      maxAge: 63072000, // 2 years
      includeSubDomains: true,
      preload: true,
    },
    // Referrer policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Disable X-Powered-By to avoid fingerprinting
    hidePoweredBy: true,
  }),
);
```

**Trade-off of strict CSP**: Breaks inline scripts, Google Analytics snippets, and third-party widgets. For APIs (no HTML responses), CSP is less critical. For SSR apps (NestJS + template engine), CSP requires careful nonce management.

---

## CORS — Production Configuration

```typescript
const app = await NestFactory.create(AppModule);
app.enableCors({
  // Dynamic origin — validate against allowed list
  origin: (origin, callback) => {
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [];
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new ForbiddenException(`Origin ${origin} not allowed`));
    }
  },
  credentials: true, // Required for cookies/Authorization header
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-Correlation-Id'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'], // Headers the browser can read
  maxAge: 3600, // Preflight cache — reduces OPTIONS requests
});
```

**Failure mode**: Setting `origin: '*'` with `credentials: true` is rejected by browsers. CORS spec forbids wildcard origin with credentials. You must specify exact origins.

**Failure mode**: Forgetting `exposedHeaders` means custom response headers are invisible to browser JavaScript. The fetch API silently drops them.

---

## CSRF Protection

### Double-Submit Cookie Pattern (for SPAs)

```typescript
import * as cookieParser from 'cookie-parser';
import * as csurf from 'csurf';

// Only needed if your API uses cookies for auth (not for Bearer token APIs)
app.use(cookieParser());
app.use(
  csurf({
    cookie: {
      httpOnly: true,
      sameSite: 'strict', // Prevents cookie from being sent cross-origin
      secure: process.env.NODE_ENV === 'production',
    },
  }),
);
```

### SameSite Cookies (modern approach, recommended)

```typescript
// If using cookie-based sessions, SameSite=Strict is sufficient CSRF protection
response.cookie('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict', // Browser will not send cookie on cross-origin requests
  maxAge: 15 * 60 * 1000,
  path: '/',
});
```

**When NOT to use CSRF protection**: APIs that only accept Bearer tokens in the Authorization header. Browsers do not automatically attach Authorization headers to cross-origin requests. CSRF is only relevant for cookie-based authentication.

---

## Token Rotation and Family Detection

Detect when a refresh token has been stolen and used by an attacker.

```typescript
interface RefreshTokenRecord {
  tokenHash: string;
  family: string;      // Groups all tokens from one login session
  userId: string;
  expiresAt: Date;
  used: boolean;        // Set to true after rotation
}

@Injectable()
export class TokenRotationService {
  async rotate(oldToken: string): Promise<TokenPair> {
    const oldRecord = await this.findByHash(hash(oldToken));
    if (!oldRecord) throw new UnauthorizedException('Unknown token');

    if (oldRecord.used) {
      // This token was already rotated — REUSE DETECTED
      // An attacker is using a stolen token that the legitimate user already rotated
      await this.revokeFamily(oldRecord.family);
      // Log security event for monitoring
      this.logger.warn(`Token reuse detected for family ${oldRecord.family}, user ${oldRecord.userId}`);
      throw new UnauthorizedException('Session compromised — logged out everywhere');
    }

    // Mark old token as used
    oldRecord.used = true;
    await this.save(oldRecord);

    // Issue new pair in same family
    const newTokens = this.issueTokenPair(oldRecord.userId, oldRecord.family);
    return newTokens;
  }

  private async revokeFamily(family: string): Promise<void> {
    // Delete all tokens in this family — forces re-login
    await this.tokenRepo.delete({ family });
  }
}
```

**Performance**: Token lookup by hash is O(1) with proper index. Family revocation scans ~10-50 tokens per family (one per refresh cycle). At 100k concurrent users, token table has ~500k rows. Index on `family` column is critical.

---

## Input Sanitization

### Preventing NoSQL/SQL Injection in Dynamic Queries

```typescript
// BAD — string interpolation in query
const results = await this.repo.query(
  `SELECT * FROM users WHERE name = '${dto.name}'` // SQL injection
);

// GOOD — parameterized query
const results = await this.repo.query(
  `SELECT * FROM users WHERE name = $1`,
  [dto.name],
);
```

### HTML Sanitization for User-Generated Content

```typescript
import DOMPurify from 'isomorphic-dompurify';

@Injectable()
export class SanitizationPipe implements PipeTransform {
  transform(value: any): any {
    if (typeof value === 'string') {
      return DOMPurify.sanitize(value, { ALLOWED_TAGS: [] }); // Strip all HTML
    }
    if (typeof value === 'object' && value !== null) {
      for (const key of Object.keys(value)) {
        if (typeof value[key] === 'string') {
          value[key] = DOMPurify.sanitize(value[key], { ALLOWED_TAGS: [] });
        }
      }
    }
    return value;
  }
}

// Apply to specific endpoints that store user content
@Post('comments')
create(@Body(SanitizationPipe) dto: CreateCommentDto) { ... }
```

**When NOT to sanitize**: API-to-API communication where the consumer is trusted. Sanitization adds ~0.1ms per field and can corrupt legitimate data (e.g., code snippets, markdown content). For rich text editors, use a whitelist approach: `ALLOWED_TAGS: ['p', 'b', 'i', 'a', 'ul', 'li']`.

---

## Security Audit Checklist

| Check | Tool/Method | Frequency |
|-------|-------------|-----------|
| Dependency vulnerabilities | `npm audit`, Snyk | Every CI build |
| SQL injection | Parameterized queries, SQLMap scan | Before each release |
| Auth bypass | Test @Public() routes, missing guards | Before each release |
| Rate limiting | Load test with k6/artillery | Monthly |
| CORS misconfiguration | `curl -H "Origin: evil.com"` | Before each release |
| Secrets in code | git-secrets, trufflehog | Every CI build |
| Header security | securityheaders.com | After infrastructure changes |
| SSL/TLS | ssllabs.com | Monthly |

**Concrete numbers**: A NestJS API with Helmet + rate limiting + CORS + validation pipe + parameterized queries covers ~90% of OWASP Top 10 attack vectors. The remaining 10% requires application-specific logic (business logic flaws, access control bugs).
