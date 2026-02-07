# Authentication & Authorization — Production Patterns

> NestJS 10+ | @nestjs/passport 10+ | @nestjs/jwt 10+ | @casl/ability 6+

## Guard Execution Order (NestJS 10+)

Guards execute in a deterministic order that causes subtle bugs when misunderstood.

```
Global Guards (APP_GUARD) → Controller Guards → Route Guards
```

**Critical**: APP_GUARD providers execute in **registration order** in the module. If `JwtAuthGuard` is registered after `RolesGuard`, roles check runs on an unauthenticated request.

```typescript
// app.module.ts — ORDER MATTERS
@Module({
  providers: [
    // Auth MUST come first — it populates req.user
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Roles reads req.user set by JwtAuthGuard
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
```

### @Public() Decorator Priority

`@Public()` must be checked by every global guard, not just `JwtAuthGuard`. If `RolesGuard` does not check `isPublic`, public routes with no user will throw.

```typescript
// Reusable metadata check — every APP_GUARD should call this
const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

function isPublicRoute(reflector: Reflector, context: ExecutionContext): boolean {
  return reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
}
```

**Failure mode**: Forgetting `getAllAndOverride` and using `get` instead. `get` only checks the handler, not the class. A `@Public()` on the controller class will be ignored.

---

## Refresh Token Rotation with Separate Secret

**The bug in most tutorials**: signing refresh tokens with `JWT_SECRET` means a leaked refresh token can be used as an access token against any endpoint that only verifies the signature.

```typescript
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async login(user: User): Promise<TokenPair> {
    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });

    // SEPARATE secret — a leaked refresh token cannot authenticate API calls
    const refreshToken = this.jwtService.sign(
      { ...payload, tokenFamily: randomUUID() },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );

    // Store refresh token hash for rotation detection
    await this.redis.set(
      `refresh:${user.id}:${refreshToken}`,
      'valid',
      'EX',
      7 * 24 * 3600,
    );

    return { accessToken, refreshToken };
  }

  async refresh(oldRefreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(oldRefreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if this refresh token was already used (replay detection)
    const key = `refresh:${payload.sub}:${oldRefreshToken}`;
    const isValid = await this.redis.get(key);

    if (!isValid) {
      // Token reuse detected — revoke entire family
      await this.revokeAllTokens(payload.sub);
      throw new UnauthorizedException('Token reuse detected — all sessions revoked');
    }

    // Invalidate the old token before issuing a new pair
    await this.redis.del(key);

    const user = await this.usersService.findOneOrFail(payload.sub);
    return this.login(user);
  }

  async revokeAllTokens(userId: string): Promise<void> {
    // Scan and delete all refresh tokens for this user
    const keys = await this.redis.keys(`refresh:${userId}:*`);
    if (keys.length) await this.redis.del(...keys);
  }
}
```

**Trade-offs of token rotation**:
- Pro: Detects token theft (reuse of invalidated token)
- Pro: Limits window of compromise to single refresh interval
- Con: Requires server-side state (Redis), negating pure JWT statelessness
- Con: Race condition if client sends parallel requests with same refresh token — use a short grace period (~10s) or mutex

**Failure mode**: Redis evicts keys under memory pressure (if `maxmemory-policy` is `allkeys-lru`). Use `volatile-lru` and set TTL on all keys so refresh tokens are not silently evicted.

---

## Token Blacklisting for Logout

Stateless JWTs cannot be truly invalidated. For logout, blacklist the token's `jti` until expiry.

```typescript
@Injectable()
export class TokenBlacklistService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async blacklist(token: string): Promise<void> {
    const decoded = decode(token) as JwtPayload;
    if (!decoded?.exp || !decoded?.jti) return;

    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      // Only store until natural expiry — no storage waste
      await this.redis.set(`blacklist:${decoded.jti}`, '1', 'EX', ttl);
    }
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    return (await this.redis.exists(`blacklist:${jti}`)) === 1;
  }
}
```

Integrate into `JwtAuthGuard`:

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private blacklist: TokenBlacklistService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(this.reflector, context)) return true;

    const result = (await super.canActivate(context)) as boolean;
    if (!result) return false;

    const request = context.switchToHttp().getRequest();
    const jti = request.user?.jti;
    if (jti && (await this.blacklist.isBlacklisted(jti))) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return true;
  }
}
```

**Performance**: Redis `EXISTS` is O(1), adds ~0.1ms per request. At 10k RPS, blacklist check adds negligible latency. The real cost is the network round-trip (~0.5ms same-region).

---

## API Key Authentication for Service-to-Service

Use API keys for machine clients; JWTs for human users. Never mix them.

```typescript
// api-key.strategy.ts
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly apiKeyService: ApiKeyService) {
    super({
      // Custom header — X-API-Key is conventional
      headerFields: ['x-api-key'],
    });
  }

  async validate(apiKey: string): Promise<ServiceIdentity> {
    // Hash the key and look up — never store plaintext API keys
    const hash = createHash('sha256').update(apiKey).digest('hex');
    const identity = await this.apiKeyService.findByHash(hash);
    if (!identity || identity.revokedAt) {
      throw new UnauthorizedException('Invalid API key');
    }
    // Check rate limit tier, scopes, IP allowlist
    return identity;
  }
}

// Guard that accepts EITHER JWT or API key
@Injectable()
export class HybridAuthGuard implements CanActivate {
  constructor(
    private readonly jwtGuard: JwtAuthGuard,
    private readonly apiKeyGuard: AuthGuard('api-key'),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // API key takes precedence for service-to-service
    if (request.headers['x-api-key']) {
      return this.apiKeyGuard.canActivate(context) as Promise<boolean>;
    }

    return this.jwtGuard.canActivate(context) as Promise<boolean>;
  }
}
```

**When NOT to use API keys**: Browser-facing endpoints (keys leak in network tabs, cannot be rotated per-session). Use short-lived JWTs instead.

---

## CASL ABAC — Production Pattern (NestJS 10+)

RBAC (`@Roles('admin')`) breaks at scale when permissions depend on resource ownership or tenant context. CASL provides Attribute-Based Access Control.

```typescript
// casl-ability.factory.ts
@Injectable()
export class CaslAbilityFactory {
  createForUser(user: AuthUser) {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createMongoAbility,
    );

    if (user.role === 'admin') {
      can('manage', 'all');
      // Even admins cannot delete audit logs
      cannot('delete', 'AuditLog');
    } else {
      // Users can read own resources — conditions evaluated at query time
      can('read', 'Article', { authorId: user.id });
      can('update', 'Article', { authorId: user.id });
      can('read', 'Comment');
      can('create', 'Comment');
      // Users can only delete their own comments within 5 minutes
      can('delete', 'Comment', {
        authorId: user.id,
        createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
      });
    }

    return build({ detectSubjectType: (item) => item.constructor.name as any });
  }
}

// policies.guard.ts — generic guard that reads policy metadata
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private caslFactory: CaslAbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policies = this.reflector.getAllAndOverride<PolicyHandler[]>(
      CHECK_POLICIES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policies) return true;

    const { user } = context.switchToHttp().getRequest();
    const ability = this.caslFactory.createForUser(user);

    return policies.every((handler) =>
      typeof handler === 'function'
        ? handler(ability)
        : handler.handle(ability),
    );
  }
}

// Usage in controller
@Patch(':id')
@CheckPolicies((ability: AppAbility) => ability.can('update', 'Article'))
async update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
  // Guard already checked policy — but for ownership, also verify the resource
  const article = await this.articlesService.findOne(id);
  // Double-check: guard checks type-level, this checks instance-level
  ForbiddenError.from(ability).throwUnlessCan('update', article);
  return this.articlesService.update(id, dto);
}
```

**Trade-offs**:
- Pro: Handles complex rules (ownership, time-based, field-level)
- Pro: Abilities can be serialized to the frontend for UI permission checks
- Con: CASL conditions use MongoDB syntax — if you use SQL, you must translate conditions to WHERE clauses manually
- Con: ~2ms per ability build for complex rulesets (50+ rules). Cache per-request, not globally.

**When NOT to use CASL**: Simple role-based systems with fewer than 5 roles and no ownership rules. `@Roles()` guard is sufficient and faster.

---

## OAuth2/OIDC Integration (NestJS 10+)

```typescript
// google.strategy.ts
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private config: ConfigService) {
    super({
      clientID: config.getOrThrow('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      // PKCE for public clients (SPAs)
      pkce: true,
      state: true,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: GoogleProfile,
  ): Promise<AuthUser> {
    // Upsert pattern — create user on first OAuth login
    return this.usersService.findOrCreateFromOAuth({
      provider: 'google',
      providerId: profile.id,
      email: profile.emails[0].value,
      displayName: profile.displayName,
    });
  }
}
```

**Failure modes**:
- `state` parameter mismatch → CSRF attack or session cookie not set. Check SameSite cookie settings.
- Clock skew > 5 minutes → ID token validation fails. Use `ntpd` on servers.
- Token endpoint timeout → Google/provider outage. Implement circuit breaker with `@nestjs/terminus`.

**When NOT to use Passport strategies**: If you only need OIDC ID token validation (no OAuth flow), use `jose` library directly — Passport adds unnecessary callback flow overhead.
