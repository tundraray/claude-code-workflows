# Overture Commands

## Backend Development (backend-overture)

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/implement` | End-to-end feature development | New features, complete workflows |
| `/task` | Execute single task with precision | Bug fixes, small changes |
| `/design` | Create design documentation | Architecture planning |
| `/create-plan` | Generate work plan from design | Planning phase |
| `/build` | Execute from existing task plan | Resume implementation |
| `/review` | Verify code against design docs | Post-implementation check |
| `/diagnose` | Investigate problems and derive solutions | Bug investigation, root cause analysis |
| `/reverse-engineer` | Generate PRD/Design Docs from existing code | Legacy system documentation, codebase understanding |
| `/add-integration-tests` | Add integration/E2E tests to existing code | Test coverage for existing implementations |
| `/audit` | Interactive dead code detection and cleanup | Codebase hygiene, removing dead code |
| `/setup-context` | Initialize project-context skill | New project setup |
| `/sync-skills` | Synchronize skills across plugins | Skill management |

## Frontend Development (frontend-overture)

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/front-design` | Create frontend design docs | React component architecture |
| `/front-plan` | Generate frontend work plan | Component breakdown planning |
| `/front-build` | Execute frontend task plan | Resume React implementation |
| `/front-review` | Verify code against design docs | Post-implementation check |
| `/front-reverse-design` | Generate frontend Design Docs from existing code using PRD | Frontend component documentation |
| `/task` | Execute single task with precision | Component fixes, small updates |
| `/diagnose` | Investigate problems and derive solutions | Bug investigation, root cause analysis |
| `/audit` | Interactive dead code detection and cleanup | Codebase hygiene, removing dead code |
| `/setup-context` | Initialize project-context skill | New project setup |
| `/brand-context` | Initialize brand-system-guide skill | Brand/design system setup |
| `/sync-skills` | Synchronize skills across plugins | Skill management |

## Game Development (gamedev-overture)

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/implement` | End-to-end game development with market analysis, GDD, art direction, and 6-phase planning | New games, major game features |
| `/task` | Execute single task with precision | Bug fixes, small changes |
| `/design` | Create design documentation | Architecture planning |
| `/create-plan` | Generate work plan from design | Planning phase |
| `/build` | Execute from existing task plan | Resume implementation |
| `/review` | Verify code against design docs | Post-implementation check |
| `/diagnose` | Investigate problems and derive solutions | Bug investigation, root cause analysis |
| `/reverse-engineer` | Generate docs from existing code | Legacy game documentation |
| `/add-integration-tests` | Add integration/E2E tests to existing code | Test coverage for existing implementations |
| `/audit` | Interactive dead code detection and cleanup | Codebase hygiene |
| `/setup-context` | Initialize project-context skill | New project setup |
| `/uxdoc` | Create UX documentation | Game UI/UX documentation |
| `/sync-skills` | Synchronize skills across plugins | Skill management |
| `/update-doc` | Update existing documentation | Document maintenance |

> **Tip**: All plugins share `/task`, `/diagnose`, `/audit`, `/setup-context`, and `/sync-skills`. `/brand-context` is only in frontend-overture. The gamedev plugin uses the same `/implement` command name as backend, but with game-specific orchestration (market analysis, GDD, art direction, 6-phase planning). For reverse engineering, use `/reverse-engineer` (backend-overture) to generate PRD, then `/front-reverse-design` (frontend-overture) to generate frontend Design Docs from that PRD.
