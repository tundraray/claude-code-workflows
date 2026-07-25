# Token & Cost Optimization

## Recommended Settings

Configure in `~/.claude/settings.json`:

- **MAX_THINKING_TOKENS=10000** (default 31999, saves ~70% hidden tokens)
- **CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50** (default 95, prevents quality degradation)

Setting `MAX_THINKING_TOKENS` to 10000 is sufficient for most strategy tasks — deep reasoning benefits plateau past this threshold and the extra tokens are invisible to the user anyway. Lowering autocompact from 95% to 50% triggers compaction earlier, preserving more headroom for actual work and preventing the quality cliff that occurs when the model operates at near-full context.

## Model Routing for Strategy Work

| Task | Model | Why |
|------|-------|-----|
| Strategy analysis (Blue Ocean, RAT, AJTBD) | opus | Deep multi-factor reasoning |
| Market research, GTM planning | opus | Needs comprehensive analysis |
| Feature specs, roadmap | sonnet | Structured output, clear templates |
| Subagent exploration, file search | haiku | 90% capability, 3x cheaper |
| Document compilation | sonnet | Template-following, synthesis |

**Routing principle**: Use the most capable model only when the task requires genuine reasoning depth. Structured output tasks (filling templates, compiling sections) rarely benefit from opus-level reasoning.

## When to /compact

Use `/compact` at natural phase boundaries:

- **After exploration phase, before document writing** — you've gathered all inputs, now synthesize
- **After completing a strategy phase** (e.g., after Phase 2 AJTBD, before Phase 3 Market) — phase output is on disk
- **After reviewing a large document set** — insights are captured, raw content can be released
- **When switching between fundamentally different analysis types** — e.g., from competitive analysis to pricing strategy

## When NOT to /compact

Avoid `/compact` when continuity matters:

- **Mid-document creation** — loses context of what you've analyzed and decided to include
- **During multi-agent phases** (Phase 4 parallel, Phase 5 parallel) — agents need orchestration context
- **While cross-referencing multiple strategy documents** — the cross-links are only in memory
- **During report compilation** — needs all 15+ docs in context to produce a coherent final report

## What Survives Compaction

These persist across `/compact` and session restarts:

- Files on disk (all strategy documents, plans, analyses)
- Git state (commits, branches, diffs)
- CLAUDE.md (project instructions)
- TodoWrite entries (task tracking)
- Memory files (`~/.claude/projects/*/memory/`)

## What Is Lost

These exist only in the conversation context window:

- Conversation history and reasoning chains
- Tool call history and intermediate results
- File contents previously read into memory
- Cross-document insights not yet written to disk

**Mitigation**: Before compacting, write any important intermediate conclusions to a scratch file or TodoWrite entry.

## Context Budget Awareness

Context is a finite resource — be deliberate about what consumes it:

- **Agent descriptions** consume context even when the agent is never invoked. Each registered agent's markdown file is loaded into context at session start.
- **MCP server tool schemas** cost ~500 tokens each. Every tool from every connected MCP server is described in the system prompt.
- **Keep MCP servers minimal** — strategy-overture registers no MCP servers to avoid bloating the context with unused tool schemas.
- Use `/cost` to check spending mid-session and adjust model routing accordingly.

## Sub-Agents Protect Context

The Agent tool is the primary mechanism for context-efficient research:

- A sub-agent can read 20 files, search across the codebase, and analyze complex patterns
- Only the summary it returns enters the main session's context window
- The sub-agent's full context (all files read, all reasoning) is discarded after it completes

**Example**: Instead of reading 10 competitor analysis files directly (consuming ~50K tokens in main context), spawn an Agent to read them all and return a 500-token summary of key findings. The main session gets the insight without the cost.

**Rule of thumb**: If a task requires reading more than 3 files to answer a question, use a sub-agent.
