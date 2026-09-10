# Claude Code Guidelines - app-fetch

See [@AGENTS.md](../AGENTS.md) for full project domain knowledge, core principles, and architecture rules.

## Quick Commands
- `npm run build` : tsdown bundle build (ESM/CJS/IIFE/DTS)
- `npm test` : Run the Vitest harness (8 target environments + dynamic fuzzing)
- `npm run typecheck` : `tsc --noEmit`
- `npm run lint` : ESLint check (`src`, `tests`)

## Rules
@rules/app-fetch-core.md
@rules/coding-standards.md
@rules/harness-engineering.md

## Skills (`.claude/skills/`)
Auto-discovered native Claude Code skills:
- `app-fetch-validate`: A runbook for build/lint/test validation and dynamic/varied scenario testing across the 8 target environments (Vue3/Nuxt3/React18-19/Next.js App Router/NestJS/JSP-legacy/server template engines/bundle integrity).
