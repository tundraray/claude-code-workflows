# Express to NestJS Migration — Production Strategy

> NestJS 10+ | Express 4.x → NestJS migration

## When to Migrate

**Migrate when**:
- Express app exceeds ~50 routes with no module structure
- Team spends >20% of time debugging dependency ordering or middleware sequencing
- Onboarding new developers takes >2 weeks due to implicit conventions
- You need built-in support for WebSockets, queues, or CQRS

**Do NOT migrate when**:
- Express app has <10 endpoints and serves its purpose
- Team has no TypeScript experience and timeline is <3 months
- App is in maintenance mode with no planned feature development
- Performance-critical microservice where NestJS overhead matters (~5-15% throughput reduction vs raw Express)

---

## Strangler Fig Pattern — Zero-Downtime Migration

Route traffic between Express (legacy) and NestJS (new) at the reverse proxy level.

### Phase 1: Nginx Routing

```nginx
upstream legacy_express {
    server 127.0.0.1:3000;
}

upstream new_nestjs {
    server 127.0.0.1:3001;
}

server {
    listen 80;

    # Migrated endpoints go to NestJS
    location /api/v2/orders {
        proxy_pass http://new_nestjs;
    }
    location /api/v2/payments {
        proxy_pass http://new_nestjs;
    }

    # Everything else stays on Express
    location / {
        proxy_pass http://legacy_express;
    }
}
```

**Trade-off**: Requires running two Node processes during migration. Memory usage doubles. Use this when migration takes >4 weeks.

### Phase 2: NestJS as Primary with Express Fallback

Once >70% of routes are migrated, flip the default:

```typescript
// main.ts — NestJS primary, Express for unmigrated routes
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const expressAdapter = app.getHttpAdapter().getInstance();

  // Mount legacy Express routes as catch-all fallback
  // Only unmigrated routes hit this — migrated routes are handled by NestJS controllers
  expressAdapter.use('/api/legacy', legacyExpressApp);

  await app.listen(3000);
}
```

---

## Reverse Proxy Configuration — Nginx Before NestJS

NestJS should never face the internet directly. Nginx handles TLS termination, rate limiting, request buffering, and static files.

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    # Buffer client request body before proxying — prevents slowloris
    client_body_buffer_size 16k;
    client_max_body_size 10m;

    # Proxy timeouts
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;

    # Headers
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;

    location /api {
        proxy_pass http://127.0.0.1:3000;
    }

    # Health check — no auth, no logging
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }
}
```

**NestJS trust proxy setting** — required when behind a reverse proxy:
```typescript
const app = await NestFactory.create(AppModule);
app.set('trust proxy', 1); // Trust first proxy — needed for req.ip, rate limiting
```

**Failure mode**: Without `trust proxy`, `req.ip` returns `127.0.0.1` (the proxy's IP), breaking IP-based rate limiting and audit logs.

---

## WebSocket Migration — Socket.IO to @nestjs/websockets

### Express Socket.IO (before)

```typescript
const io = require('socket.io')(server);
io.use(authMiddleware);
io.on('connection', (socket) => {
  socket.join(`room:${socket.user.tenantId}`);
  socket.on('message', (data) => { ... });
});
```

### NestJS WebSocket Gateway (after)

```typescript
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN },
  namespace: '/notifications',
  // Adapter handles scaling across processes
  transports: ['websocket'], // Skip long-polling — reduces server load by ~40%
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  afterInit() {
    this.logger.log('WebSocket gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      // Validate JWT from handshake — no Passport, manual verify
      const token = client.handshake.auth?.token;
      const payload = await this.jwtService.verifyAsync(token);
      client.data.user = payload;
      await client.join(`tenant:${payload.tenantId}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  // Emit to all clients in a tenant room
  notifyTenant(tenantId: string, event: string, data: any) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }
}
```

**Scaling**: For >1 NestJS instance, use `@socket.io/redis-adapter` so events propagate across processes:
```typescript
// main.ts
const pubClient = createClient({ url: REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);

const ioAdapter = new IoAdapter(app);
ioAdapter.createIOServer = (port, options) => {
  const server = new Server(options);
  server.adapter(createAdapter(pubClient, subClient));
  return server;
};
app.useWebSocketAdapter(ioAdapter);
```

---

## Background Jobs Migration — Bull to @nestjs/bull (NestJS 10+)

### Express with raw Bull (before)

```typescript
const Queue = require('bull');
const emailQueue = new Queue('email', REDIS_URL);
emailQueue.process(async (job) => { ... });
emailQueue.add({ to: 'user@example.com', template: 'welcome' });
```

### NestJS @nestjs/bullmq (after, NestJS 10+)

```typescript
// email.processor.ts
@Processor('email')
export class EmailProcessor extends WorkerHost {
  constructor(private readonly mailer: MailerService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    switch (job.name) {
      case 'welcome':
        await this.mailer.sendWelcome(job.data.to);
        break;
      case 'password-reset':
        await this.mailer.sendPasswordReset(job.data.to, job.data.token);
        break;
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  // Handle failures — called after all retries exhausted
  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`);
    // Alert on-call if critical job fails
    if (job.name === 'password-reset') {
      this.alerting.critical(`Password reset email failed for ${job.data.to}`);
    }
  }
}

// email.module.ts
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,  // Keep last 1000 completed jobs for debugging
        removeOnFail: 5000,      // Keep last 5000 failed for analysis
      },
    }),
  ],
  providers: [EmailProcessor, EmailProducer],
})
export class EmailModule {}
```

**Trade-off: Bull vs BullMQ**:
- Bull: Mature, wider adoption, but uses older Redis commands
- BullMQ (recommended for NestJS 10+): Better TypeScript support, flow/dependency features, uses Redis streams
- Both require Redis. For serverless, consider SQS or Cloud Tasks instead.

---

## Canary Deployment Pattern

Deploy NestJS alongside Express, routing a percentage of traffic to the new service.

```nginx
upstream backend {
    # 90% to Express, 10% to NestJS
    server express:3000 weight=9;
    server nestjs:3001 weight=1;
}
```

Monitor error rates and latency for the NestJS instance. If p99 latency increases >20% or error rate exceeds 1%, roll back by setting NestJS weight to 0.

**Kubernetes alternative**: Use Istio VirtualService with weighted routing.

---

## Feature Flags Pattern

Control which code path executes without redeployment. Essential during migration for instant rollback.

```typescript
// feature-flag.service.ts
@Injectable()
export class FeatureFlagService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async isEnabled(flag: string, context?: { userId?: string; tenantId?: string }): Promise<boolean> {
    // Check user/tenant override first
    if (context?.userId) {
      const userOverride = await this.redis.get(`ff:${flag}:user:${context.userId}`);
      if (userOverride !== null) return userOverride === '1';
    }

    if (context?.tenantId) {
      const tenantOverride = await this.redis.get(`ff:${flag}:tenant:${context.tenantId}`);
      if (tenantOverride !== null) return tenantOverride === '1';
    }

    // Global flag
    const global = await this.redis.get(`ff:${flag}`);
    return global === '1';
  }
}

// Usage in service — route between old and new implementation
@Injectable()
export class OrdersService {
  constructor(
    private readonly flags: FeatureFlagService,
    private readonly legacyOrders: LegacyOrdersService,
    private readonly newOrders: NewOrdersService,
  ) {}

  async create(dto: CreateOrderDto, user: AuthUser) {
    if (await this.flags.isEnabled('new-order-flow', { tenantId: user.tenantId })) {
      return this.newOrders.create(dto);
    }
    return this.legacyOrders.create(dto);
  }
}
```

**When NOT to use feature flags**: Short-lived A/B tests that will be cleaned up in <1 sprint. The flag checking adds ~0.5ms (Redis round-trip) per call. For hot paths at >5k RPS, cache flags locally with 30s TTL.

---

## Migration Estimation Guide

| Express App Size | Estimated Migration Time | Strategy |
|-----------------|-------------------------|----------|
| <20 routes, 1 dev | 2-3 weeks | Rewrite from scratch |
| 20-50 routes, 2-3 devs | 4-8 weeks | Module-by-module |
| 50-200 routes, 3-5 devs | 3-6 months | Strangler fig with canary |
| 200+ routes, 5+ devs | 6-12 months | Strangler fig with feature flags |

**Critical success factors**:
- Migrate tests first — they define the contract
- Keep Express running until NestJS replacement passes all tests
- Never migrate more than one module per sprint
- Monitor p50/p95/p99 latency after each module migration
