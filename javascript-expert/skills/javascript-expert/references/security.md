# Security

## Prototype Pollution

Attacker injects properties into `Object.prototype`, affecting all objects in the process. Ranked #1 in JavaScript-specific vulnerabilities.

```javascript
// VULNERABLE: recursive merge without prototype check
function deepMerge(target, source) {
  for (const key in source) {
    if (typeof source[key] === 'object') {
      target[key] ??= {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

// Attack payload (from user input / JSON body):
// { "__proto__": { "isAdmin": true } }
deepMerge({}, JSON.parse(userInput));
// Now EVERY object in the process has isAdmin === true:
const user = {};
console.log(user.isAdmin); // true -- prototype polluted

// FIX 1: Block dangerous keys
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function safeMerge(target, source) {
  for (const key of Object.keys(source)) { // Object.keys() skips prototype chain
    if (DANGEROUS_KEYS.has(key)) continue;
    if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
      target[key] ??= {};
      safeMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// FIX 2: Use null-prototype objects for untrusted data
const safeObj = Object.create(null); // no prototype chain at all
// safeObj.__proto__ is just a regular property, not special

// FIX 3: Object.freeze(Object.prototype) -- nuclear option
// Prevents all prototype modification but breaks some libraries
// Only use in controlled environments (test runners, sandboxes)
```

**Detection**: Use `npm audit` and tools like `snyk`. Search codebase for `obj[userInput]` patterns. Use ESLint rule `no-prototype-builtins`.

**Affected libraries**: lodash.merge (fixed in 4.17.21), jQuery.extend (deep mode), hoek.merge. Always update dependencies.

## ReDoS (Regular Expression Denial of Service)

Crafted input causes catastrophic backtracking in vulnerable regex patterns. A single request can block the event loop for seconds to minutes.

```javascript
// VULNERABLE patterns (exponential backtracking):
const bad1 = /^(a+)+$/;           // nested quantifiers
const bad2 = /(a|aa)+$/;          // overlapping alternatives with quantifier
const bad3 = /^(\w+\s?)*$/;       // quantified group with optional element

// Attack: bad1.test('a'.repeat(25) + 'b')
// Time: >30 seconds for 25 characters. Grows exponentially.

// FIX 1: Use atomic groups / possessive quantifiers (not in JS, but...)
// FIX 2: Rewrite without nested quantifiers
const good = /^a+$/;              // linear: no nested quantifier

// FIX 3: Limit input length before regex
function safeMatch(input, pattern, maxLength = 1000) {
  if (input.length > maxLength) {
    throw new Error(`Input too long: ${input.length} > ${maxLength}`);
  }
  return pattern.test(input);
}

// FIX 4: Use RE2 (linear-time regex engine, no backtracking)
// npm install re2
import RE2 from 're2';
const safe = new RE2('^(a+)+$'); // RE2 guarantees linear time
safe.test('a'.repeat(1000000) + 'b'); // completes instantly

// FIX 5: Validate regex patterns at build time
// npx recheck 'pattern' -- tests for ReDoS vulnerability
```

**Rule of thumb**: Any regex with `(X+)+`, `(X+Y?)+`, `(X|X+)+` where X overlaps is vulnerable. Use `safe-regex` or `recheck` npm packages to audit all regex in your codebase.

**Thresholds**: If a regex takes >10ms on 100-char input, it's likely vulnerable and will be catastrophic on longer input.

## Timing Attacks

Comparing secrets with `===` leaks information through timing differences. Each matching byte takes slightly longer, revealing the secret byte-by-byte.

```javascript
// VULNERABLE: string comparison short-circuits on first mismatch
function checkToken(provided, stored) {
  return provided === stored; // leaks token length and content via timing
}

// FIX: constant-time comparison (Node.js)
import { timingSafeEqual } from 'node:crypto';

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Length check MUST be constant-time too
  if (bufA.length !== bufB.length) {
    // Compare against self to maintain constant time
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// VULNERABLE: database lookup by API key (timing reveals if key exists)
const user = await db.query('SELECT * FROM users WHERE api_key = $1', [key]);
// FIX: always do the same work regardless of result
const user = await db.query('SELECT * FROM users WHERE api_key = $1', [key]);
const dummy = { api_key: 'x'.repeat(key.length) };
const target = user ?? dummy;
if (!safeCompare(key, target.api_key)) throw new AuthError();
```

**Practical exploitability**: Timing attacks over network are harder but demonstrated over LAN with statistical analysis (~1000 requests). Over internet, jitter makes it harder but not impossible for motivated attackers, especially on consistent cloud infrastructure.

## Content Security Policy (CSP)

```javascript
// Express middleware: defense-in-depth against XSS
function cspMiddleware(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce; // available in templates: <script nonce="${nonce}">

  res.setHeader('Content-Security-Policy', [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,       // no 'unsafe-inline', no 'unsafe-eval'
    `style-src 'self' 'nonce-${nonce}'`,         // nonce for inline styles too
    `img-src 'self' data: https:`,               // allow data: URIs for images
    `font-src 'self'`,
    `connect-src 'self' https://api.example.com`, // restrict fetch/XHR targets
    `frame-ancestors 'none'`,                      // prevent clickjacking (replaces X-Frame-Options)
    `base-uri 'self'`,                             // prevent <base> tag hijacking
    `form-action 'self'`,                          // restrict form submission targets
    `upgrade-insecure-requests`,                   // auto-upgrade HTTP to HTTPS
  ].join('; '));

  next();
}
```

**Deployment strategy**: Start with `Content-Security-Policy-Report-Only` header + `report-uri` directive. Monitor violations for weeks before enforcing. Use `report-to` (newer) for structured reporting.

**Trade-off**: Strict CSP breaks inline scripts, `eval()`, and some third-party widgets. This is intentional -- each exception weakens CSP. `'unsafe-inline'` for scripts effectively disables XSS protection.

## CORS Deep Dive

```javascript
// CORS is enforced by the browser, not the server.
// Server sends headers; browser decides whether to allow the request.

function corsMiddleware(allowedOrigins) {
  const originsSet = new Set(allowedOrigins);

  return (req, res, next) => {
    const origin = req.headers.origin;

    // Reflect allowed origin (don't use '*' with credentials)
    if (originsSet.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin'); // required when origin varies
    }

    // Preflight (OPTIONS) response
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400'); // cache preflight 24h
      return res.status(204).end();
    }

    // Expose custom headers to JavaScript
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, X-RateLimit-Remaining');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    next();
  };
}
```

**Common CORS mistakes**:
- `Access-Control-Allow-Origin: *` + `credentials: true` -- browser rejects this combination
- Missing `Vary: Origin` when reflecting origin dynamically -- CDN may cache wrong origin
- Not handling preflight for `Content-Type: application/json` (it's NOT a "simple" content type)
- Allowing `Origin: null` -- can be spoofed via sandboxed iframes

## crypto.subtle (Browser) / node:crypto

```javascript
// Browser: Web Crypto API (always async, works only in secure contexts)
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return Buffer.from(hash).toString('hex');
}
// 600,000 iterations: OWASP 2023 recommendation for PBKDF2-SHA256

// AES-GCM encryption (browser + Node)
async function encrypt(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  // Prepend IV to ciphertext for storage
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return combined;
}

// Node.js: use node:crypto (synchronous options available)
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

async function hashNode(password) {
  const salt = randomBytes(32);
  return new Promise((resolve, reject) => {
    // scrypt: memory-hard, recommended over PBKDF2 for Node.js
    // N=16384, r=8, p=1: ~100ms on modern hardware
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
}
```

**Trade-off**: `scrypt` is memory-hard (resistant to GPU attacks) but uses ~16MB RAM per hash with default params. Under high concurrency (>100 simultaneous hashes), this can exhaust memory. Use a semaphore to limit concurrent hash operations.

## Input Sanitization

```javascript
// XSS prevention: never use innerHTML with untrusted data
// If you must insert HTML, sanitize with DOMPurify
import DOMPurify from 'dompurify';

const clean = DOMPurify.sanitize(userInput, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
  ALLOWED_ATTR: ['href'],
  ALLOW_DATA_ATTR: false,
});

// For plain text insertion, use textContent (no parsing)
element.textContent = userInput; // safe: no HTML interpretation

// URL validation: prevent javascript: protocol
function isSafeURL(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
// NEVER: element.href = userInput;
// ALWAYS: if (isSafeURL(userInput)) element.href = userInput;

// SQL injection: always use parameterized queries
// NEVER: db.query(`SELECT * FROM users WHERE id = ${userId}`);
// ALWAYS: db.query('SELECT * FROM users WHERE id = $1', [userId]);

// Path traversal: validate and normalize paths
import { resolve, relative } from 'node:path';

function safePath(basePath, userPath) {
  const resolved = resolve(basePath, userPath);
  const rel = relative(basePath, resolved);
  if (rel.startsWith('..') || resolve(basePath, rel) !== resolved) {
    throw new Error('Path traversal attempt');
  }
  return resolved;
}
```

## Supply Chain Security

```javascript
// 1. Lock dependencies: commit lockfile, use exact versions for critical deps
// package.json: "lodash": "4.17.21" (not "^4.17.21")

// 2. Audit regularly
// npm audit --production  (skip devDependencies)
// npm audit signatures    (verify package provenance, npm 9.5+)

// 3. Use .npmrc for security settings
// .npmrc:
// ignore-scripts=true        # prevent install scripts (postinstall attacks)
// package-lock=true           # always use lockfile
// audit=true                  # audit on install

// 4. Restrict dependency permissions with Socket or npm policies
// node --experimental-policy=policy.json app.js
// policy.json:
{
  "resources": {
    "./app.js": { "integrity": "sha384-..." },
    "./node_modules/express/index.js": {
      "integrity": "sha384-...",
      "dependencies": { "net": true, "fs": false }
    }
  }
}

// 5. Import maps for browser: pin exact CDN URLs
// <script type="importmap">
// { "imports": { "lodash": "https://cdn.example.com/lodash@4.17.21/lodash.mjs" } }
// Use subresource integrity (SRI) for script tags:
// <script src="..." integrity="sha384-..." crossorigin="anonymous">
```

**Detection workflow**:
1. `npm audit` on every CI build, fail on high/critical
2. `npx socket scan` for behavior analysis (detects typosquatting, obfuscated code)
3. Dependabot / Renovate for automated updates
4. Review `install` scripts: `npm pack <package>` and inspect before installing

## Common Security Headers

```javascript
function securityHeaders(req, res, next) {
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Control Referer header
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict browser features
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()');

  // Prevent clickjacking (supplement to CSP frame-ancestors)
  res.setHeader('X-Frame-Options', 'DENY');

  // Force HTTPS (include subdomains, preload after testing)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // WARNING: only add 'preload' after confirming ALL subdomains support HTTPS

  // Prevent cross-origin information leaks
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  next();
}
```

## Environment Variable Security

```javascript
// NEVER commit secrets. Use .env files with .gitignore, or secret managers.

// Validate required env vars at startup (fail fast)
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const config = {
  dbUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  // Redact in logs
  toString() { return '[Config: REDACTED]'; }
};

// Prevent env vars from leaking into error reports / client bundles
// In bundlers: use define/envPrefix to whitelist public vars
// Vite: only VITE_* vars are exposed to client
// Next.js: only NEXT_PUBLIC_* vars are exposed to client
```
