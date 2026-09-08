# app-fetch Core Architecture & Standards

This document defines the core context, tech stack, architecture principles, and coding standards of the `app-fetch` project, as established in `AGENTS.md`.

---

## 📌 Project Context & Overview
`app-fetch` is a **native Web Fetch API-based wrapper library** developed by jaeryeol2.
Using only the native `fetch` API — with no external HTTP dependencies (`axios`, `qs`, `got`, `ofetch`, etc.) — it provides a unified API communication interface across browser (CSR), SSR (Next.js/Nuxt), and Node.js backend server environments.

---

## 🛠 Tech Stack & Build Infrastructure
- **Language**: TypeScript 6.x (`strict` mode)
- **Bundler**: `tsdown` (Rolldown-based)
- **Outputs**:
  - `dist/app-fetch.mjs` (ESM Bundle)
  - `dist/app-fetch.cjs` (CommonJS Bundle)
  - `dist/app-fetch.min.js` (Browser IIFE Bundle for Script Tag / JSP)
  - `dist/@types/app-fetch.d.mts` (TypeScript Declaration)
- **Build Command**: `npm run build`

---

## 📁 Repository Structure
```
app-fetch/
├── src/
│   ├── index.ts                     # Main entry point (appFetch, appFetch.create, query/url/request helpers)
│   ├── sample.ts                    # Example wrapper for real-project usage (sampleFetch)
│   ├── @types/
│   │   └── fetch-type.d.ts          # Core TypeScript type definitions for interceptors, options, and errors
│   └── helpers/
│       ├── fetch-helper.ts          # getData (Content-Type-specific response parser), HttpError, returnError
│       ├── fetch-pipeline-helper.ts # fetchData execution pipeline pre/post-processing, signal handling, retry/error
│       └── interceptor-helper.ts    # composeInterceptors, mergeFetchOptions, setInterceptors
├── dist/                            # tsdown build output
├── package.json                     # Package configuration and build scripts
├── tsconfig.json                    # TS compiler options
├── tsdown.config.ts                 # Bundler configuration
├── README.md                        # Library guide
├── manual.html                      # Single-page developer manual (does not include test history)
└── .agents/                         # Agent rules and skills
```

---

## 🚨 Development Guidelines & Architecture Principles (Core Rules)

### 1. Zero-Dependency Principle
- This project is a **Zero-Dependency Native Fetch Wrapper**. Never add external HTTP/query runtime dependencies such as `axios`, `qs`, `got`, or `ofetch`.

### 2. Strict Type Safety & Absolute Ban on `any`
- Strictly follow TypeScript `strict` mode, and **strictly prohibit the use of the `any` type** anywhere in the code.
- For uncertain boundary values, ensure complete type safety using `unknown` combined with type guards / type narrowing, or generics with explicit interfaces.

### 3. SonarQube & ESLint Static Analysis, Conditional Branching, and Design Pattern Standards
- **Comply with ESLint and SonarQube rules**: Strictly follow the lint rules in `eslint.config.mjs` and SonarQube static analysis standards. **Even without a connected external SonarQube server, code must be written proactively in accordance with the default standard rules (Sonar Way Rules: prefer `const` over `let` / maintain immutability, keep cognitive complexity at 15 or below, eliminate duplication, etc.).**
- **Nested ternary operators are strictly prohibited**: For readability and cognitive-complexity optimization, nested ternary operators (`a ? b : c ? d : e`) are strictly forbidden; only a single-level ternary is allowed. Multi-branch logic must be written with `if / else` or `switch`.
- **Switch to `switch` when there are more than 4 `if` conditions**: Use `if / else if` when there are 4 or fewer branch conditions; when complexity grows to 5 or more (more than 4), you must use a **`switch` statement** for readability and maintainability.
- **Design pattern optimization and mandatory documentation comments**:
  - When creating new functions or refactoring, actively apply an appropriate design pattern (Strategy, Factory, Builder, Pipeline, Lookup Table, etc.) wherever optimization or flexibility extension is possible.
  - When a design pattern is applied, you must add a comment at the top of the relevant function/class stating **the applied design pattern name (`@pattern`) and a brief description of its behavior**.

### 4. Modern JavaScript / TypeScript Syntax & Loop Optimization Standards
- **Follow modern syntax standards**: Comply with modern standard constructs such as Optional Chaining (`?.`), Nullish Coalescing (`??`), Logical Assignment (`||=`, `??=`), `async/await`, `Promise.allSettled`, and array/object destructuring.
- **`Array.prototype.forEach` is strictly prohibited**:
  - `forEach` usage is banned to avoid function-call overhead and to guarantee asynchronous control-flow consistency.
- **When a return value is needed (data transformation/extraction)**: Use array higher-order methods such as `.map()`, `.filter()`, `.some()`, `.every()`, `.reduce()`.
- **When no return value is needed (side-effects / simple iteration)**: For `void`-type loops that perform simple iteration and side effects without a return value, **`for...of`** is the top-priority standard.
- **When large datasets are expected and the array size is known in advance (Optimized Loop & Pre-allocation)**:
  - When large-scale data processing is expected or the array `size` is known in advance, use an optimized loop (traditional `for (let i=0; i<len; i++)` or `while`).
  - **Pre-allocate with `new Array(size)` and load directly by index**: To avoid the overhead of dynamic `.push()`, pre-allocate memory with `new Array(size)` and load elements directly by index (`arr[i] = val`). Use `.push()` only for small or variable-length arrays.

### 5. Memory Optimization & Object Resource Management
- In code sections that require memory optimization, strictly apply resource-management and memory-optimization patterns: avoid unnecessary object/array recreation inside loops, reuse temporary objects, prevent closure memory leaks, and use `WeakMap`/`WeakSet` for automatic reference release.

### 6. Preserving Native Headers Instances
- When merging headers, you must prevent the loss of native `Headers` instance properties caused by string overwriting. Always process merges explicitly through the `Headers` object's `set()` method. (See `mergeHeaders`.)

### 7. Nested Query Serialization & Circular Reference Prevention
- When processing the `query` option, generic parameter serialization must be supported for arrays, nested objects, Date, Map, Set, and RegExp.
- When a circular reference occurs, it must be safely detected and must throw `Error('Circular reference detected in query parameters')`. (Use `WeakSet`.)

### 8. AbortSignal Composition Safety
- Maintain the `resolveAbortSignal` helper so that a user-defined `signal` and the built-in `timeout`'s `AbortController.signal` can operate together safely. `AbortSignal.any` should be preferred, with a guaranteed fallback for older environments.
