# Repository Structure

```
overture/
├── .claude-plugin/
│   └── marketplace.json        # Manages all plugins
│
├── agents/                     # Shared agents (symlinked by all plugins)
│   ├── code-reviewer.md
│   ├── expert-analyst.md       # Multi-expert analysis
│   ├── codebase-scanner.md     # Dead code detection
│   ├── cleanup-executor.md     # Safe code removal
│   ├── investigator.md         # Diagnosis workflow
│   ├── verifier.md             # Diagnosis workflow
│   ├── solver.md               # Diagnosis workflow
│   ├── scope-discoverer.md     # Reverse engineering workflow
│   ├── code-verifier.md        # Reverse engineering workflow
│   ├── ux-designer.md          # UX/UI design (frontend)
│   ├── task-executor.md
│   ├── technical-designer.md
│   └── ...
│
├── commands/                   # Shared commands
│   ├── implement.md
│   ├── design.md
│   ├── audit.md                # Dead code audit
│   ├── diagnose.md             # Problem diagnosis
│   ├── reverse-engineer.md     # Reverse documentation
│   ├── setup-context.md        # Project context initialization
│   ├── brand-context.md        # Brand system initialization
│   ├── create-plan.md
│   ├── build.md
│   └── ...
│
├── skills/                     # Skills (auto-loaded by agents)
│   ├── ai-development-guide/
│   ├── coding-principles/
│   ├── testing-principles/
│   ├── expert-analysis-guide/  # Multi-expert analysis framework
│   ├── implementation-approach/
│   ├── project-context/        # Project-specific context
│   ├── technical-spec/         # Technical design rules
│   ├── brand-system-guide/     # Brand design system
│   ├── typescript-rules/       # Frontend-specific
│   └── ...
│
├── backend/                    # backend-overture plugin
│   ├── agents/                 # Symlinks to shared agents
│   ├── commands/               # Symlinks to shared commands
│   ├── skills/                 # Symlinks to shared skills
│   └── .claude-plugin/
│       └── plugin.json
│
├── frontend/                   # frontend-overture plugin
│   ├── agents/                 # Symlinks to shared agents
│   ├── commands/               # Symlinks to shared commands
│   ├── skills/                 # Symlinks to shared skills
│   └── .claude-plugin/
│       └── plugin.json
│
├── fullstack/                  # fullstack-overture plugin
│   ├── agents/                 # Symlinks to shared agents
│   ├── commands/               # Symlinks to shared commands
│   ├── skills/                 # Symlinks to shared skills
│   └── .claude-plugin/
│       └── plugin.json
│
├── gamedev/                    # gamedev-overture plugin
│   ├── agents/                 # 19 symlinks + 12 local gamedev agents
│   │   ├── sr-game-designer.md       # GDD creation, vision ownership
│   │   ├── mid-game-designer.md      # Feature specs, balancing
│   │   ├── mechanics-developer.md    # Core systems, physics, state machines
│   │   ├── game-feel-developer.md    # Polish, juice, screen shake
│   │   ├── market-analyst.md         # Market analysis, Go/No-Go
│   │   ├── producer-agent.md         # Project management, timeline
│   │   ├── sr-game-artist.md         # Art direction, style guide
│   │   ├── technical-artist.md       # Pipeline, atlases, shaders
│   │   ├── ui-ux-agent.md            # HUD, menus, accessibility
│   │   ├── data-scientist.md         # Analytics, telemetry, A/B tests
│   │   ├── qa-agent.md               # Test plans, performance
│   │   ├── gamedev-work-planner.md   # 6-phase game work planning
│   │   └── ... (19 shared symlinks)
│   ├── commands/               # 14 symlinks + 1 local (implement.md)
│   ├── skills/                 # 11 symlinks + 2 local
│   │   ├── workflow-gamedev/  # Gamedev flows
│   │   └── documentation-criteria/           # Extended with game templates
│   └── .claude-plugin/
│       └── plugin.json
│
├── LICENSE
└── README.md
```
