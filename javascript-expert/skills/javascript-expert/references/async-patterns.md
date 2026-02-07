# Asynchronous Patterns

## Retry with Exponential Backoff and Jitter

The naive `2^i` backoff causes thundering herd when many clients retry simultaneously. Always add jitter.

```javascript
// Full jitter (AWS recommended): random between 0 and exponential cap
// Decorrelated jitter: better spread than full jitter for high-contention scenarios
const retryWithBackoff = async (fn, {
  maxRetries = 3,
  baseDelay = 1000,
  maxDelay = 30_000,
  signal,                    // AbortSignal for cancellation
  shouldRetry = () => true,  // predicate on error
} = {}) => {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      signal?.throwIfAborted();
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !shouldRetry(error)) break;

      // Full jitter: uniform random in [0, min(cap, base * 2^attempt)]
      const exponential = Math.min(maxDelay, baseDelay * 2 ** attempt);
      const jittered = Math.random() * exponential;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, jittered);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(signal.reason);
        }, { once: true });
      });
    }
  }
  throw lastError;
};

// Usage: retry only on transient errors, cancel on abort
const controller = new AbortController();
const data = await retryWithBackoff(
  () => fetch('/api/data', { signal: controller.signal }).then(r => {
    if (r.status >= 500) throw new Error(`Server error: ${r.status}`);
    if (!r.ok) throw new PermanentError(r.status); // don't retry 4xx
    return r.json();
  }),
  { shouldRetry: e => !(e instanceof PermanentError), signal: controller.signal }
);
```

**Trade-off**: Full jitter has higher average latency than equal jitter but prevents correlated retries. For <10 clients, equal jitter (`exponential/2 + random(exponential/2)`) gives lower p50.

## AsyncQueue / Semaphore

```javascript
// Semaphore: controls concurrent access to a resource
// Unlike AsyncQueue, callers acquire/release explicitly
class AsyncSemaphore {
  #permits;
  #waiting = [];

  constructor(permits) { this.#permits = permits; }

  async acquire(signal) {
    if (this.#permits > 0) {
      this.#permits--;
      return;
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      this.#waiting.push(waiter);
      signal?.addEventListener('abort', () => {
        const idx = this.#waiting.indexOf(waiter);
        if (idx !== -1) this.#waiting.splice(idx, 1);
        reject(signal.reason);
      }, { once: true });
    });
  }

  release() {
    const next = this.#waiting.shift();
    if (next) next.resolve();
    else this.#permits++;
  }
}

// Rate-limited API calls: max 5 concurrent, abort all on failure
const sem = new AsyncSemaphore(5);
const results = await Promise.all(urls.map(async (url) => {
  await sem.acquire(signal);
  try { return await fetch(url, { signal }); }
  finally { sem.release(); }
}));
```

**When NOT to use**: If tasks are independent and you just need to limit concurrency, `AsyncQueue.run()` (below) is simpler. Use Semaphore when you need acquire/release semantics across non-uniform critical sections.

```javascript
// AsyncQueue: fire-and-forget concurrency limiter
class AsyncQueue {
  #queue = [];
  #running = 0;
  #concurrency;

  constructor(concurrency = 3) { this.#concurrency = concurrency; }

  async run(fn) {
    while (this.#running >= this.#concurrency) {
      await new Promise(resolve => this.#queue.push(resolve));
    }
    this.#running++;
    try { return await fn(); }
    finally {
      this.#running--;
      this.#queue.shift()?.();
    }
  }

  get pending() { return this.#queue.length; }
  get active() { return this.#running; }
}
```

## Explicit Resource Management (ES2024)

`using` / `Symbol.asyncDispose` ensures cleanup even when exceptions occur. Requires Node 22+ or TypeScript 5.2+ with `--lib esnext`.

```javascript
// Database connection with guaranteed cleanup
class DbConnection {
  #conn;
  constructor(conn) { this.#conn = conn; }

  async query(sql, params) { return this.#conn.query(sql, params); }

  async [Symbol.asyncDispose]() {
    await this.#conn.end();
  }
}

async function transferFunds(fromId, toId, amount) {
  await using conn = new DbConnection(await pool.getConnection());
  await using tx = await conn.beginTransaction();
  // If anything throws, connection and transaction are cleaned up
  await conn.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromId]);
  await conn.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toId]);
  await tx.commit();
} // conn[Symbol.asyncDispose]() called here automatically

// File handle cleanup
async function processFile(path) {
  await using file = await fs.open(path, 'r');
  // file is guaranteed to close even on throw
  for await (const line of file.readLines()) {
    if (line.includes('ERROR')) throw new Error('Found error');
  }
} // file[Symbol.asyncDispose]() called here
```

**Failure mode**: `Symbol.asyncDispose` errors during cleanup are swallowed if the body also threw. Use a `DisposableStack` to aggregate cleanup errors:

```javascript
async function multiResource() {
  await using stack = new AsyncDisposableStack();
  const db = stack.use(await getDbConnection());
  const cache = stack.use(await getCacheConnection());
  // Both cleaned up in reverse order; errors aggregated as SuppressedError
}
```

## AsyncLocalStorage (Node 14+)

Request-scoped context without passing it through every function. Critical for logging correlation IDs, tenant isolation, tracing.

```javascript
import { AsyncLocalStorage } from 'node:async_hooks';

const requestContext = new AsyncLocalStorage();

// Middleware sets context per request
function contextMiddleware(req, res, next) {
  const store = {
    requestId: req.headers['x-request-id'] ?? crypto.randomUUID(),
    tenantId: req.headers['x-tenant-id'],
    startTime: performance.now(),
  };
  requestContext.run(store, next);
}

// Any function in the call chain can read it -- no parameter drilling
function getLogger() {
  const ctx = requestContext.getStore();
  return {
    info(msg, data) {
      console.log(JSON.stringify({
        level: 'info', msg, ...data,
        requestId: ctx?.requestId,
        tenantId: ctx?.tenantId,
        elapsed: ctx ? performance.now() - ctx.startTime : undefined,
      }));
    }
  };
}

// Works across async boundaries automatically
async function handleOrder(orderId) {
  const log = getLogger(); // gets request context
  log.info('Processing order', { orderId });
  await chargePayment(orderId); // log inside here also gets same context
}
```

**Performance**: ~3-5% overhead per async operation. Measured on Node 20: 850ns per `run()` call. Negligible for HTTP handlers, significant for tight loops (>100k/sec).

**When NOT to use**: Hot paths with >100k operations/sec. Use explicit parameter passing instead.

## Backpressure in Streams

Ignoring backpressure causes unbounded memory growth. The `drain` event and `highWaterMark` are the core mechanisms.

```javascript
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

// Problem: fast producer, slow consumer
// This WILL exhaust memory on large files without backpressure handling
async function dangerousCopy(src, dest) {
  const reader = createReadStream(src);
  const writer = createWriteStream(dest);
  reader.on('data', chunk => writer.write(chunk)); // no backpressure!
}

// Correct: pipeline handles backpressure and cleanup automatically
async function safeCopy(src, dest) {
  await pipeline(
    createReadStream(src, { highWaterMark: 64 * 1024 }), // 64KB chunks
    new Transform({
      highWaterMark: 64 * 1024,
      transform(chunk, _enc, cb) {
        // Simulate slow processing: if transform is slower than read,
        // pipeline automatically pauses the readable
        const processed = processChunk(chunk);
        cb(null, processed);
      }
    }),
    createWriteStream(dest)
  );
}

// Manual backpressure when you can't use pipeline
function manualBackpressure(readable, writable) {
  readable.on('data', (chunk) => {
    const canContinue = writable.write(chunk);
    if (!canContinue) {
      readable.pause(); // stop reading until drain
    }
  });
  writable.on('drain', () => {
    readable.resume(); // writer caught up, resume reading
  });
  readable.on('end', () => writable.end());
}
```

**Diagnostic**: If `process.memoryUsage().heapUsed` climbs linearly during stream processing, you have a backpressure problem. Check `writable.writableLength` vs `writable.writableHighWaterMark`.

**Threshold**: Default `highWaterMark` is 16KB for streams, 16 objects for object mode. Increase to 64-256KB for file I/O, decrease to 1-4KB for network to reduce latency.

## Promise Memory Leak Patterns

```javascript
// LEAK: Promises stored in Map but never removed on timeout/cancellation
class RequestTracker {
  #pending = new Map();

  // BUG: if response never arrives, entry stays forever
  track(id) {
    return new Promise((resolve) => {
      this.#pending.set(id, resolve);
    });
  }

  // FIX: timeout + cleanup
  track(id, timeoutMs = 30_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Request ${id} timed out`));
      }, timeoutMs);

      this.#pending.set(id, (value) => {
        clearTimeout(timer);
        this.#pending.delete(id);
        resolve(value);
      });
    });
  }
}

// LEAK: AbortController not cleaned up after successful operation
async function fetchWithAbort(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout); // prevents AbortController from lingering
  }
}

// LEAK: Event listeners on long-lived emitters without removal
emitter.on('data', handler); // if emitter outlives the consumer
// FIX: use AbortSignal for automatic cleanup
emitter.on('data', handler, { signal }); // removed when signal aborts
```

**Diagnostic**: Take two heap snapshots 60s apart. Filter by "Detached" in Chrome DevTools. Growing `Promise` or `AbortController` count indicates a leak.

## Async Generators for Pagination

```javascript
// Paginated API with cancellation and rate limiting
async function* paginateAPI(baseUrl, { signal, rateLimit = 100 } = {}) {
  let cursor = null;
  const sem = new AsyncSemaphore(1);

  do {
    signal?.throwIfAborted();
    await sem.acquire();
    const timer = setTimeout(() => sem.release(), rateLimit);

    try {
      const url = new URL(baseUrl);
      if (cursor) url.searchParams.set('cursor', cursor);

      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`API error: ${res.status}`, { cause: res });

      const { data, nextCursor } = await res.json();
      cursor = nextCursor;
      yield data;
    } catch (e) {
      clearTimeout(timer);
      sem.release();
      throw e;
    }
  } while (cursor);
}

// Consumer can break early; generator cleanup runs automatically
for await (const page of paginateAPI('/api/items', { signal })) {
  const found = page.find(item => item.id === targetId);
  if (found) break; // generator return() called, resources cleaned up
}
```

## Error Handling: Error.cause Chain (ES2022)

```javascript
// Build debuggable error chains instead of swallowing context
async function getUser(id) {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    throw new Error(`Failed to fetch user ${id}`, { cause: error });
  }
}

async function processOrder(orderId) {
  try {
    const order = await getOrder(orderId);
    const user = await getUser(order.userId);
    return await chargeUser(user, order.total);
  } catch (error) {
    // Full chain: "processOrder failed" -> "Failed to fetch user 42" -> "HTTP 503"
    throw new Error(`processOrder(${orderId}) failed`, { cause: error });
  }
}

// Extract full chain for logging
function errorChain(error) {
  const chain = [];
  let current = error;
  while (current) {
    chain.push(current.message);
    current = current.cause;
  }
  return chain;
}
// ["processOrder(123) failed", "Failed to fetch user 42", "HTTP 503"]
```

## AbortController Patterns

```javascript
// Composite abort: timeout OR user cancellation OR parent abort
function compositeAbort(timeoutMs, parentSignal) {
  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(new Error('Timeout')), timeoutMs);

  parentSignal?.addEventListener('abort', () => {
    clearTimeout(timer);
    controller.abort(parentSignal.reason);
  }, { once: true });

  // Cleanup function to prevent timer leak
  const cleanup = () => clearTimeout(timer);

  return { signal: controller.signal, abort: (r) => controller.abort(r), cleanup };
}

// AbortSignal.any() (Node 20+) -- combine multiple signals
const userAbort = new AbortController();
const timeoutSignal = AbortSignal.timeout(5000);
const combined = AbortSignal.any([userAbort.signal, timeoutSignal]);

await fetch('/api/data', { signal: combined });

// AbortSignal.timeout() -- built-in timeout (Node 18+)
await fetch('/api/data', { signal: AbortSignal.timeout(5000) });
```

## Event Loop: Chunked Processing

```javascript
// Process large dataset without blocking event loop
// Threshold: if processing takes >50ms, chunk it (drops below 20fps)
async function processLargeDataset(items, processFn, { chunkSize = 1000, signal } = {}) {
  const results = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    signal?.throwIfAborted();
    const chunk = items.slice(i, i + chunkSize);
    results.push(...chunk.map(processFn));

    // Yield to event loop between chunks via setImmediate (Node) or MessageChannel (browser)
    if (i + chunkSize < items.length) {
      await new Promise(resolve => {
        typeof setImmediate !== 'undefined'
          ? setImmediate(resolve)
          : new MessageChannel().port1.onmessage = resolve, queueMicrotask(() => {});
      });
    }
  }
  return results;
}
```

**When NOT to use**: If total processing is <50ms, chunking adds overhead for no benefit. Measure with `performance.now()` first. For CPU-heavy work (>500ms), use Worker threads instead of chunking.
