# Browser APIs

## WebSocket: Connection with Reconnect and Heartbeat

```javascript
// Production WebSocket: auto-reconnect, heartbeat, binary support, message queuing
class ResilientWebSocket {
  #url;
  #ws = null;
  #reconnectAttempt = 0;
  #maxReconnect;
  #heartbeatInterval;
  #heartbeatTimer = null;
  #pendingMessages = [];
  #listeners = new Map();

  constructor(url, { maxReconnect = 10, heartbeatMs = 30_000 } = {}) {
    this.#url = url;
    this.#maxReconnect = maxReconnect;
    this.#heartbeatInterval = heartbeatMs;
    this.#connect();
  }

  #connect() {
    this.#ws = new WebSocket(this.#url);
    this.#ws.binaryType = 'arraybuffer'; // avoid Blob overhead for binary

    this.#ws.onopen = () => {
      this.#reconnectAttempt = 0;
      this.#startHeartbeat();
      // Flush queued messages
      while (this.#pendingMessages.length > 0) {
        this.#ws.send(this.#pendingMessages.shift());
      }
      this.#emit('open');
    };

    this.#ws.onmessage = (event) => {
      if (event.data === 'pong') return; // heartbeat response
      this.#emit('message', event.data instanceof ArrayBuffer
        ? event.data
        : JSON.parse(event.data));
    };

    this.#ws.onclose = (event) => {
      this.#stopHeartbeat();
      if (event.code === 1000) return; // clean close
      this.#reconnect();
    };

    this.#ws.onerror = () => {
      this.#ws.close(); // triggers onclose -> reconnect
    };
  }

  #reconnect() {
    if (this.#reconnectAttempt >= this.#maxReconnect) {
      this.#emit('failed', new Error('Max reconnect attempts reached'));
      return;
    }
    // Exponential backoff with jitter, cap at 30s
    const base = Math.min(30_000, 1000 * 2 ** this.#reconnectAttempt);
    const jitter = Math.random() * base;
    this.#reconnectAttempt++;
    setTimeout(() => this.#connect(), jitter);
  }

  #startHeartbeat() {
    this.#heartbeatTimer = setInterval(() => {
      if (this.#ws.readyState === WebSocket.OPEN) {
        this.#ws.send('ping');
      }
    }, this.#heartbeatInterval);
  }

  #stopHeartbeat() { clearInterval(this.#heartbeatTimer); }

  send(data) {
    const msg = typeof data === 'string' || data instanceof ArrayBuffer
      ? data : JSON.stringify(data);
    if (this.#ws.readyState === WebSocket.OPEN) {
      this.#ws.send(msg);
    } else {
      this.#pendingMessages.push(msg); // queue until reconnected
    }
  }

  on(event, fn) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(fn);
  }

  #emit(event, data) {
    this.#listeners.get(event)?.forEach(fn => fn(data));
  }

  close() {
    this.#maxReconnect = 0; // prevent reconnect
    this.#stopHeartbeat();
    this.#ws.close(1000);
  }
}
```

**WebSocket vs SSE**: WebSocket is bidirectional, binary-capable, but requires sticky sessions behind load balancers. SSE is simpler, uses HTTP (works with CDN), auto-reconnects, but is server-to-client only. Use SSE for notifications/feeds; WebSocket for chat, gaming, collaborative editing.

**Failure mode**: WebSocket connections silently die behind NAT/proxy timeouts (typically 60-120s). Heartbeat interval must be shorter than the proxy timeout.

## Server-Sent Events (SSE)

```javascript
// SSE with custom reconnect logic and typed events
class TypedEventSource {
  #es;
  #handlers = new Map();
  #url;
  #lastEventId = null;

  constructor(url) {
    this.#url = url;
    this.#connect();
  }

  #connect() {
    const url = new URL(this.#url);
    if (this.#lastEventId) url.searchParams.set('lastEventId', this.#lastEventId);

    this.#es = new EventSource(url);

    // Named events (server sends `event: orderUpdate\ndata: {...}`)
    this.#handlers.forEach((handler, eventName) => {
      this.#es.addEventListener(eventName, (e) => {
        this.#lastEventId = e.lastEventId;
        handler(JSON.parse(e.data));
      });
    });

    this.#es.onerror = () => {
      // EventSource auto-reconnects with Last-Event-ID header
      // but we may want custom logic for auth token refresh
      if (this.#es.readyState === EventSource.CLOSED) {
        setTimeout(() => this.#connect(), 5000);
      }
    };
  }

  on(eventName, handler) {
    this.#handlers.set(eventName, handler);
    // If already connected, add listener
    this.#es?.addEventListener(eventName, (e) => {
      this.#lastEventId = e.lastEventId;
      handler(JSON.parse(e.data));
    });
  }

  close() { this.#es.close(); }
}

// Usage
const events = new TypedEventSource('/api/events');
events.on('orderUpdate', (data) => updateOrderUI(data));
events.on('notification', (data) => showToast(data.message));
```

**Limit**: Browsers cap SSE connections to 6 per domain (HTTP/1.1). Use HTTP/2 to avoid this limit. If you need >6 SSE streams on HTTP/1.1, multiplex through a single connection with event types.

## BroadcastChannel (Cross-Tab Communication)

```javascript
// Sync auth state across tabs -- user logs out in one tab, all tabs respond
const authChannel = new BroadcastChannel('auth');

// Tab that initiates logout
function logout() {
  clearSession();
  authChannel.postMessage({ type: 'logout', timestamp: Date.now() });
  window.location.href = '/login';
}

// All other tabs listen
authChannel.onmessage = (event) => {
  if (event.data.type === 'logout') {
    clearSession();
    window.location.href = '/login';
  }
  if (event.data.type === 'tokenRefresh') {
    updateToken(event.data.token);
  }
};

// Leader election: only one tab handles expensive polling
const leaderChannel = new BroadcastChannel('leader');
let isLeader = false;

function claimLeadership() {
  leaderChannel.postMessage({ type: 'claim', tabId: crypto.randomUUID() });
  // Simple: last claimant wins. For robustness, use timestamp + heartbeat.
  isLeader = true;
  startBackgroundSync(); // only leader polls server
}
```

**When NOT to use**: Cross-origin communication (use `postMessage` instead). BroadcastChannel is same-origin only. Also not suitable for large payloads (>1MB) -- use SharedWorker with MessagePort for that.

## Web Workers: Transferable Objects

```javascript
// Transfer ownership of large buffers instead of copying (zero-copy)
// main.js
const buffer = new ArrayBuffer(100 * 1024 * 1024); // 100MB
const worker = new Worker('/worker.js');

// BAD: structured clone copies the buffer (~50ms for 100MB)
worker.postMessage({ buffer });

// GOOD: transfer moves ownership (0ms, original becomes detached)
worker.postMessage({ buffer }, [buffer]);
// buffer.byteLength === 0 here -- ownership transferred

// worker.js: process and transfer back
self.onmessage = ({ data: { buffer } }) => {
  const view = new Float64Array(buffer);
  // ... heavy computation ...
  self.postMessage({ buffer }, [buffer]); // transfer back
};

// OffscreenCanvas: render without blocking main thread (Chrome 69+)
const canvas = document.getElementById('chart');
const offscreen = canvas.transferControlToOffscreen();
const renderWorker = new Worker('/render-worker.js');
renderWorker.postMessage({ canvas: offscreen }, [offscreen]);
```

**Trade-off**: Transferable objects are zero-copy but the source loses access. If you need the data in both threads, you must copy. For shared read access, use `SharedArrayBuffer` (requires `Cross-Origin-Isolation` headers: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`).

## Service Worker: Stale-While-Revalidate

```javascript
// sw.js: stale-while-revalidate with cache versioning
const CACHE_VERSION = 'v3';
const PRECACHE_URLS = ['/app.js', '/styles.css', '/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(key => key !== CACHE_VERSION)
        .map(key => caches.delete(key)) // purge old caches
      )
    ).then(() => self.clients.claim()) // take control of open pages
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // Return cached immediately, fetch update in background
      const networkFetch = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached ?? caches.match('/offline.html'));

      return cached ?? networkFetch;
    })
  );
});
```

**Failure mode**: Service worker update stuck -- users get stale code indefinitely. Always implement `skipWaiting()` + `clients.claim()` and a version check on the client that prompts reload when a new SW activates.

## File Upload with Progress (XMLHttpRequest)

`fetch()` does NOT support upload progress tracking. Use `XMLHttpRequest` for upload progress.

```javascript
function uploadWithProgress(url, file, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.({ loaded: event.loaded, total: event.total,
          percent: Math.round((event.loaded / event.total) * 100) });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}
```

**Note**: The Fetch API Streams spec (request body as ReadableStream) could enable upload progress via a custom stream, but browser support is inconsistent. `XMLHttpRequest` remains the reliable cross-browser solution.

## IntersectionObserver: Virtual Scrolling Trigger

```javascript
// Infinite scroll with request deduplication
class InfiniteScroller {
  #observer;
  #loading = false;
  #page = 1;
  #hasMore = true;

  constructor(sentinelEl, loadFn) {
    this.#observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !this.#loading && this.#hasMore) {
          this.#load(loadFn);
        }
      },
      { rootMargin: '200px' } // trigger 200px before sentinel is visible
    );
    this.#observer.observe(sentinelEl);
  }

  async #load(loadFn) {
    this.#loading = true;
    try {
      const { items, hasMore } = await loadFn(this.#page);
      this.#page++;
      this.#hasMore = hasMore;
      return items;
    } finally {
      this.#loading = false;
    }
  }

  destroy() { this.#observer.disconnect(); }
}
```

## ResizeObserver

```javascript
// Responsive component without media queries -- reacts to container size
const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    // contentBoxSize is more reliable than contentRect for writing-mode support
    const [size] = entry.contentBoxSize;
    const width = size.inlineSize;

    const el = entry.target;
    el.classList.toggle('compact', width < 400);
    el.classList.toggle('wide', width >= 800);
  }
});

observer.observe(document.querySelector('.dashboard-widget'));

// Debounce if handler is expensive (ResizeObserver fires at paint frequency)
function observeResizeDebounced(el, callback, delay = 150) {
  let timer;
  const ro = new ResizeObserver((entries) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(entries), delay);
  });
  ro.observe(el);
  return () => { clearTimeout(timer); ro.disconnect(); };
}
```

**When NOT to use**: If you only need viewport breakpoints, CSS media queries are zero-JS and more performant. ResizeObserver is for element-level responsiveness (container queries in CSS can also replace some uses).

## structuredClone()

Deep clone without `JSON.parse(JSON.stringify())` hacks. Handles `Date`, `RegExp`, `Map`, `Set`, `ArrayBuffer`, `Error` objects.

```javascript
const original = {
  date: new Date(),
  pattern: /test/gi,
  data: new Map([['key', { nested: [1, 2, 3] }]]),
  buffer: new ArrayBuffer(8),
};

const clone = structuredClone(original);
// clone.date instanceof Date === true (JSON hack would produce string)
// clone.data instanceof Map === true (JSON hack would produce {})
```

**Limitations**: Cannot clone `Function`, `DOM nodes`, `Symbol`, `WeakMap/WeakRef`, or objects with prototype chain. Throws `DataCloneError` on these. For functions, use a factory pattern instead of cloning.

## View Transitions API (Chrome 111+)

```javascript
// Smooth page transitions for SPA navigation
async function navigateTo(url) {
  if (!document.startViewTransition) {
    return updateDOM(url); // fallback for unsupported browsers
  }

  const transition = document.startViewTransition(async () => {
    const html = await fetch(url).then(r => r.text());
    document.querySelector('main').innerHTML = html;
  });

  // Wait for animation to complete (useful for cleanup)
  await transition.finished;
}

// Name elements for matched transitions (CSS)
// .card { view-transition-name: card-hero; }
// ::view-transition-old(card-hero) { animation: fade-out 0.3s; }
// ::view-transition-new(card-hero) { animation: fade-in 0.3s; }
```

**Trade-off**: View Transitions snapshot the old state as an image, so complex DOM transitions may flash. Keep transition duration <300ms to avoid visual artifacts. Not supported in Firefox/Safari as of 2024.

## requestIdleCallback()

```javascript
// Non-critical work: analytics, prefetch, cache warming
// Runs when browser is idle; deadline.timeRemaining() tells you how much time you have
function scheduleIdleWork(tasks) {
  function processNext(deadline) {
    while (tasks.length > 0 && deadline.timeRemaining() > 5) {
      // Only process if >5ms remaining; below that, overhead dominates
      const task = tasks.shift();
      task();
    }
    if (tasks.length > 0) {
      requestIdleCallback(processNext, { timeout: 2000 });
      // timeout: ensure work completes within 2s even if browser stays busy
    }
  }
  requestIdleCallback(processNext, { timeout: 2000 });
}

// Prefetch next page resources during idle
scheduleIdleWork([
  () => fetch('/api/next-page-data').then(r => r.json()).then(cache.set),
  () => import('./heavy-component.js'),
  () => sendAnalytics(performanceMetrics),
]);
```

**When NOT to use**: Anything user-visible or time-sensitive. `requestIdleCallback` may be delayed indefinitely under heavy load. Not available in Safari (polyfill with `setTimeout(fn, 1)` but loses idle semantics).

## IndexedDB: Transactional Store

```javascript
// Wrapper with proper error handling and transaction management
class Store {
  #dbPromise;

  constructor(dbName, version, upgrader) {
    this.#dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, version);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => upgrader(e.target.result, e.oldVersion);
    });
  }

  async #tx(storeName, mode, fn) {
    const db = await this.#dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = fn(store);
      tx.oncomplete = () => resolve(result.result ?? undefined);
      tx.onerror = () => reject(tx.error);
      // Result needs special handling for IDBRequest
      if (result instanceof IDBRequest) {
        result.onsuccess = () => resolve(result.result);
      }
    });
  }

  get(storeName, key) { return this.#tx(storeName, 'readonly', s => s.get(key)); }
  put(storeName, value) { return this.#tx(storeName, 'readwrite', s => s.put(value)); }
  delete(storeName, key) { return this.#tx(storeName, 'readwrite', s => s.delete(key)); }

  async getAll(storeName, query, count) {
    return this.#tx(storeName, 'readonly', s => s.getAll(query, count));
  }
}

// Usage
const db = new Store('app', 2, (db, oldVersion) => {
  if (oldVersion < 1) {
    const users = db.createObjectStore('users', { keyPath: 'id' });
    users.createIndex('email', 'email', { unique: true });
  }
  if (oldVersion < 2) {
    db.createObjectStore('cache', { keyPath: 'key' });
  }
});
```

**Storage limits**: IndexedDB quota varies -- Chrome: up to 80% of disk, Firefox: 50% up to 2GB, Safari: 1GB (prompts user beyond). Use `navigator.storage.estimate()` to check. For critical data, call `navigator.storage.persist()` to prevent eviction.

## Performance: Navigation Timing (Modern API)

`performance.timing` is deprecated. Use `PerformanceNavigationTiming`.

```javascript
// Correct modern approach
const [nav] = performance.getEntriesByType('navigation');
if (nav) {
  const metrics = {
    dns: nav.domainLookupEnd - nav.domainLookupStart,
    tcp: nav.connectEnd - nav.connectStart,
    ttfb: nav.responseStart - nav.requestStart,
    download: nav.responseEnd - nav.responseStart,
    domParse: nav.domInteractive - nav.responseEnd,
    domReady: nav.domContentLoadedEventEnd - nav.startTime,
    fullLoad: nav.loadEventEnd - nav.startTime,
  };
  // Send to analytics
  navigator.sendBeacon('/analytics', JSON.stringify(metrics));
}

// Long task detection (tasks >50ms that block main thread)
const longTaskObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 100) { // 100ms+ is a serious jank source
      console.warn('Long task detected:', {
        duration: `${entry.duration.toFixed(1)}ms`,
        startTime: entry.startTime,
      });
    }
  }
});
longTaskObserver.observe({ type: 'longtask', buffered: true });
```

## MutationObserver: Tracking Third-Party DOM Changes

```javascript
// Detect and react to DOM mutations from third-party scripts (ads, widgets)
function watchForInjectedScripts(container, callback) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName === 'SCRIPT') {
          callback(node); // audit or block injected scripts
        }
        if (node.nodeName === 'IFRAME' && !node.sandbox?.length) {
          // Unsandboxed iframe injected -- security concern
          callback(node);
        }
      }
    }
  });

  observer.observe(container, { childList: true, subtree: true });
  return () => observer.disconnect();
}
```

**Performance**: Observing `subtree: true` on `document.body` with `characterData: true` and `attributes: true` can cause significant overhead on pages with frequent DOM updates (>1000 mutations/sec). Scope observations to smallest possible subtree.
