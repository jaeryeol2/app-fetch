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
- [Harness Engineering](.agents/rules/harness-engineering.md): 8 target-environment validation, dynamic/varied scenarios, Fail & Fix History documentation procedure (details of Core Rules 9-10).

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
