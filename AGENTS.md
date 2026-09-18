# Project: app-fetch (jaeryeol2 Native Fetch API Wrapper Library)

## 1. Project Overview & Mission
- **Core Purpose**: A **native Web Fetch API-based wrapper library** developed by jaeryeol2. Using only the native `fetch` API — with no external HTTP dependencies (`axios`, `qs`, `got`, `ofetch`, etc.) — it provides a unified API communication interface across browser (CSR), SSR (Next.js/Nuxt), and Node.js backend server environments.
- **Value Proposition**: Standardizes baseURL/timeout/retry (exponential backoff)/interceptors (`beforeRequest`/`afterResponse`/`onError`) into a single thin wrapper, guaranteeing the same calling interface across different runtimes (browser/SSR/Node backend/legacy script tag).

## Tech Stack & Build Infrastructure
- **Language**: TypeScript (`strict` mode)
- **Bundler**: `tsdown` (Rolldown-based)
- **Outputs**: `dist/app-fetch.mjs` (ESM), `dist/app-fetch.cjs` (CJS), `dist/app-fetch.min.js` (IIFE Script Tag), `dist/@types/app-fetch.d.mts` (Type Declaration)
- **Test**: Vitest + happy-dom

## Repository Structure
```
app-fetch/
├── src/
│   ├── index.ts                     # Main entry point (appFetch, appFetch.create, query/url/request helpers)
│   ├── @types/fetch-type.d.ts       # Core TypeScript type definitions for interceptors, options, and errors
│   └── helpers/
│       ├── fetch-helper.ts          # getData, HttpError, returnError
│       ├── fetch-pipeline-helper.ts # fetchData execution pipeline pre/post-processing, signal handling, retry/error
│       └── interceptor-helper.ts    # composeInterceptors, mergeFetchOptions, setInterceptors
├── tests/                           # Unit tests and harness (harness/)
├── dist/                            # tsdown build output
├── README.md                        # Library guide
├── manual.html                      # Single-page developer manual (does not include test history)
└── .agents/                         # Agent rules and skills
```

---

## Core Rules (1-8: Architecture/Coding, 9: Testing)
1. **Zero-Dependency**: Never add external HTTP/query runtime dependencies such as `axios`, `qs`, `got`, `ofetch`.
2. **Strict Type Safety**: Follow TypeScript `strict` mode, absolutely no `any` type; use `unknown` + type narrowing/generics for uncertain boundary values.
3. **SonarQube & Conditional Branching Standards**: No nested ternary operators; use `if/else` for 4 or fewer branches, `switch`/strategy pattern for 5 or more.
4. **Loop/Iteration Optimization**: No `forEach`; use `map`/`filter`/`reduce` when a return value is needed, `for...of` when not; pre-allocate with `new Array(size)` for large fixed-size arrays.
5. **Memory Optimization**: Avoid unnecessary object recreation in loops, prevent closure memory leaks, use `WeakMap`/`WeakSet`.
6. **Preserve Native Headers**: When merging headers, always process explicitly via `Headers.set()` to prevent property loss from string overwriting.
7. **Nested Query Serialization & Circular Reference Prevention**: Support serialization of arrays/nested objects/Date/Map/Set/RegExp, with `WeakSet`-based circular-reference detection.
8. **AbortSignal Composition Safety**: Safely compose the user's `signal` and the built-in `timeout` signal via `AbortSignal.any`, with a fallback for older environments.
9. **Mandatory Dynamic/Varied Scenario Validation Across the 8 Target Environments**: Vue3/Nuxt3/React18-19/Next.js App Router/NestJS/JSP-legacy/server template engines/bundles (ESM·CJS·IIFE) — all 8 environments must be tested with dynamic random data on every run, not static fixtures — see `harness-engineering.md` for details.

---

## Rules (`.agents/rules/`)
- [Core Architecture & Standards](.agents/rules/app-fetch-core.md): Project overview, tech stack, directory structure, and details of Core Rules 1-8.
- [Coding Standards](.agents/rules/coding-standards.md): TypeScript/JavaScript coding standards, function declaration style, SonarQube compliance items.
- [Harness Engineering](.agents/rules/harness-engineering.md): The 8 target-environment matrix, mandatory dynamic/random scenario generation, SSR/CSR dual-mode validation, `appFetch.create()` instance isolation, varied body and response formats, failure and error-handling coverage, and the `tests/`-only file location rule (details of Core Rule 9).

## Skills (`.agents/skills/`)
- [app-fetch-validate](.agents/skills/app-fetch-validate/SKILL.md): A step-by-step runbook from build → static analysis → 8-environment matrix testing.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **app-fetch** (224 symbols, 464 relationships, 20 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/app-fetch/context` | Codebase overview, check index freshness |
| `gitnexus://repo/app-fetch/clusters` | All functional areas |
| `gitnexus://repo/app-fetch/processes` | All execution flows |
| `gitnexus://repo/app-fetch/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->

## Graft setup (per developer)

`graft/` and the Claude Code hook helpers are not committed: the graph is a
build artifact, and the helpers bake in an absolute path to the machine that
generated them. After cloning, wire up your own:

```bash
npm i -g @nanonets/graft
graft init && graft build
git config core.hooksPath .githooks
```

`init` writes `.claude/helpers/` and `.claude/settings.json` for your machine;
`build` generates `graft/` (deterministic, no API key). The tracked
`AGENTS.md` block, `.mcp.json`, and `.claude/skills/graft/` are identical on
every machine, so re-running `init` produces no diff.

## Index freshness after changing checkouts

The gitnexus and graft indexes describe the commit they were built from, not
your current HEAD. Whenever HEAD moves in a way the agent did not author —
`git pull`, `git checkout`/`switch`, a new `git worktree` — refresh before
answering any structural question:

```bash
node .gitnexus/run.cjs analyze --index-only
graft build
```

Both are incremental: only the files that actually changed are re-parsed.

`graft build` is wired into the `post-merge` and `post-checkout` hooks in
`.githooks/`, so it runs on its own once `core.hooksPath` is set. Do not wire
`analyze` into a git hook — it can block for up to 120s and a timeout risks
corrupting the KuzuDB index, which is why gitnexus's own PostToolUse hook only
reports staleness instead of fixing it.
