# Modern JavaScript Syntax

## Private Class Fields and Static Blocks (ES2022)

```javascript
class ConnectionPool {
  static #defaultSize;
  static {
    // Static initialization block: runs once when class is evaluated
    // Use for complex static initialization that can't be an expression
    const env = process.env.NODE_ENV;
    ConnectionPool.#defaultSize = env === 'production' ? 20 : 5;
  }

  #connections = [];
  #size;

  constructor(size = ConnectionPool.#defaultSize) {
    this.#size = size;
  }

  // Private methods are truly private (not convention like _method)
  // Cannot be accessed even via Object.getOwnPropertyNames()
  #createConnection() { /* ... */ }

  // "in" check for private fields (ES2022) -- brand checking
  static isPool(obj) {
    return #connections in obj;
  }
}

// Brand checking is the type-safe alternative to instanceof
// (instanceof can be fooled by Symbol.hasInstance or cross-realm objects)
```

**Trade-off**: Private fields are per-class, not per-prototype. Each instance has its own private field slot. This is a V8 hidden class concern -- see performance.md. For performance-critical code with millions of instances, WeakMap-based privacy may be more memory-efficient.

## Error.cause (ES2022)

Wrap errors with context without losing the original stack trace.

```javascript
async function loadConfig(path) {
  try {
    const raw = await fs.readFile(path, 'utf-8');
    try {
      return JSON.parse(raw);
    } catch (parseErr) {
      throw new Error(`Invalid JSON in config file: ${path}`, { cause: parseErr });
    }
  } catch (fsErr) {
    if (fsErr.cause) throw fsErr; // already wrapped
    throw new Error(`Failed to read config: ${path}`, { cause: fsErr });
  }
}

// Errors now form a chain:
// Error: "Failed to read config: /app/config.json"
//   cause: Error: ENOENT: no such file or directory
// OR:
// Error: "Invalid JSON in config file: /app/config.json"
//   cause: SyntaxError: Unexpected token } in JSON at position 42

// Custom error classes with cause
class ValidationError extends Error {
  constructor(field, value, cause) {
    super(`Validation failed for "${field}": ${value}`, { cause });
    this.name = 'ValidationError';
    this.field = field;
  }
}
```

## structuredClone() (ES2022)

```javascript
// Deep clone that handles types JSON.parse(JSON.stringify()) cannot
const original = {
  date: new Date('2024-01-01'),
  regex: /pattern/gi,
  map: new Map([['key', { nested: true }]]),
  set: new Set([1, 2, 3]),
  buffer: new ArrayBuffer(16),
  error: new Error('test'),
};

const clone = structuredClone(original);
// date is still a Date, not a string
// map is still a Map, not {}
// ArrayBuffer is deep-copied

// CANNOT clone: functions, DOM nodes, Symbols, WeakMap, WeakRef, class prototypes
// Throws DataCloneError on these types
```

**When to use over alternatives**:
- `structuredClone()`: handles circular refs, Date, Map, Set, ArrayBuffer. ~2-10x slower than JSON hack for simple objects
- `JSON.parse(JSON.stringify())`: faster for plain objects, but destroys Date/Map/Set/undefined/functions
- `{...obj}` / `Object.assign()`: shallow only

## Proxy and Reflect

Intercept fundamental operations. Used in Vue 3 reactivity, validation layers, API mocking, observable patterns.

```javascript
// Validation proxy: enforce constraints on any object
function validated(target, schema) {
  return new Proxy(target, {
    set(obj, prop, value) {
      const validator = schema[prop];
      if (validator && !validator(value)) {
        throw new TypeError(`Invalid value for ${String(prop)}: ${value}`);
      }
      return Reflect.set(obj, prop, value);
    },
    deleteProperty(obj, prop) {
      if (schema[prop]?.required) {
        throw new Error(`Cannot delete required property: ${String(prop)}`);
      }
      return Reflect.deleteProperty(obj, prop);
    }
  });
}

const user = validated({}, {
  age: Object.assign((v) => typeof v === 'number' && v > 0 && v < 150, { required: true }),
  email: (v) => typeof v === 'string' && v.includes('@'),
});

user.age = 25;    // ok
user.age = -1;    // TypeError: Invalid value for age: -1
user.email = 'x'; // TypeError: Invalid value for email: x

// Lazy property initialization -- compute only on first access
function lazy(factory) {
  const cache = new Map();
  return new Proxy({}, {
    get(_, prop) {
      if (!cache.has(prop)) cache.set(prop, factory(prop));
      return cache.get(prop);
    }
  });
}

const config = lazy((key) => {
  // Expensive: reads from file/env/remote only on first access
  return loadConfigValue(key);
});

// Observable: track property access for dependency collection (like Vue 3)
function reactive(obj, onChange) {
  return new Proxy(obj, {
    set(target, prop, value) {
      const oldValue = target[prop];
      const result = Reflect.set(target, prop, value);
      if (oldValue !== value) onChange(prop, value, oldValue);
      return result;
    }
  });
}
```

**Performance**: Proxy adds ~100-500ns overhead per trapped operation (V8, 2024). Avoid in hot loops (>1M ops/sec). For read-heavy scenarios, cache computed values outside the proxy.

**When NOT to use**: Performance-critical paths, objects with >10k property accesses/sec, or when simple getter/setter achieves the same goal.

## Symbol Ecosystem

```javascript
// Well-known symbols: customize language behavior
class Money {
  #amount;
  #currency;

  constructor(amount, currency) {
    this.#amount = amount;
    this.#currency = currency;
  }

  // Custom type coercion
  [Symbol.toPrimitive](hint) {
    if (hint === 'number') return this.#amount;
    if (hint === 'string') return `${this.#amount} ${this.#currency}`;
    return this.#amount; // default
  }

  // Custom iterator
  *[Symbol.iterator]() {
    // Break money into smallest units (e.g., for splitting)
    let remaining = this.#amount;
    while (remaining > 0) {
      const unit = Math.min(remaining, 1);
      yield new Money(unit, this.#currency);
      remaining -= unit;
    }
  }

  // Make instanceof checks work across realms
  static [Symbol.hasInstance](instance) {
    return instance?.constructor?.name === 'Money';
  }

  // Custom JSON serialization
  toJSON() {
    return { amount: this.#amount, currency: this.#currency };
  }

  // Custom string tag: [object Money] instead of [object Object]
  get [Symbol.toStringTag]() { return 'Money'; }
}

// Symbol.asyncIterator for async iteration protocol
class EventStream {
  #events = [];
  #resolve = null;

  push(event) {
    if (this.#resolve) {
      this.#resolve({ value: event, done: false });
      this.#resolve = null;
    } else {
      this.#events.push(event);
    }
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.#events.length > 0) {
          return Promise.resolve({ value: this.#events.shift(), done: false });
        }
        return new Promise(resolve => { this.#resolve = resolve; });
      }
    };
  }
}
```

## Explicit Resource Management -- `using` (ES2024)

Requires Node 22+ or TypeScript 5.2+ targeting ESNext. Guarantees cleanup even on throw.

```javascript
// Synchronous disposal
class TempFile {
  #path;
  constructor(path) {
    this.#path = path;
    fs.writeFileSync(path, '');
  }
  write(data) { fs.appendFileSync(this.#path, data); }

  [Symbol.dispose]() {
    fs.rmSync(this.#path, { force: true });
  }
}

function processData() {
  using tmp = new TempFile('/tmp/work.dat');
  tmp.write(heavyComputation());
  // tmp[Symbol.dispose]() called here, even if heavyComputation throws
}

// Async disposal
class Lock {
  #release;
  constructor(release) { this.#release = release; }
  async [Symbol.asyncDispose]() { await this.#release(); }
}

async function criticalSection(mutex) {
  await using lock = await mutex.acquire();
  await riskyOperation();
  // lock released here automatically
}

// DisposableStack: manage multiple resources
function multipleResources() {
  using stack = new DisposableStack();
  const file = stack.use(openFile('/data'));
  const conn = stack.use(getConnection());
  stack.defer(() => console.log('all cleaned up'));
  // All disposed in reverse order on scope exit
}
```

## Array Methods: Change-by-Copy (ES2023)

```javascript
// Immutable operations -- return new array, original unchanged
const sorted = items.toSorted((a, b) => a.priority - b.priority);
const reversed = items.toReversed();
const replaced = items.with(2, newItem); // replace at index
const removed = items.toSpliced(1, 2);   // remove 2 items at index 1

// Object.groupBy / Map.groupBy (ES2024)
const byStatus = Object.groupBy(orders, o => o.status);
// { pending: [...], shipped: [...], delivered: [...] }

const byCategory = Map.groupBy(products, p => p.category);
// Map { 'electronics' => [...], 'books' => [...] }
// Use Map.groupBy when keys are objects or need Map semantics
```

## Iterator Helpers (ES2025)

Lazy evaluation on iterators -- no intermediate array allocation.

```javascript
// Process large dataset without materializing intermediate arrays
function* readLargeCSV(path) { /* yield rows */ }

const expensiveItems = readLargeCSV('/data/orders.csv')
  .filter(row => row.total > 1000)       // lazy -- no array created
  .map(row => ({ id: row.id, total: row.total }))
  .take(100)                              // stop after 100 matches
  .toArray();                             // only now materializes

// .drop(n) -- skip first n
// .flatMap(fn) -- map and flatten
// .some(fn), .every(fn), .find(fn) -- short-circuit
// .reduce(fn, init) -- fold
// .forEach(fn) -- side effects

// Infinite iterators with limits
function* fibonacci() {
  let [a, b] = [0, 1];
  while (true) { yield a; [a, b] = [b, a + b]; }
}

const first20 = fibonacci().take(20).toArray();
```

**Version**: Iterator Helpers ship in Chrome 122+, Node 22+. Not yet in Firefox/Safari as of early 2025.

## Decorators (Stage 3, TC39 2023)

Supported in TypeScript 5.0+ (TC39 decorators, not legacy/experimental). Available in Babel with `@babel/plugin-proposal-decorators` version `2023-11`.

```javascript
// Method decorator: logging with timing
function logged(target, context) {
  const name = context.name;
  return async function (...args) {
    const start = performance.now();
    try {
      const result = await target.call(this, ...args);
      console.log(`${name} completed in ${(performance.now() - start).toFixed(1)}ms`);
      return result;
    } catch (error) {
      console.error(`${name} failed after ${(performance.now() - start).toFixed(1)}ms`, error);
      throw error;
    }
  };
}

// Field decorator: validation
function range(min, max) {
  return function (_, context) {
    return function (initialValue) {
      context.addInitializer(function () {
        // runs during construction
      });
      if (initialValue < min || initialValue > max) {
        throw new RangeError(`${context.name}: ${initialValue} not in [${min}, ${max}]`);
      }
      return initialValue;
    };
  };
}

class Sensor {
  @logged
  async readTemperature() { /* ... */ }

  @range(-40, 125)
  temperature = 20;
}
```

**WARNING**: TC39 decorators (2023) are incompatible with legacy TypeScript decorators (`experimentalDecorators`). Do NOT mix them. If your project uses `experimentalDecorators: true`, you are on the legacy path and these examples do not apply.

## Pattern Matching (Stage 1 -- NOT Stage 3)

Pattern matching is Stage 1 as of 2024. Do NOT use in production. The proposal syntax may change significantly.

Current idiomatic alternatives:

```javascript
// Object dispatch instead of switch
const handlers = {
  string: (v) => v.toUpperCase(),
  number: (v) => v * 2,
  boolean: (v) => !v,
};

function processValue(value) {
  const handler = handlers[typeof value];
  return handler?.(value) ?? null;
}

// Discriminated unions with exhaustive checking
function handleEvent(event) {
  const actions = {
    click: ({ x, y }) => moveTo(x, y),
    keydown: ({ key }) => handleKey(key),
    resize: ({ width, height }) => resize(width, height),
  };
  const action = actions[event.type];
  if (!action) throw new Error(`Unhandled event type: ${event.type}`);
  return action(event);
}
```

## Temporal API (Stage 3)

Not yet natively available. Use `@js-temporal/polyfill` for production. Polyfill adds ~40KB gzipped.

```javascript
import { Temporal } from '@js-temporal/polyfill';

// Duration arithmetic that actually works (unlike Date)
const start = Temporal.PlainDate.from('2024-01-31');
const later = start.add({ months: 1 }); // 2024-02-29 (handles leap year)

// Timezone-aware comparison
const meeting = Temporal.ZonedDateTime.from('2024-03-10T02:30[America/New_York]');
// Throws: 2:30 AM doesn't exist on DST spring-forward day

// Duration between two instants
const duration = start.until(Temporal.PlainDate.from('2024-06-15'));
// { months: 4, days: 15 }
```

**When to use**: New projects needing correct timezone/calendar math. **When NOT to use**: If `Date` + `Intl.DateTimeFormat` covers your needs, the polyfill cost isn't justified. `date-fns` is 5KB for most use cases.

## Hashbang / Shebang (ES2023)

```javascript
#!/usr/bin/env node
// First line is ignored by JS engines, allows direct execution: ./script.js
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { port: { type: 'string', default: '3000' } }
});
```

## Numeric and Ergonomic Features

```javascript
// Array.fromAsync (ES2024) -- create array from async iterable
const rows = await Array.fromAsync(db.query('SELECT * FROM users'));

// Promise.withResolvers (ES2024) -- no more awkward constructor pattern
const { promise, resolve, reject } = Promise.withResolvers();
setTimeout(() => resolve('done'), 1000);
await promise;

// RegExp /v flag (ES2024) -- set notation in character classes
const emoji = /[\p{Emoji}--\p{ASCII}]/v; // emoji minus ASCII (set subtraction)
const greek = /[\p{Script=Greek}&&\p{Letter}]/v; // Greek AND Letter (intersection)
```
