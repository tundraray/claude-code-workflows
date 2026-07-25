# Overture Agents

## Shared Agents (Available in All Plugins)

These agents work the same way whether you're building a REST API or a React app:

| Agent | What It Does |
|-------|--------------|
| **requirement-analyzer** | Figures out how complex your task is and picks the right workflow |
| **expert-analyst** | Multi-perspective analysis from expert viewpoint (Security, Architecture, Performance, etc.) -- spawned in parallel |
| **work-planner** | Breaks down design docs into actionable tasks |
| **task-decomposer** | Splits work into small, commit-ready chunks |
| **code-reviewer** | Checks your code against design docs to make sure nothing's missing |
| **document-reviewer** | Reviews single document quality, completeness, and rule compliance |
| **design-sync** | Verifies consistency across multiple Design Docs and detects conflicts |
| **codebase-scanner** | Scans for dead code, orphan files, unused exports across 7 categories |
| **cleanup-executor** | Safely removes confirmed dead code with git branch backup and build verification |
| **investigator** | Collects evidence, enumerates hypotheses, builds evidence matrix for problem diagnosis |
| **verifier** | Validates investigation results using ACH and Devil's Advocate methods |
| **solver** | Generates solutions with tradeoff analysis and implementation steps |
| **scope-discoverer** | Discovers PRD/Design Doc targets from codebase for reverse engineering |
| **code-verifier** | Validates consistency between documentation and code implementation |

## Backend-Specific Agents (backend-overture)

| Agent | What It Does |
|-------|--------------|
| **prd-creator** | Writes product requirement docs for complex features |
| **technical-designer** | Plans architecture and tech stack decisions |
| **acceptance-test-generator** | Creates E2E and integration test scaffolds from requirements |
| **integration-test-reviewer** | Reviews integration/E2E tests for skeleton compliance and quality |
| **codebase-analyzer** | Read-only fact gathering before design — traces call chains and data models, emits focus areas the designer must address |
| **task-executor** | Implements backend features with TDD |
| **quality-fixer** | Runs tests, fixes type errors, handles linting - everything quality-related |
| **rule-advisor** | Picks the best coding rules for your current task |

## Frontend-Specific Agents (frontend-overture)

| Agent | What It Does |
|-------|--------------|
| **prd-creator** | Writes product requirement docs for complex features |
| **technical-designer-frontend** | Plans React component architecture and state management |
| **ux-designer** | Creates UX Requirement Documentation (UXRD) with interaction patterns and accessibility specs |
| **ui-analyzer** | Read-only UI fact gathering before design — component structure, CSS layout, state matrices, i18n, accessibility, plus external design-resource fetch |
| **task-executor-frontend** | Implements React components with Testing Library |
| **quality-fixer-frontend** | Handles React-specific tests, TypeScript checks, and builds |
| **rule-advisor** | Picks the best coding rules for your current task |
| **design-sync** | Verifies consistency across multiple Design Docs and detects conflicts |

## Game Development Agents (gamedev-overture)

| Agent | What It Does |
|-------|--------------|
| **sr-game-designer** | Owns game vision, creates GDD (core loop, pillars, progression) |
| **mid-game-designer** | Feature specifications, user stories, balancing parameters |
| **mechanics-developer** | Core systems architecture (state machines, physics, object pooling, events) |
| **game-feel-developer** | Game feel and polish (screen shake, particles, audio cues, tweens) |
| **market-analyst** | Market analysis, competitor research, Go/No-Go recommendations |
| **producer-agent** | Project config, team selection, resource planning, timeline |
| **sr-game-artist** | Art direction, style guide, color palette, reference sheets |
| **technical-artist** | Pipeline specs, atlas optimization, shader requirements |
| **ui-ux-agent** | Game UI/UX: HUD, menus, interaction patterns, accessibility |
| **data-scientist** | Analytics/telemetry design, KPIs, A/B tests, dashboards |
| **qa-agent** | Test plans, performance validation, playtesting protocols |
| **gamedev-work-planner** | 6-phase game work planning (Core Mechanics → Game Feel → Art → UI → Analytics → QA) |

> **Note**: gamedev-overture replaces `prd-creator` with `market-analyst` + `sr-game-designer`, `ux-designer` with `ui-ux-agent`, and `work-planner` with `gamedev-work-planner`.
