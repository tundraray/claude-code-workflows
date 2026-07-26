# Overture Skills

Skills are knowledge modules that agents load automatically when relevant.

## backend-overture (11 skills)

| Skill | Description |
|-------|-------------|
| **ai-development-guide** | AI-assisted development patterns and anti-patterns |
| **coding-principles** | Code quality standards with expert reasoning calibration |
| **documentation-criteria** | PRD/ADR/Design Doc templates and criteria |
| **expert-analysis-guide** | Multi-expert parallel analysis framework |
| **implementation-approach** | Design decisions and trade-offs |
| **integration-e2e-testing** | Integration and E2E test patterns |
| **project-context** | Project-specific context (customizable via `/setup-context`) |
| **workflow-orchestration** | Agent coordination rules |
| **task-analyzer** | Task complexity analysis |
| **technical-spec** | Technical design rules and build/testing commands |
| **testing-principles** | TDD, coverage, test patterns |

## frontend-overture (15 skills)

All skills from backend-overture (except integration-e2e-testing) plus:

| Skill | Description |
|-------|-------------|
| **brand-system-guide** | Design system setup (customizable via `/brand-context`) |
| **frontend-ai-guide** | React-specific AI development patterns |
| **typescript-rules** | TypeScript best practices for React |
| **typescript-testing** | React Testing Library patterns |

## gamedev-overture (13 skills)

All shared skills from backend-overture (except typescript-rules-backend, typescript-testing-backend) plus:

| Skill | Description |
|-------|-------------|
| **workflow-gamedev** | Gamedev-specific agent coordination with 4 flows, scenario detection, development modes |
| **documentation-criteria** | Extended with GDD, market analysis, feature spec templates and game doc types |
| **brand-system-guide** | Visual design system and brand guidelines |
| **type-safety-standards** | Type safety patterns and standards |
