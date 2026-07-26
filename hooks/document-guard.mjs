#!/usr/bin/env node
/**
 * Document ownership guard (PreToolUse).
 *
 * The File Ownership table in workflow-orchestration says which agent owns
 * which document. It is guidance, and guidance is followed until it isn't:
 * a Design Doc rewritten by an executor mid-task is indistinguishable, after
 * the fact, from one the designer wrote.
 *
 * This turns the table into a gate. It reads `agent_type` from the hook input
 * — present whenever the call comes from inside a subagent — and decides:
 *
 *   author   may Write and Edit   (create or replace: authoring)
 *   updater  may Edit only        (targeted change, e.g. a progress checkbox)
 *   other    denied
 *   no agent ask                  (main conversation: surfaced, not blocked)
 *
 * Write versus Edit is the load-bearing distinction. A Write replaces the file
 * wholesale, which is authorship; an Edit is surgical, which is what an
 * executor ticking a checkbox in someone else's plan is doing.
 *
 * Dependency-free (node: builtins only). Unmatched paths are allowed — this
 * guards documents, not the repository.
 */

import { readFileSync } from 'node:fs';

/**
 * Ownership rules, most specific first. `test` matches a repo-relative,
 * forward-slashed path.
 */
const RULES = [
  {
    name: 'PRD',
    test: /^docs\/features\/[^/]+\/prd\.md$/,
    authors: ['prd-creator'],
    updaters: [],
  },
  {
    name: 'UXRD',
    test: /^docs\/features\/[^/]+\/uxrd\.md$/,
    authors: ['ux-designer', 'ui-ux-agent'],
    updaters: [],
  },
  {
    name: 'Design Doc',
    test: /^docs\/features\/[^/]+\/design-[^/]+\.md$/,
    authors: ['technical-designer', 'technical-designer-frontend'],
    // executors tick progress checkboxes in the design's progress section
    updaters: ['task-executor', 'task-executor-frontend'],
  },
  {
    name: 'ADR',
    test: /^docs\/adr\/[^/]+\.md$/,
    authors: ['technical-designer', 'technical-designer-frontend'],
    updaters: [],
  },
  {
    name: 'GDD',
    test: /^docs\/game-design\/[^/]+\.md$/,
    authors: ['sr-game-designer', 'mid-game-designer'],
    updaters: [],
  },
  {
    name: 'task file',
    test: /^docs\/features\/[^/]+\/[^/]+\/[^/]+\/.+\.md$/,
    authors: ['task-decomposer'],
    updaters: ['task-executor', 'task-executor-frontend'],
  },
  {
    name: 'work plan',
    test: /^docs\/features\/[^/]+\/[^/]+\/[^/]+\.md$/,
    authors: ['work-planner', 'gamedev-work-planner'],
    updaters: ['task-executor', 'task-executor-frontend'],
  },
];

const WRITE_TOOLS = new Set(['Write', 'NotebookEdit']);
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit']);

/**
 * `agent_type` arrives bare (`prd-creator`) or plugin-scoped
 * (`backend-overture:prd-creator`) depending on how the agent was resolved.
 * Both forms name the same agent, so compare on the bare, lowercased name.
 */
const normalise = (a) => String(a).trim().split(':').pop().toLowerCase();

/** Every agent named anywhere in the table — used to tell "wrong agent" from "unknown name". */
const KNOWN_AGENTS = new Set(
  RULES.flatMap((r) => [...r.authors, ...r.updaters]).map(normalise),
);

function decide(kind, toolName, agentType) {
  const rule = RULES.find((r) => r.test.test(kind));
  if (!rule) return null; // not a governed document

  const isWrite = WRITE_TOOLS.has(toolName);
  const isEdit = EDIT_TOOLS.has(toolName);
  if (!isWrite && !isEdit) return null;

  // Main conversation or an unidentified caller: surface rather than block.
  // The orchestrator is not supposed to write documents directly, but a person
  // editing their own repository is not a policy violation.
  if (!agentType) {
    return {
      decision: 'ask',
      reason: `${rule.name} is owned by ${rule.authors.join(' or ')}. `
        + `This edit is not coming from that agent — confirm it is intended.`,
    };
  }

  const bare = normalise(agentType);

  if (rule.authors.some((a) => normalise(a) === bare)) return { decision: 'allow' };

  if (rule.updaters.some((a) => normalise(a) === bare)) {
    if (isEdit) return { decision: 'allow' };
    return {
      decision: 'deny',
      reason: `${bare} may make targeted edits to this ${rule.name} `
        + `(progress checkboxes), but Write replaces the whole file. `
        + `Authoring it belongs to ${rule.authors.join(' or ')}. Use Edit, or escalate.`,
    };
  }

  // An agent this guard has never heard of is not evidence of a violation — it
  // is more likely a name arriving in a shape the table does not list. Denying
  // here would block the legitimate owner over a labelling mismatch, so ask and
  // report the observed value, which makes the mismatch diagnosable.
  if (!KNOWN_AGENTS.has(bare)) {
    return {
      decision: 'ask',
      reason: `${rule.name} is owned by ${rule.authors.join(' or ')}. `
        + `The caller reports agent_type "${agentType}", which this guard does not recognise — `
        + `confirm this is intended, and if the name is legitimate add it to hooks/document-guard.mjs.`,
    };
  }

  return {
    decision: 'deny',
    reason: `${rule.name} is owned by ${rule.authors.join(' or ')}; ${bare} may not modify it. `
      + `Return the needed change to the orchestrator, which routes revisions to the owning agent `
      + `(see File Ownership by Agent in workflow-orchestration).`,
  };
}

function main() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0); // no input: nothing to judge
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // unparseable: fail open, this guard must never wedge a session
  }

  const toolName = input.tool_name || '';
  const filePath = input.tool_input?.file_path || input.tool_input?.notebook_path || '';
  const agentType = input.agent_type || '';
  if (!filePath) process.exit(0);

  // Normalise to a repo-relative, forward-slashed path.
  const cwd = (input.cwd || '').replace(/\\/g, '/').replace(/\/$/, '');
  let rel = filePath.replace(/\\/g, '/');
  if (cwd && rel.startsWith(cwd + '/')) rel = rel.slice(cwd.length + 1);
  rel = rel.replace(/^\.\//, '');

  const verdict = decide(rel, toolName, agentType);
  if (!verdict || verdict.decision === 'allow') process.exit(0);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: verdict.decision,
      permissionDecisionReason: verdict.reason,
    },
  }));
  process.exit(0);
}

main();
