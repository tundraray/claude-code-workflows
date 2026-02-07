# Module Systems

## Package.json: Exports Field (Node 12.7+)

The `exports` field is the modern way to define package entry points. It replaces `main`/`module` and enables subpath exports, conditional exports, and encapsulation.

```json
{
  "name": "my-lib",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "default": "./dist/index.mjs"
    },
    "./utils": {
      "types": "./dist/utils.d.ts",
      "import": "./dist/utils.mjs",
      "require": "./dist/utils.cjs"
    },
    "./package.json": "./package.json"
  },
  "imports": {
    "#db": {
      "production": "./src/db/pg.js",
      "default": "./src/db/sqlite.js"
    },
    "#utils/*": "./src/utils/*.js"
  },
  "sideEffects": false
}
```

**Resolution order**: Conditions are checked top-to-bottom; first match wins. Always put `types` first (TypeScript needs it before `import`/`require`). Put `default` last as fallback.

**Encapsulation**: With `exports` defined, deep imports like `my-lib/dist/internal.js` are blocked. Only explicitly exported paths are accessible. This is intentional -- use it to enforce public API boundaries.

## Import Attributes (ES2025, Node 21+)

`assert` syntax is deprecated. Use `with` keyword.

```javascript
// OLD (deprecated): import data from './data.json' assert { type: 'json' };
// NEW:
import data from './data.json' with { type: 'json' };
import styles from './app.css' with { type: 'css' };

// Dynamic import with attributes
const config = await import('./config.json', { with: { type: 'json' } });
```

**Version**: `with` syntax ships in Node 21+, Chrome 123+. TypeScript 5.3+ supports it. If targeting Node 18/20 LTS, read JSON via `fs.readFile()` + `JSON.parse()` instead.

## `node:` Protocol (Node 16+)

Always prefer `node:` prefix for built-in modules. It is unambiguous, prevents npm package name hijacking, and is slightly faster to resolve.

```javascript
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, it } from 'node:test';
import { parseArgs } from 'node:util';
```

**Security**: Without `node:`, a malicious npm package named `fs` or `path` could shadow the built-in. The `node:` prefix is guaranteed to resolve to the built-in.

## Dual Package Hazard

When a package ships both ESM and CJS, consumers can accidentally load both copies. This causes:
- Singletons instantiated twice (database pools, caches)
- `instanceof` checks failing across module boundaries
- State divergence between ESM and CJS copies

```javascript
// The problem: package loaded twice
// In CJS consumer: const { Pool } = require('my-db');  // loads CJS copy
// In ESM consumer: import { Pool } from 'my-db';       // loads ESM copy
// Pool from CJS !== Pool from ESM -- instanceof fails

// Solution 1: Stateless package (safe for dual loading)
// If your package is pure functions with no shared state, dual loading is fine

// Solution 2: CJS wrapper that re-exports ESM (recommended)
// index.cjs
module.exports = async function loadESM() {
  return import('./index.mjs');
};

// Solution 3: Single source, isolate state in a separate module
// state.cjs -- always loaded as CJS, single instance
const pool = require('./pool.cjs');
module.exports = pool;

// index.mjs -- imports the CJS state module
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pool = require('./state.cjs'); // guaranteed single instance
```

**Detection**: Set `NODE_DEBUG=module` to see resolution paths. If your package appears twice in the log, you have the hazard.

## Monorepo Patterns: Workspace Resolution

```json
// root package.json
{
  "workspaces": ["packages/*"],
  "private": true
}

// packages/shared/package.json
{
  "name": "@org/shared",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts"
  }
}

// packages/api/package.json
{
  "name": "@org/api",
  "dependencies": {
    "@org/shared": "workspace:*"
  }
}
```

**Internal package exports**: Use `exports` field even for internal workspace packages. Benefits:
- Enforces public API surface (internal modules stay private)
- TypeScript resolves types correctly via `exports` + `types` condition
- Bundlers tree-shake unused exports

**Workspace protocol**: `workspace:*` (pnpm), `*` (npm/yarn) -- resolved to file: links at install time, replaced with actual version on publish.

**Gotcha**: TypeScript `paths` in `tsconfig.json` and workspace resolution can conflict. If TS resolves to source but the bundler resolves to `dist`, you get subtle type mismatches. Use TypeScript project references or `composite: true` for reliable cross-package resolution.

## Bundler-Specific Resolution Differences

```javascript
// Vite (esbuild for dev, Rollup for prod)
// - Resolves `exports` field, respects conditions
// - Dev mode: no bundling, native ESM, pre-bundles deps with esbuild
// - GOTCHA: CJS deps are pre-bundled to ESM; may break named imports
//   Fix: import default then destructure, or add to optimizeDeps.include

// Webpack 5
// - Resolves `exports` field with conditionNames: ['import', 'require', 'default']
// - Supports `resolve.alias` for overrides
// - GOTCHA: exports field conditions aren't customizable via config
//   You need resolve.conditionNames to add custom conditions

// esbuild
// - Resolves `exports` field, respects conditions in order
// - GOTCHA: doesn't resolve `imports` field (#subpath) by default
//   Use esbuild-plugin-alias or resolve manually

// tsx / ts-node
// - tsx: uses esbuild under the hood, fast but may miss some resolution edge cases
// - ts-node: uses TypeScript's resolver, respects paths/baseUrl
// - GOTCHA: ts-node with ESM requires --esm flag and "module": "nodenext" in tsconfig
```

**Testing resolution**: Use `node --conditions=custom-condition ./app.js` to activate custom export conditions. Use `import.meta.resolve('./dep')` to debug what path a specifier resolves to.

## Dynamic Imports: Code Splitting

```javascript
// Route-based code splitting
const routes = {
  '/dashboard': () => import('./pages/dashboard.js'),
  '/settings': () => import('./pages/settings.js'),
};

async function navigate(path) {
  const loader = routes[path];
  if (!loader) throw new Error(`Unknown route: ${path}`);
  const { default: Page } = await loader();
  render(Page);
}

// Conditional feature loading based on capability
async function initEditor() {
  const supportsWebGPU = 'gpu' in navigator;
  const renderer = supportsWebGPU
    ? await import('./renderers/webgpu.js')
    : await import('./renderers/canvas.js');
  return renderer.create();
}

// Preload hint: tell browser to fetch module before it's needed
// <link rel="modulepreload" href="./pages/dashboard.js">
// Differs from regular preload: also parses and compiles the module
```

## Tree Shaking: What Breaks It

```javascript
// BROKEN: barrel files defeat tree shaking
// utils/index.js
export * from './string.js';   // 50 functions
export * from './array.js';    // 30 functions
export * from './date.js';     // 20 functions
// Consumer: import { capitalize } from './utils';
// Bundler may pull in all 100 functions because re-exports create side-effect ambiguity

// FIX: import directly from the specific module
import { capitalize } from './utils/string.js';

// BROKEN: class with side effects in constructor
export class Logger {
  constructor() {
    process.on('exit', () => this.flush()); // side effect: adds event listener
  }
}
// Even if Logger is unused, bundler can't be sure constructor won't run

// BROKEN: top-level side effects
const config = loadFromDisk(); // side effect
export const port = config.port;
// Bundler must keep loadFromDisk() call

// package.json signal to bundlers:
// "sideEffects": false -- tells bundler ALL files are side-effect-free
// "sideEffects": ["*.css", "./src/polyfills.js"] -- only listed files have side effects
```

**Barrel file cost**: A barrel re-exporting 50 modules adds ~200ms parse time in development (Vite) and prevents effective tree shaking in Webpack 4. Webpack 5 handles it better but still pays a resolve-time cost. Direct imports are always faster.

## Circular Dependencies

```javascript
// ESM circular deps work differently than CJS:
// ESM: live bindings -- accessing the export before initialization gives TDZ error
// CJS: gets a snapshot of whatever was exported at require() time (possibly partial)

// Detection: Node 22+ with --experimental-detect-module can warn
// Or use madge: npx madge --circular ./src

// FIX: extract shared state to a third module
// BEFORE (circular): A imports B, B imports A
// AFTER: A imports Shared, B imports Shared, A imports B

// FIX: use lazy imports for optional circular deps
// moduleA.js
export function getB() {
  const { B } = await import('./moduleB.js'); // deferred
  return new B();
}
```

## CommonJS Interop in ESM

```javascript
// Default import works for most CJS modules
import express from 'express'; // CJS default export

// Named imports from CJS are NOT guaranteed to work
// Node does static analysis of CJS to detect named exports, but it's heuristic
import { Router } from 'express'; // may fail depending on CJS export pattern

// Reliable alternative: default import + destructure
import express from 'express';
const { Router, json, urlencoded } = express;

// createRequire: guaranteed CJS behavior in ESM context
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json'); // works without import attributes

// __dirname / __filename in ESM
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Or use import.meta.dirname (Node 21.2+)
const dir = import.meta.dirname;  // no conversion needed
const file = import.meta.filename;
```

## Import Maps (Browser, Chrome 89+)

```html
<script type="importmap">
{
  "imports": {
    "preact": "https://esm.sh/preact@10",
    "preact/": "https://esm.sh/preact@10/",
    "#app/": "./src/"
  },
  "scopes": {
    "./vendor/": {
      "preact": "https://esm.sh/preact@9"
    }
  }
}
</script>
```

**Scopes**: Allow version overrides per directory. `./vendor/` code imports preact@9 while the rest of the app gets preact@10. Useful for incremental upgrades.

**Limitation**: Import maps must be defined before any `<script type="module">` runs. Cannot be dynamically modified. Only one import map per document.
