# Node.js Essentials

## Streams: pipeline, compose, Readable.from()

```javascript
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { Transform, Readable, compose } from 'node:stream';

// pipeline: automatic error propagation and cleanup
// If any stream errors, all streams are destroyed and resources freed
await pipeline(
  createReadStream('./access.log'),
  new Transform({
    transform(chunk, _enc, cb) {
      // Filter lines containing errors
      const lines = chunk.toString().split('\n')
        .filter(line => line.includes('ERROR'));
      cb(null, lines.join('\n'));
    }
  }),
  createGzip(),
  createWriteStream('./errors.log.gz')
);

// Readable.from(): create stream from async iterator or array
async function* generateRows(db) {
  let cursor = null;
  do {
    const batch = await db.query('SELECT * FROM logs WHERE id > $1 LIMIT 1000', [cursor ?? 0]);
    for (const row of batch) yield JSON.stringify(row) + '\n';
    cursor = batch.at(-1)?.id;
  } while (cursor);
}

await pipeline(
  Readable.from(generateRows(db)),
  createGzip(),
  createWriteStream('./export.jsonl.gz')
);

// stream.compose() (Node 18+): chain transforms into a single Duplex
// Useful for building reusable transform pipelines
const processLog = compose(
  async function* parse(source) {
    for await (const chunk of source) {
      yield JSON.parse(chunk);
    }
  },
  async function* filter(source) {
    for await (const entry of source) {
      if (entry.level === 'error') yield entry;
    }
  },
  async function* format(source) {
    for await (const entry of source) {
      yield `[${entry.timestamp}] ${entry.message}\n`;
    }
  }
);

// Use the composed transform as a single stream
await pipeline(createReadStream('./app.log'), processLog, createWriteStream('./errors.txt'));
```

**Backpressure rule**: Always use `pipeline()` or `stream.pipe()`, never manual `.on('data')` + `.write()` unless you explicitly handle `drain` events. See async-patterns.md for details.

**Threshold**: Default `highWaterMark` is 16KB (bytes mode) or 16 objects (object mode). For file I/O, 64-256KB reduces syscall overhead. For network streams, keep at 16KB to minimize latency.

## Buffer: alloc vs allocUnsafe

```javascript
// Buffer.alloc(size): zero-filled, safe, ~2x slower for large buffers
const safe = Buffer.alloc(1024); // all bytes are 0x00

// Buffer.allocUnsafe(size): uninitialized memory, fast, may contain old data
// ONLY use when you will immediately overwrite every byte
const fast = Buffer.allocUnsafe(1024);
fast.fill(0); // if you need zeroes, alloc() is clearer

// Buffer.from(): create from existing data
const fromString = Buffer.from('hello', 'utf-8');
const fromArray = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
const fromBase64 = Buffer.from('aGVsbG8=', 'base64');

// Encoding conversions
const hex = Buffer.from('secret').toString('hex'); // '736563726574'
const b64 = Buffer.from('secret').toString('base64'); // 'c2VjcmV0'

// Buffer pool: Node reuses an 8KB pool for allocUnsafe() < 4KB
// This means small allocUnsafe buffers share backing ArrayBuffer
// Bug source: if you slice and pass to native code, it may see adjacent data
const slice = Buffer.allocUnsafe(10); // shares 8KB pool
const isolated = Buffer.allocUnsafe(10).slice(); // force copy, no shared memory
```

**Performance**: `allocUnsafe` is ~30% faster for 1KB buffers, negligible for >1MB. Only matters in tight loops allocating thousands of buffers.

## AsyncLocalStorage: Request Context

```javascript
import { AsyncLocalStorage } from 'node:async_hooks';

// Create per-concern stores
const requestStore = new AsyncLocalStorage();
const tenantStore = new AsyncLocalStorage();

// Express middleware
function contextMiddleware(req, res, next) {
  const context = {
    requestId: req.headers['x-request-id'] ?? crypto.randomUUID(),
    userId: req.auth?.userId,
    startedAt: performance.now(),
  };
  requestStore.run(context, next);
}

// Available anywhere in the call chain without passing through parameters
function getRequestId() {
  return requestStore.getStore()?.requestId ?? 'no-request-context';
}

// Logger that automatically includes request context
const logger = {
  info(msg, data = {}) {
    const ctx = requestStore.getStore();
    console.log(JSON.stringify({
      level: 'info',
      msg,
      ...data,
      requestId: ctx?.requestId,
      userId: ctx?.userId,
      durationMs: ctx ? (performance.now() - ctx.startedAt).toFixed(1) : undefined,
    }));
  }
};

// Works across async boundaries: setTimeout, Promise, EventEmitter
async function processOrder(orderId) {
  logger.info('Processing order', { orderId }); // has request context
  await db.query('UPDATE orders SET status = $1', ['processing']); // context preserved
  setTimeout(() => {
    logger.info('Deferred work', { orderId }); // still has context
  }, 1000);
}
```

**Performance overhead**: ~3-5% per async operation on Node 20 (~850ns per `run()` call). Acceptable for HTTP handlers. Avoid in hot paths with >100k async ops/sec.

## `node:test` (Node 18+, stable in 20+)

Built-in test runner. No external dependencies needed.

```javascript
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('UserService', () => {
  let service;
  let mockDb;

  before(() => {
    // Built-in mocking (Node 22+)
    mockDb = {
      query: mock.fn(async () => [{ id: 1, name: 'Alice' }]),
    };
    service = new UserService(mockDb);
  });

  it('returns user by id', async () => {
    const user = await service.getById(1);
    assert.deepStrictEqual(user, { id: 1, name: 'Alice' });
    assert.strictEqual(mockDb.query.mock.callCount(), 1);
  });

  it('throws on not found', async () => {
    mockDb.query.mock.mockImplementation(async () => []);
    await assert.rejects(
      () => service.getById(999),
      { name: 'NotFoundError', message: /user 999/i }
    );
  });

  // Subtests
  it('handles concurrent access', async (t) => {
    await t.test('reads are safe', async () => { /* ... */ });
    await t.test('writes are serialized', async () => { /* ... */ });
  });

  // Snapshot testing (Node 22+)
  it('matches snapshot', async (t) => {
    const output = await service.format(testData);
    t.assert.snapshot(output);
  });
});

// Run: node --test ./tests/**/*.test.js
// Coverage: node --test --experimental-test-coverage
// Watch: node --test --watch
```

**When to use over Jest/Vitest**: Zero-dependency test suite, CI environments where npm install time matters, testing Node-specific features (workers, streams). **When NOT to use**: If you need JSX transforms, browser environment simulation, or rich snapshot diffing -- use Vitest.

## diagnostics_channel (Node 16+)

Structured observability without modifying library code. Libraries publish events; consumers subscribe.

```javascript
import diagnostics_channel from 'node:diagnostics_channel';

// Publishing (library side)
const channel = diagnostics_channel.channel('myapp:db:query');

async function query(sql, params) {
  const start = performance.now();
  try {
    const result = await pool.query(sql, params);
    channel.publish({
      sql, params, duration: performance.now() - start, rows: result.rowCount,
    });
    return result;
  } catch (error) {
    channel.publish({
      sql, params, duration: performance.now() - start, error,
    });
    throw error;
  }
}

// Subscribing (observability layer, separate from business logic)
diagnostics_channel.subscribe('myapp:db:query', (message) => {
  if (message.duration > 1000) {
    slowQueryLog.warn('Slow query', {
      sql: message.sql,
      duration: `${message.duration.toFixed(0)}ms`,
    });
  }
  metrics.histogram('db.query.duration', message.duration, {
    error: Boolean(message.error),
  });
});

// Built-in channels: Node publishes events for HTTP, net, etc.
diagnostics_channel.subscribe('http.client.request.start', (message) => {
  // Trace outbound HTTP requests
  message.request.setHeader('x-trace-id', currentTraceId());
});
```

**Trade-off vs EventEmitter**: `diagnostics_channel` is decoupled -- publisher doesn't know about subscribers. No risk of subscriber errors affecting the publisher. But it's fire-and-forget: no return values, no backpressure from subscribers.

## Worker Threads: Pool with Error Handling

```javascript
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

class WorkerPool {
  #workers = [];
  #queue = [];
  #workerPath;

  constructor(workerPath, size = navigator.hardwareConcurrency ?? 4) {
    this.#workerPath = workerPath;
    for (let i = 0; i < size; i++) {
      this.#addWorker();
    }
  }

  #addWorker() {
    const worker = new Worker(this.#workerPath);
    const entry = { worker, busy: false };

    worker.on('error', (err) => {
      console.error('Worker crashed, replacing:', err);
      const idx = this.#workers.indexOf(entry);
      if (idx !== -1) this.#workers.splice(idx, 1);
      this.#addWorker(); // replace crashed worker
    });

    this.#workers.push(entry);
  }

  execute(data) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ data, resolve, reject });
      this.#drain();
    });
  }

  #drain() {
    const available = this.#workers.find(w => !w.busy);
    if (!available || this.#queue.length === 0) return;

    const task = this.#queue.shift();
    available.busy = true;

    const onMessage = (result) => {
      cleanup();
      task.resolve(result);
    };
    const onError = (err) => {
      cleanup();
      task.reject(err);
    };
    const cleanup = () => {
      available.worker.off('message', onMessage);
      available.worker.off('error', onError);
      available.busy = false;
      this.#drain(); // process next task
    };

    available.worker.on('message', onMessage);
    available.worker.on('error', onError);
    available.worker.postMessage(task.data);
  }

  async destroy() {
    await Promise.all(this.#workers.map(w => w.worker.terminate()));
    this.#workers.length = 0;
  }
}

// Usage
const pool = new WorkerPool('./image-processor.js', 4);
const results = await Promise.all(
  images.map(img => pool.execute({ path: img, resize: { width: 800 } }))
);
await pool.destroy();
```

**When NOT to use Worker Threads**: For I/O-bound work (network requests, file reads). Workers add ~5-10ms startup overhead per thread and ~2MB memory. They are for CPU-bound tasks: image processing, crypto, parsing, compression.

## EventEmitter: Typed Events and Memory Leak Prevention

```javascript
import { EventEmitter } from 'node:events';

// Prevent memory leaks: default maxListeners is 10
// If you need more, explicitly set it (with a reason)
class OrderProcessor extends EventEmitter {
  constructor() {
    super();
    // 25 listeners: 1 logger + 1 metrics + 1 audit + up to 22 middleware
    this.setMaxListeners(25);
  }
}

// Use AbortSignal for automatic listener cleanup
const processor = new OrderProcessor();

function monitorOrders(signal) {
  processor.on('order', handleOrder, { signal });
  processor.on('error', handleError, { signal });
  // When signal aborts, both listeners are removed automatically
}

const controller = new AbortController();
monitorOrders(controller.signal);
// Later: controller.abort() removes all listeners

// EventEmitter.on() returns AsyncIterator (Node 16+)
import { on } from 'node:events';

async function processEvents(emitter, signal) {
  for await (const [event] of on(emitter, 'data', { signal })) {
    await handleEvent(event);
  }
}
```

## Graceful Shutdown

```javascript
import { createServer } from 'node:http';

function gracefulShutdown(server, { timeout = 30_000 } = {}) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down gracefully...`);

    // Stop accepting new connections
    server.close();

    // Force kill after timeout
    const forceTimer = setTimeout(() => {
      console.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, timeout);
    forceTimer.unref(); // don't prevent process exit if all else is done

    try {
      // Drain in-flight requests, close DB connections, flush metrics
      await Promise.all([
        drainConnections(server),
        closeDatabase(),
        flushMetrics(),
      ]);
      console.log('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled errors but don't immediately exit -- attempt graceful shutdown
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    shutdown('unhandledRejection');
  });
}

function drainConnections(server) {
  return new Promise((resolve) => {
    // server.close() callback fires when all connections are closed
    server.close(resolve);
    // Set timeout on existing keep-alive connections
    server.closeAllConnections?.(); // Node 18.2+
  });
}
```

**Kubernetes/Docker**: Containers get SIGTERM then SIGKILL after `terminationGracePeriodSeconds` (default 30s). Set shutdown timeout < grace period. Use `readinessProbe` to stop new traffic before shutdown begins.

## File System: Watch and Recursive Operations

```javascript
import { watch } from 'node:fs/promises';

// Recursive file watcher (Node 19+)
async function watchDirectory(dir, handler, signal) {
  const watcher = watch(dir, { recursive: true, signal });
  for await (const event of watcher) {
    // event.eventType: 'rename' | 'change'
    // event.filename: relative path
    if (event.filename.endsWith('.js')) {
      handler(event);
    }
  }
}

// Safe JSON file read
async function readJSON(path) {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`Failed to read JSON: ${path}`, { cause: err });
  }
}

// Atomic file write (prevents partial reads on crash)
import { writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

async function atomicWriteJSON(path, data) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, path); // rename is atomic on most filesystems
}
```

## Cluster: Multi-Core with Sticky Sessions

```javascript
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';

if (cluster.isPrimary) {
  const numWorkers = availableParallelism(); // Node 20+, better than cpus().length
  console.log(`Primary ${process.pid}: forking ${numWorkers} workers`);

  for (let i = 0; i < numWorkers; i++) cluster.fork();

  // Restart crashed workers with backoff
  let restartCount = 0;
  cluster.on('exit', (worker, code) => {
    if (code === 0) return; // clean exit
    restartCount++;
    if (restartCount > numWorkers * 3) {
      console.error('Too many worker crashes, exiting primary');
      process.exit(1);
    }
    const delay = Math.min(1000 * 2 ** (restartCount - 1), 30_000);
    setTimeout(() => cluster.fork(), delay);
  });
} else {
  // Worker: start server
  startServer();
}
```

**When NOT to use cluster**: If you're behind a reverse proxy (nginx, HAProxy) that can spawn multiple Node processes, cluster adds complexity without benefit. Also, for I/O-bound workloads, a single process with async I/O is usually sufficient. Use cluster for CPU-bound request processing.
