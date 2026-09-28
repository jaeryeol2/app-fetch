# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [@AGENTS.md](AGENTS.md) for full project domain knowledge, core principles, and architecture rules. Coding and testing rules live in `.claude/rules/` (mirrored in `.agents/rules/` — keep both copies identical when editing).

## Commands
- `npm run build` : tsdown bundle build (ESM/CJS/IIFE/DTS). The script also copies `.d.mts` → `.d.cts` and renames the IIFE output to `app-fetch.min.js`.
- `npm test` : Vitest harness (8 target environments + dynamic fuzzing). `pretest` runs the build first, because `tests/bundle-dist.test.ts` and `tests/runtime-smoke.mjs` load `dist/`.
- `npx vitest run tests/issue-fixes.test.ts` : single file (build first if the file touches `dist/`); add `-t "<test name>"` for a single case.
- `node tests/runtime-smoke.mjs` : framework-free smoke test of the built ESM/CJS bundles against a local HTTP server.
- `npm run typecheck` : `tsc --noEmit`
- `npm run lint` : ESLint check (`src`, `tests`)

Node versions: dev tooling needs Node ^22.18 or >=24.11 (tsdown); the published package supports Node >=18 (`engines`). CI (`.github/workflows/ci.yml`) runs lint/typecheck/test on 22 and 24, then `runtime-smoke.mjs` against the built `dist/` on 18 and 20.

## Request pipeline (spans `src/index.ts` and `src/helpers/*`)
`appFetch(path, options)` → `fetchData` (index.ts), one call per attempt:
1. `buildRequestInit` (fetch-pipeline-helper): strips library-only keys from the spread options, merges headers into a native `Headers`, uppercases `method`, `setupRequestBody` (JSON-stringify plain objects; drop body on GET/HEAD; drop stale JSON Content-Type for FormData/URLSearchParams/Blob), composes user `signal` with the timeout signal (`resolveAbortSignal`), runs `beforeRequest`.
2. `getURL` → `buildBasePath` (baseURL join + `assertAbsoluteUrlAllowed`) + `queryString`/`flatQuery` (nested query serialization, WeakSet circular detection).
3. `fetch()`. Only errors thrown after `isFetchStarted = true` (or timeouts) are retryable; serialization/`beforeRequest` errors fail fast via `handleFetchError(..., isRetryable=false)`.
4. Success path: `handleRetryOrReturnResponse` is called **outside** the `try` block on purpose — inside it, a failed retried attempt would be re-caught and retried again, firing `onError` repeatedly.

Retry is recursion (`fetchExecutor(path, options, attemptCount + 1)`), hard-capped at 10 attempts. `appFetch.create()` merges defaults per call (`omitUndefined`, `mergeHeaders`, `composeInterceptors`) and returns an instance that can `.create()` again. `getData` (fetch-helper) reads the body once, parses by Content-Type/charset, and caches the result per `Response` in a WeakMap.

Intentional behaviors (covered by `tests/issue-fixes.test.ts`; don't "fix" them back):
- 2xx responses never reach `retry`/`retryStrategy`; `post`/`patch` are excluded from the default `retry` (only an explicit `retryStrategy` retries them).
- `afterResponse`/`retryStrategy` errors are not retried; they go through `withOnError` (one `onError` call, then rethrow).
- With a `baseURL`, cross-origin `http(s)` absolute URLs throw unless `allowAbsoluteUrls: true` (credential-leak/SSRF guard, 2.0.0 breaking change); the error message exposes only the origin.
- HTTP 4xx/5xx responses resolve normally (no throw, no `onError`); callers wrap with `HttpError`/`returnError` (see `examples/sample.ts`).
- Timeout errors have `name === 'TimeoutError'` and keep the `Request Timeout. time : {ms}ms` message that tests match on.

## Tests
- Tests are committed; throwaway scripts go in the gitignored `tests/tmp/`.
- Per `testing-standards.md`, tests use randomized data (no static fixtures), cover `appFetch.create()` isolation, and use `vi.spyOn(globalThis, 'fetch')` (or `window.fetch` under happy-dom) instead of real network, except the local-server smoke tests.
- Record user-facing changes in `CHANGELOG.md` and the README.

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
