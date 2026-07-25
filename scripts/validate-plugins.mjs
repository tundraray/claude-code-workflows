#!/usr/bin/env node
/**
 * Plugin consistency validation.
 *
 * Cross-file consistency is the class of bug that is invisible in a diff but
 * obvious to a script: a file added to agents/ but never registered, a
 * registration pointing at a renamed file, a symlink left dangling by a move.
 *
 * Checks:
 *   1. registration    — every shared component is registered in >=1 plugin,
 *                        and every registration resolves to a real file
 *   2. symlinks        — every plugin entry resolves to its shared target
 *   3. frontmatter     — required fields present and non-empty
 *   4. versions        — marketplace.json and touched plugin.json bumped
 *                        together, exactly once, relative to the base ref
 *
 * Dependency-free (node: builtins only) so it runs anywhere without install.
 * Exits non-zero on any failure. A check that inspected nothing is itself a
 * failure — a silently-broken matcher must not report green.
 */

import { readFileSync, readdirSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const SHARED_DIRS = ['agents', 'commands', 'skills'];
const BASE_REF = process.env.VALIDATE_BASE_REF || 'origin/main';

const failures = [];
const overrides = [];
const counts = {};

/** Byte comparison; recurses for skill directories. */
function identical(a, b) {
  try {
    if (lstatSync(a).isDirectory()) {
      const ea = readdirSync(a).sort();
      const eb = readdirSync(b).sort();
      if (ea.join('\0') !== eb.join('\0')) return false;
      return ea.every((n) => identical(join(a, n), join(b, n)));
    }
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}

const fail = (check, msg) => failures.push({ check, msg });
const seen = (check, n = 1) => { counts[check] = (counts[check] || 0) + n; };
const rel = (p) => relative(ROOT, p).split(sep).join('/');

/** Directories holding a .claude-plugin/plugin.json, excluding the marketplace root. */
function findPlugins() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .filter((n) => existsSync(join(ROOT, n, '.claude-plugin', 'plugin.json')))
    .sort();
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail('registration', `${rel(path)}: invalid JSON — ${err.message}`);
    return null;
  }
}

/** Split YAML frontmatter without a YAML dependency; only fixed scalar keys are read. */
function frontmatter(path) {
  const text = readFileSync(path, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

// ---------------------------------------------------------------------------
// 1. Registration: disk <-> plugin.json
// ---------------------------------------------------------------------------

function sharedComponents() {
  const out = { agents: [], commands: [], skills: [] };
  for (const dir of SHARED_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (dir === 'skills') {
        if (e.isDirectory() && existsSync(join(abs, e.name, 'SKILL.md'))) out.skills.push(e.name);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        out[dir].push(e.name.replace(/\.md$/, ''));
      }
    }
  }
  return out;
}

function checkRegistration(plugins, shared) {
  const registered = { agents: new Set(), commands: new Set(), skills: new Set() };

  for (const plugin of plugins) {
    const manifestPath = join(ROOT, plugin, '.claude-plugin', 'plugin.json');
    const manifest = readJson(manifestPath);
    if (!manifest) continue;

    for (const kind of SHARED_DIRS) {
      for (const entry of manifest[kind] || []) {
        seen('registration');
        const target = resolve(ROOT, plugin, entry);
        if (!existsSync(target)) {
          fail('registration', `${plugin}/plugin.json registers "${entry}" but ${rel(target)} does not exist`);
          continue;
        }
        // Record the shared name only when the entry points into the plugin's own tree.
        const name = entry.replace(/^\.\//, '').replace(/^(agents|commands|skills)\//, '').replace(/\.md$/, '');
        registered[kind].add(name);
      }
    }
  }

  for (const kind of SHARED_DIRS) {
    for (const name of shared[kind]) {
      seen('registration');
      if (!registered[kind].has(name)) {
        fail('registration', `${kind}/${name} exists on disk but is registered in no plugin.json`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Symlinks: plugin entry -> shared file
// ---------------------------------------------------------------------------

function checkSymlinks(plugins) {
  for (const plugin of plugins) {
    for (const kind of SHARED_DIRS) {
      const dir = join(ROOT, plugin, kind);
      if (!existsSync(dir)) continue;
      for (const e of readdirSync(dir)) {
        const entry = join(dir, e);
        seen('symlinks');
        let st;
        try {
          st = lstatSync(entry);
        } catch (err) {
          fail('symlinks', `${plugin}/${kind}/${e}: cannot stat — ${err.message}`);
          continue;
        }
        if (!st.isSymbolicLink()) {
          // A plugin-local component with no shared twin is a legitimate
          // plugin-specific addition. A real file that shadows a shared one is
          // either an intentional override or an accidental copy — Git Bash
          // `ln -s` silently produces copies on Windows. Byte-identical means
          // accidental: the next edit to the shared file will not propagate.
          const sharedTwin = join(ROOT, kind, e);
          if (existsSync(sharedTwin)) {
            if (identical(entry, sharedTwin)) {
              fail('symlinks', `${plugin}/${kind}/${e} is a byte-identical copy of ${kind}/${e}, not a symlink — edits to the shared file will not propagate`);
            } else if (wasIdenticalAtBase(plugin, kind, e)) {
              // Identical at the base ref, divergent now: an edit landed on the
              // shared file and silently failed to reach this plugin.
              fail('symlinks', `${plugin}/${kind}/${e} was identical to ${kind}/${e} at ${BASE_REF} but has diverged — a shared-file edit did not propagate here`);
            } else {
              overrides.push(`${plugin}/${kind}/${e} shadows ${kind}/${e} with different content`);
            }
          }
          continue;
        }
        if (!existsSync(entry)) {
          fail('symlinks', `${plugin}/${kind}/${e} is a dangling symlink`);
          continue;
        }
        try {
          const target = realpathSync(entry);
          if (!target.startsWith(join(ROOT, kind) + sep) && !target.startsWith(join(ROOT, plugin) + sep)) {
            fail('symlinks', `${plugin}/${kind}/${e} resolves outside the repo component dirs: ${rel(target)}`);
          }
        } catch (err) {
          fail('symlinks', `${plugin}/${kind}/${e}: cannot resolve — ${err.message}`);
        }
      }
    }
  }
}

/**
 * True when the plugin-local file and its shared twin were byte-identical at
 * the base ref. Compares the single entry file for commands/agents and the
 * SKILL.md for skill directories, which is where divergence shows up.
 */
function wasIdenticalAtBase(plugin, kind, name) {
  const suffix = kind === 'skills' ? `${name}/SKILL.md` : name;
  const a = gitShow(BASE_REF, `${plugin}/${kind}/${suffix}`);
  const b = gitShow(BASE_REF, `${kind}/${suffix}`);
  return a !== null && b !== null && a === b;
}

// ---------------------------------------------------------------------------
// 3. Frontmatter
// ---------------------------------------------------------------------------

const REQUIRED = {
  agents: ['name', 'description'],
  commands: ['name', 'description', 'argument-hint'],
  skills: ['name', 'description'],
};

function checkFrontmatter(shared) {
  for (const kind of SHARED_DIRS) {
    for (const name of shared[kind]) {
      const path = kind === 'skills'
        ? join(ROOT, kind, name, 'SKILL.md')
        : join(ROOT, kind, `${name}.md`);
      seen('frontmatter');
      const fm = frontmatter(path);
      if (!fm) {
        fail('frontmatter', `${kind}/${name}: no YAML frontmatter block`);
        continue;
      }
      for (const field of REQUIRED[kind]) {
        if (!fm[field]) fail('frontmatter', `${kind}/${name}: missing or empty "${field}"`);
      }
      if (kind !== 'skills' && fm.name && fm.name !== name) {
        fail('frontmatter', `${kind}/${name}: frontmatter name is "${fm.name}" but the file is ${name}.md`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Version bumps
// ---------------------------------------------------------------------------

function gitShow(ref, path) {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function changedFiles() {
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${BASE_REF}...HEAD`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

function versionOf(text, label) {
  if (!text) return null;
  try {
    return JSON.parse(text).version ?? null;
  } catch {
    fail('versions', `${label}: unparseable JSON at ${BASE_REF}`);
    return null;
  }
}

function checkVersions(plugins) {
  const changed = changedFiles();
  if (changed === null) {
    console.log(`  versions: skipped (${BASE_REF} not available — fetch it in CI to enable this check)`);
    return;
  }
  if (changed.length === 0) {
    console.log('  versions: skipped (no changes against base)');
    return;
  }
  seen('versions');

  const marketplacePath = '.claude-plugin/marketplace.json';
  const baseMarketplace = versionOf(gitShow(BASE_REF, marketplacePath), marketplacePath);
  const headMarketplace = versionOf(readFileSync(join(ROOT, marketplacePath), 'utf8'), marketplacePath);

  // A plugin is touched when its own tree changed, or when a shared component
  // it registers changed. Shared components are symlinked, so a change to
  // agents/foo.md is a change to every plugin registering it.
  const touched = new Set();
  for (const file of changed) {
    const top = file.split('/')[0];
    if (plugins.includes(top)) touched.add(top);
    if (SHARED_DIRS.includes(top)) {
      const name = top === 'skills' ? file.split('/')[1] : file.split('/')[1]?.replace(/\.md$/, '');
      for (const plugin of plugins) {
        const manifest = readJson(join(ROOT, plugin, '.claude-plugin', 'plugin.json'));
        const entries = manifest ? manifest[top] || [] : [];
        if (entries.some((e) => e.includes(`/${name}`))) touched.add(plugin);
      }
    }
  }

  if (touched.size === 0) {
    console.log('  versions: no plugin content changed');
    return;
  }

  if (baseMarketplace && headMarketplace === baseMarketplace) {
    fail('versions', `${marketplacePath} version is unchanged (${headMarketplace}) but plugin content changed: ${[...touched].join(', ')}`);
  }

  for (const plugin of [...touched].sort()) {
    seen('versions');
    const p = `${plugin}/.claude-plugin/plugin.json`;
    const base = versionOf(gitShow(BASE_REF, p), p);
    const head = versionOf(readFileSync(join(ROOT, p), 'utf8'), p);
    if (base && head === base) {
      fail('versions', `${p} version is unchanged (${head}) but the plugin's content changed`);
    }
  }
}

// ---------------------------------------------------------------------------

const plugins = findPlugins();
const shared = sharedComponents();

console.log(`Validating ${plugins.length} plugins: ${plugins.join(', ')}\n`);

checkRegistration(plugins, shared);
checkSymlinks(plugins);
checkFrontmatter(shared);
checkVersions(plugins);

// A check that inspected nothing cannot report green.
for (const check of ['registration', 'symlinks', 'frontmatter']) {
  if (!counts[check]) fail(check, `inspected 0 items — the matcher is broken or the layout changed`);
}

for (const check of ['registration', 'symlinks', 'frontmatter', 'versions']) {
  const errs = failures.filter((f) => f.check === check);
  const n = counts[check] || 0;
  if (errs.length === 0) {
    console.log(`  ${check.padEnd(13)} OK (${n} checked)`);
  } else {
    console.log(`  ${check.padEnd(13)} ${errs.length} failure(s) of ${n} checked`);
    for (const e of errs) console.log(`      - ${e.msg}`);
  }
}

if (overrides.length > 0) {
  console.log(`\nPlugin-local overrides (not failures — the shared file is deliberately shadowed):`);
  for (const o of overrides) console.log(`      - ${o}`);
  console.log('  Edits to the shared file do not reach these; update them separately when the shared file changes.');
}

if (failures.length > 0) {
  console.log(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log('\nAll checks passed.');
