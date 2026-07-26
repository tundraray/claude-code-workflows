# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains [Claude Code plugins](https://docs.claude.ai/en/docs/claude-code/plugins) — extensions that add agents, commands, and skills to Claude Code CLI.

Overture is a plugin marketplace providing three companion plugins:
- **backend-overture**: Backend and general-purpose development
- **frontend-overture**: React/TypeScript specialized workflows
- **fullstack-overture**: Full-stack development combining both

The framework implements an **agentic orchestration pattern** where specialized sub-agents coordinate through commands (orchestrators) to handle complex software development tasks.

## Architecture

### Core Pattern: Orchestrator/Conductor Model

Commands like `/implement` act as orchestrators:
- Delegate ALL work to specialized sub-agents
- Follow deterministic flow rules in `workflow-orchestration` skill
- Never perform work directly—only coordinate
- Must include constraint suffix on sub-agent prompts: `[SYSTEM CONSTRAINT] This agent operates within [command] command scope...`

### Scale-Based Workflow Routing

Scale determined by file count in `requirement-analyzer`:
- **Small (1-2 files)**: Direct implementation → quality-fixer → commit
- **Medium (3-5 files)**: Design Doc → Work Plan → Tasks → Implementation → Review
- **Large (6+ files)**: PRD → Design Doc → Work Plan → Tasks → Implementation → Review

### Document-Driven Development

Progressive document creation based on complexity:
- **PRD** (6+ files): Business requirements, user value, success metrics
- **ADR** (conditional): Architecture/data flow/dependency changes
- **Design Doc** (3+ files): Technical specifications, interfaces, acceptance criteria
- **Work Plan** (3+ files): Phased task breakdown with dependencies
- **Task Files** (at execution): Single-commit granularity work units

### Explicit Stop Points for User Approval

Autonomous flow halts at:
- After requirement-analyzer (confirm requirements/scope)
- After document-reviewer completes PRD review
- After document-reviewer completes ADR review (if created)
- After design-sync verifies consistency
- After work-planner creates plan (batch approval for implementation)

After batch approval: Full autonomy until completion or escalation.

### Per-Task Quality Cycle

Each task execution follows cycle:
1. task-executor → Implementation
2. Escalation judgment → Check status
3. quality-fixer → Tests, linting, build
4. git commit → Based on selected commit strategy

### Commit Strategy (User Choice)

Ask user before implementation phase:
- **per-task** (default): Commit after each task
- **per-phase**: Commit after each phase completes
- **per-feature**: Single commit at the end
- **manual**: User decides when to commit

**CRITICAL**: No skipping escalation checks, no skipping quality-fixer.

### Document Revision Flow

When document-reviewer returns `needs_revision`:
1. Orchestrator extracts issues from reviewer output
2. Orchestrator calls the appropriate revision agent (specified in `revision_agent` field)
3. Revision agent edits the document
4. Orchestrator re-runs document-reviewer
5. Repeat until approved

**CRITICAL**: Orchestrator NEVER edits documents directly — always delegate to agents.

## Directory Structure

```
overture/
├── .claude-plugin/marketplace.json  # Manages all plugins (version here)
├── agents/                          # Shared agent implementations
├── commands/                        # Command orchestrators
├── skills/                          # Knowledge base modules
├── backend/                         # backend-overture plugin
│   ├── .claude-plugin/plugin.json   # Agents, commands config
│   ├── agents/                      # Symlinks to shared agents
│   ├── commands/                    # Symlinks to shared commands
│   └── skills/                      # Symlinks to shared skills
├── frontend/                        # frontend-overture plugin
│   ├── .claude-plugin/plugin.json   # Agents, commands config
│   └── ...                          # Symlinks (same structure)
└── fullstack/                       # fullstack-overture plugin
    ├── .claude-plugin/plugin.json   # Agents, commands config
    └── ...                          # Symlinks (same structure)
```

### Symlink Architecture

All three plugins symlink to shared agents/commands/skills:
- Single source of truth for shared components
- Plugin-specific exclusions configured in respective plugin.json
- Changes to shared files propagate to all plugins

## Key Components

### Agent Categories

**Document Creation**: requirement-analyzer, prd-creator, technical-designer, technical-designer-frontend, work-planner, acceptance-test-generator

**Implementation**: task-executor, task-executor-frontend, quality-fixer, quality-fixer-frontend

**Analysis & Review**: code-reviewer, document-reviewer, design-sync, integration-test-reviewer, code-verifier

**Specialized Workflows**: task-decomposer, investigator, verifier, solver, scope-discoverer, rule-advisor

### Skills (Knowledge Base)

Skills contain structured guidance used by agents:
- **workflow-orchestration**: Shared mechanics — agent invocation, response contracts, delegation boundary, conflict precedence, file ownership, TodoWrite
- **workflow-product**: Product phase — requirement analysis, PRD, UXRD, ending at UXRD approval
- **workflow-technical**: Technical phase — codebase fact gathering, Design Doc, conditional ADR, test skeletons, ending at Design Doc approval
- **workflow-execution**: Planning and execution — work plan, review, batch approval, decomposition, per-task cycle, commit strategies, post-implementation verification, auto-stop triggers. Parameterized by planner agent.
- **workflow-gamedev** (gamedev only): Replaces workflow-product — scenario detection, development modes, GDD, game design disciplines. Reuses workflow-technical unchanged.
- **documentation-criteria**: PRD/ADR/Design Doc/Plan/Task templates and creation decision matrices
- **coding-principles**: Language-agnostic code quality standards
- **testing-principles**: TDD practices, test patterns, coverage requirements
- **ai-development-guide**: Anti-patterns, error handling principles, fail-fast design
- **typescript-rules**: TypeScript-first development (frontend)
- **typescript-testing**: React Testing Library patterns (frontend)

## Critical Conventions

### Mandatory JSON Output Format

All agents must output structured JSON:
```json
{
  "status": "completed|blocked|escalated",
  "summary": "...",
  "findings": {...},
  "nextSteps": [...]
}
```

### TodoWrite Integration

All agents must:
- First todo: "Confirm skill constraints"
- Final todo: "Verify skill fidelity"
- Update status in real-time: pending → in_progress → completed

### Mandatory Escalation Triggers (task-executor)

Immediate escalation required for design deviations:
- Interface definition changes needed
- Layer structure violations
- Dependency direction reversals
- External library additions
- Contract definition bypass needed

### Quality Violations

Immediate escalation required:
- Contract system bypass needed
- Error handling bypass needed
- Test hollowing needed
- Existing test modification/deletion needed

## Modifying This Repository

### Adding/Modifying Agents

1. Edit or create agent file in `/agents/`
2. Agent must output mandatory JSON format
3. Include TodoWrite integration
4. Register agent in both `backend/.claude-plugin/plugin.json` and `frontend/.claude-plugin/plugin.json` (or just one if plugin-specific)
5. Create symlinks in `backend/agents/` and `frontend/agents/`

### Adding/Modifying Commands

1. Edit or create command file in `/commands/`
2. Command must act as orchestrator (delegate to agents)
3. Include mandatory constraint suffix in sub-agent calls
4. Register in appropriate plugin.json
5. Create symlinks in plugin directories

### Adding/Modifying Skills

1. Edit or create skill in `/skills/` directory
2. Skills are loaded automatically by agents based on configuration
3. Register in plugin.json if needed

### Version Updates

**MANDATORY**: Every pull request must include a version bump. Bump patch version in:
- `/.claude-plugin/marketplace.json` (always)
- The affected plugin's `.claude-plugin/plugin.json` (e.g., `strategy/.claude-plugin/plugin.json`)

Only one bump per PR — if the version was already bumped in this branch, do not bump again.

## Command Reference

### Backend Commands (backend-overture)
- `/implement` - Full-cycle feature development
- `/design` - Design document creation
- `/create-plan` - Work plan generation
- `/build` - Execute from existing task plan
- `/task` - Single task with precision
- `/review` - Design compliance check
- `/diagnose` - Root cause analysis
- `/reverse-engineer` - Generate docs from code
- `/add-integration-tests` - Add integration/E2E tests
- `/audit` - Interactive dead code detection and cleanup

### Frontend Commands (frontend-overture)
- `/front-design` - Frontend Design Doc creation
- `/front-plan` - Component work plan
- `/front-build` - Execute React implementation
- `/front-review` - Frontend design verification
- `/front-reverse-design` - Generate frontend docs from PRD
- `/task` - Single task (shared)
- `/diagnose` - Problem diagnosis (shared)
