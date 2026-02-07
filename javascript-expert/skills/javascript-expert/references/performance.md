# Performance

## V8 Internals: Hidden Classes and Inline Caches

V8 compiles JavaScript through a pipeline: Parser -> Ignition (bytecode interpreter) -> Sparkplug (baseline compiler) -> Maglev (mid-tier) -> TurboFan (optimizing compiler). Understanding it prevents deoptimization.

### Hidden Classes (Maps in V8)

Every object has a hidden class (V8 calls it a "Map"). Objects with the same property names added in the same order share a hidden class, enabling fast property access.

```javascript
// GOOD: consistent property order -- same hidden class
function createUser(name, age) {
  return { name, age }; // always name then age
}
const users = Array.from({ length: 10000 }, (_, i) => createUser(`user${i}`, i));
// All 10000 objects share one hidden class -> fast property access via inline cache

// BAD: inconsistent property order -- separate hidden classes
function createUserBad(data) {
  const user = {};
  if (data.age) user.age = data.age;   // sometimes age first
  if (data.name) user.name = data.name; // sometimes name first
  return user;
}
// Objects get different hidden classes -> inline cache misses -> 10-100x slower property access

// BAD: adding properties after construction
const obj = {};
obj.x = 1; // hidden class transition 1
obj.y = 2; // hidden class transition 2
obj.z = 3; // hidden class transition 3
// Each property addition creates a new hidden class
// Prefer: const obj = { x: 1, y: 2, z: 3 }; // one hidden class

// BAD: deleting properties (ruins hidden class, converts to dictionary mode)
delete obj.x; // forces slow "dictionary mode" -- 10x slower property access
// Prefer: obj.x = undefined; // preserves hidden class shape
```

### Inline Caches (ICs)

V8 caches the hidden class at each property access site. Monomorphic (1 type) = fast, polymorphic (2-4 types) = slower, megamorphic (5+ types) = very slow.

```javascript
// GOOD: monomorphic -- always same shape
function getAge(user) { return user.age; } // IC: monomorphic after first call
users.forEach(u => getAge(u)); // all same hidden class -> blazing fast

// BAD: megamorphic -- many shapes at one call site
function getAgeBad(thing) { return thing.age; }
getAgeBad({ age: 1, name: 'a' });        // shape 1
getAgeBad({ name: 'b', age: 2 });        // shape 2
getAgeBad({ age: 3, active: true });     // shape 3
getAgeBad({ age: 4, id: 1 });           // shape 4
getAgeBad({ age: 5, x: 0, y: 0 });     // shape 5 -> megamorphic, IC abandoned
// After 5+ shapes, V8 gives up caching: generic property lookup every time
```

### Deoptimization Triggers

```javascript
// V8 deoptimizes (falls back to interpreter) when assumptions are violated:

// 1. Type change: function optimized for numbers, then called with string
function add(a, b) { return a + b; }
add(1, 2);      // optimized for int32
add(1.5, 2.5);  // deoptimized: now doubles
add('a', 'b');  // deoptimized again: now strings

// 2. Arguments object: using arguments in ways that prevent optimization
function bad() {
  return Array.from(arguments); // prevents optimization in some V8 versions
}
function good(...args) { return args; } // rest params: always optimizable

// 3. try-catch (historically problematic, mostly fixed in V8 10.2+/Node 18+)
// In older V8, try-catch body was never optimized. Now it's fine.

// 4. eval: any function containing eval is never optimized
function neverOptimized(code) { return eval(code); } // don't do this
```

**Diagnostic**: Run `node --trace-deopt app.js` to see deoptimization events. Look for "eager" deopt (type assumption wrong) vs "lazy" deopt (map check failed).

## Memory Profiling

### Heap Snapshots

```javascript
// Take heap snapshot programmatically
import { writeHeapSnapshot } from 'node:v8';

// Trigger snapshot on memory threshold
const HEAP_LIMIT = 512 * 1024 * 1024; // 512MB
setInterval(() => {
  const { heapUsed } = process.memoryUsage();
  if (heapUsed > HEAP_LIMIT) {
    const path = writeHeapSnapshot();
    console.error(`Heap snapshot written to ${path} (${(heapUsed / 1e6).toFixed(0)}MB)`);
  }
}, 30_000);

// Signal-triggered snapshot (production debugging)
process.on('SIGUSR2', () => {
  const path = writeHeapSnapshot();
  console.log(`Heap snapshot: ${path}`);
});
// Trigger: kill -USR2 <pid>
```

**Analysis workflow**: Take two snapshots 60s apart. In Chrome DevTools (Memory tab), compare them. Sort by "Alloc. size" delta. Growing `Map`, `Array`, or `(closure)` entries indicate leaks.

### Common Memory Leak Patterns

```javascript
// LEAK 1: Closures capturing more than needed
function createHandler(hugeData) {
  const id = hugeData.id; // only need id
  return () => {
    // hugeData is GC'd because it's not referenced
    // BUT if you reference hugeData directly:
    // return () => { console.log(hugeData.id); }
    // then the ENTIRE object is retained by the closure
    console.log(id);
  };
}

// LEAK 2: Unbounded caches
const cache = new Map();
function cachedFetch(url) {
  if (cache.has(url)) return cache.get(url);
  const result = fetch(url).then(r => r.json());
  cache.set(url, result); // grows forever
  return result;
}
// FIX: LRU cache with max size, or use WeakRef
class LRUCache {
  #max;
  #cache = new Map();
  constructor(max = 1000) { this.#max = max; }
  get(key) {
    const value = this.#cache.get(key);
    if (value !== undefined) {
      this.#cache.delete(key);
      this.#cache.set(key, value); // move to end (most recent)
    }
    return value;
  }
  set(key, value) {
    this.#cache.delete(key);
    this.#cache.set(key, value);
    if (this.#cache.size > this.#max) {
      this.#cache.delete(this.#cache.keys().next().value); // evict oldest
    }
  }
}

// LEAK 3: Event listeners on long-lived emitters
server.on('connection', (socket) => {
  socket.on('data', handler); // fine: cleaned up when socket closes
  server.on('broadcast', (msg) => socket.write(msg)); // LEAK: listener on server outlives socket
  // FIX: remove listener when socket closes, or use AbortSignal
});

// WeakRef for soft caches (ES2021)
const softCache = new Map();
function getCached(key, factory) {
  const ref = softCache.get(key);
  const cached = ref?.deref();
  if (cached !== undefined) return cached;
  const value = factory();
  softCache.set(key, new WeakRef(value));
  return value;
}
```

**Numbers**: A typical Express app leaks ~1KB/request without cleanup. At 1000 req/sec, that's ~3.6GB/hour. Monitor `process.memoryUsage().heapUsed` over time; any upward trend is a leak.

## Event Loop Monitoring

```javascript
import { monitorEventLoopDelay } from 'node:perf_hooks';

// Sample event loop delay at 20ms resolution
const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

// Check periodically
setInterval(() => {
  const p50 = histogram.percentile(50) / 1e6; // convert ns to ms
  const p99 = histogram.percentile(99) / 1e6;
  const max = histogram.max / 1e6;

  console.log(`Event loop delay: p50=${p50.toFixed(1)}ms p99=${p99.toFixed(1)}ms max=${max.toFixed(1)}ms`);

  if (p99 > 100) {
    console.warn('Event loop blocked: p99 > 100ms');
    // Trigger profiling, alert, or shed load
  }

  histogram.reset();
}, 10_000);
```

**Thresholds**:
- p50 < 5ms: healthy
- p50 5-20ms: some blocking, investigate
- p50 > 20ms: significant blocking, users notice
- p99 > 100ms: critical, some requests are severely delayed
- max > 1000ms: something is very wrong (synchronous I/O, large JSON.parse, etc.)

**Blocked event loop detection**:
```javascript
// Simpler approach: detect if event loop is stuck
let lastCheck = Date.now();
setInterval(() => {
  const now = Date.now();
  const delay = now - lastCheck - 1000; // expected interval is 1000ms
  if (delay > 200) {
    console.warn(`Event loop blocked for ${delay}ms`);
  }
  lastCheck = now;
}, 1000).unref();
```

## Web Vitals (Browser)

### LCP (Largest Contentful Paint)

Target: < 2.5s. Measures when the largest visible element finishes rendering.

```javascript
// Observe LCP
new PerformanceObserver((list) => {
  const entries = list.getEntries();
  const lastEntry = entries.at(-1); // last reported is the final LCP
  console.log('LCP:', lastEntry.startTime.toFixed(0), 'ms');
  // Common causes of bad LCP:
  // - Render-blocking CSS/JS (>100KB blocking resources)
  // - Unoptimized hero image (use srcset, fetchpriority="high")
  // - Server response time (TTFB > 800ms)
}).observe({ type: 'largest-contentful-paint', buffered: true });
```

### INP (Interaction to Next Paint)

Target: < 200ms. Measures responsiveness to user input.

```javascript
// INP is the worst interaction latency (excluding outliers)
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 200) {
      console.warn('Slow interaction:', {
        type: entry.name,           // 'click', 'keydown', etc.
        duration: entry.duration,   // total time from input to next paint
        target: entry.target,       // DOM element that was interacted with
        processingStart: entry.processingStart - entry.startTime, // input delay
        processingTime: entry.processingEnd - entry.processingStart, // handler time
        presentationDelay: entry.duration - (entry.processingEnd - entry.startTime), // rendering
      });
    }
  }
}).observe({ type: 'event', durationThreshold: 16, buffered: true });
```

**Fix slow INP**: If input delay is high, main thread is blocked before handler runs (reduce JS on page load). If processing time is high, handler is too expensive (break into chunks or use Web Worker). If presentation delay is high, too much DOM mutation (batch DOM updates).

### CLS (Cumulative Layout Shift)

Target: < 0.1. Measures visual stability.

```javascript
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) { // ignore user-initiated shifts
      console.log('Layout shift:', entry.value.toFixed(4), entry.sources?.[0]?.node);
    }
  }
}).observe({ type: 'layout-shift', buffered: true });
```

**Common CLS causes**: Images without `width`/`height` attributes, dynamically injected content above the fold, web fonts causing FOIT/FOUT (use `font-display: swap` + `size-adjust`).

## Bundle Optimization

### Barrel File Problem

```javascript
// utils/index.js -- barrel file re-exports everything
export * from './string.js';  // 50 functions, 20KB
export * from './array.js';   // 30 functions, 15KB
export * from './date.js';    // 20 functions, 25KB

// Consumer only needs one function
import { capitalize } from './utils';
// Webpack 4: pulls in ALL 60KB
// Webpack 5: better, but still resolves all modules
// Vite dev: resolves all modules, adds ~200ms to HMR

// FIX: import directly
import { capitalize } from './utils/string.js';
```

**Measurement**: Use `npx source-map-explorer dist/main.js` or `npx webpack-bundle-analyzer dist/stats.json` to visualize what's in your bundle.

### Code Splitting Strategies

```javascript
// 1. Route-based (most impactful): split per page/route
const Dashboard = lazy(() => import('./pages/Dashboard'));

// 2. Component-based: split heavy components
const Chart = lazy(() => import('./components/HeavyChart'));

// 3. Library-based: split large dependencies
// In Vite/Rollup config:
// build.rollupOptions.output.manualChunks: { 'vendor-chart': ['chart.js'] }

// 4. Conditional: load polyfills only when needed
if (!('structuredClone' in globalThis)) {
  await import('./polyfills/structured-clone.js');
}
```

**Target**: Initial JS bundle < 150KB gzipped for good LCP. Each subsequent route chunk < 50KB gzipped. Use `performance.getEntriesByType('resource')` to measure actual transfer sizes.

### Tree Shaking Failures

```javascript
// Side-effect detection: these prevent tree shaking

// 1. Module-level side effects
console.log('loaded'); // bundler must keep this
globalThis.myLib = {};  // side effect

// 2. Property access on imported namespace (may trigger getters)
import * as utils from './utils';
const fn = utils[dynamicKey]; // bundler can't tree-shake, keeps everything

// 3. Class decorators or initialization
@injectable() // side effect: function call at module evaluation
class Service {}

// Tell bundler: "this module is side-effect-free"
// package.json: "sideEffects": false
// Or per-statement: /*#__PURE__*/ createFactory()
```

## Flame Graphs

```bash
# Node.js flame graph with --prof
node --prof app.js
# Generate processed output:
node --prof-process isolate-*.log > processed.txt

# 0x: interactive flame graph
npx 0x app.js
# Generates HTML flame graph; look for wide bars (= time spent)

# clinic.js: automated profiling
npx clinic doctor -- node app.js
npx clinic flame -- node app.js
npx clinic bubbleprof -- node app.js  # async flow visualization
```

**Reading flame graphs**: Width = time spent. Tall stacks = deep call chains (not necessarily slow). Look for wide plateaus -- those are functions consuming the most CPU. Search for your code (not V8 internals) at the top of wide stacks.

**Production profiling**: Use `--perf-basic-prof` flag and Linux `perf` for low-overhead profiling in production. CPU overhead: ~1-3% with perf, vs ~10-30% with `--prof`.

## JSON.parse Performance

```javascript
// JSON.parse is single-threaded and blocks the event loop
// Threshold: JSON.parse of >10MB takes >50ms on typical hardware

// For large payloads, parse in a Worker
import { Worker, isMainThread, parentPort } from 'node:worker_threads';

async function parseLargeJSON(jsonString) {
  if (jsonString.length < 1_000_000) {
    return JSON.parse(jsonString); // <1MB: parse inline, overhead not worth it
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL(import.meta.url), // self-referencing worker
      { workerData: jsonString }
    );
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}

if (!isMainThread) {
  const { workerData } = await import('node:worker_threads');
  parentPort.postMessage(JSON.parse(workerData));
}

// Even better: use streaming JSON parser for very large files
// jsonl (newline-delimited JSON) avoids the problem entirely
```
