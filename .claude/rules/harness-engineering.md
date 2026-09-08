# app-fetch Harness Engineering & Test Architecture Rules

This document defines the unit-test execution, 8 target-environment validation, dynamic/varied scenarios, dual-mode, and error scenario guidelines specified in Rule 9 of `AGENTS.md`.

---

## 1. Zero-Dependency, Strict Type Safety & Coding Standards Principles
- **Zero-Dependency**: Completely forbid dependencies on external HTTP/query libraries (`axios`, `qs`, `got`, `ofetch`, etc.); use only the native Web Fetch API.
- **`any` is strictly prohibited**: Follow `strict` mode, and handle uncertain boundary values with `unknown`, type guards, type narrowing, and explicit generic interfaces.
- **Switch to `switch` when there are more than 4 conditional branches**: Use `if` when branch conditions are 4 or fewer; otherwise (5 or more), use a `switch` statement or a strategy pattern for readability and cognitive-complexity optimization.
- **Prohibit `Array.prototype.forEach` & follow `for...of` / optimized loops**:
  - `forEach` usage is completely banned.
  - Use higher-order functions such as `map`, `filter`, `reduce` for transformation/filtering.
  - Use `for...of` as the top-priority standard for simple iteration (side-effects).
  - In sections where large-scale data processing is expected and matches the array size, apply an optimized loop (`for (let i=0; i<len; i++)` / `while`) with `new Array(size)` memory pre-allocation and direct index loading (`arr[i] = val`). Use `.push()` only for small/variable-length arrays.

---

## 2. Scope of the 8 Core Target Environments
The harness must perform unit tests against the following 8 target environments:
1. **Vue 3** (CSR environment — native browser AJAX and reactive state)
2. **Nuxt 3** (SSR & CSR dual-mode environment)
3. **React 18/19** (CSR environment — client state and component lifecycle)
4. **Next.js App Router** (SSR Server Component / Server Action & CSR Hydration communication)
5. **NestJS / Node.js Backend** (backend service singleton injection and inter-server communication)
6. **JSP / Legacy HTML** (`dist/app-fetch.min.js` IIFE script tag and `window.appFetch`)
7. **Server Template Engines** (Handlebars, EJS, Thymeleaf pre-binding SSR)
8. **Bundle Validation** (ESM `app-fetch.mjs`, CJS `app-fetch.cjs`, IIFE integrity)

---

## 3. Mandatory Dynamic/Random Varied Scenario Validation Principle (Dynamic & Varied Testing Architecture)
- **Strictly forbid reusing static fixtures**: Exclude fixed, hardcoded data, and dynamically generate varied data on every run.
- **Dynamic variable elements**:
  - Random values (`Math.random()`, `Date.now()`, random UUID/strings)
  - Variable query keys/values (arrays, nested objects, Date, Map, Set, RegExp, etc.)
  - Random timeouts and network delays (ms)
  - Dynamically randomized HTTP error status codes (drawn variably from 400–599)
  - Various body payload types (JSON, Blob, FormData, plain text, Uint8Array binary, etc.)
  - Dynamic auth tokens and individual header combinations
  - Variable exponential backoff factors (factor, initialDelay, maxRetries)
- Prevent tests from meaninglessly passing by repeating the same pattern every time; maintain a fully dynamic test architecture so that boundary conditions (edge cases) and variable parameter combinations are evaluated differently on every run.

---

## 4. SSR & CSR Dual-Mode Integrated Validation Rule
- When writing and running tests for Next.js (App Router / Pages Router), Nuxt 3, and JSP / legacy HTML / template engine environments, you must integrate-test both **server-side rendering (SSR: Node.js server environment)** and **client-side rendering (CSR: browser DOM / hydration environment)**, both independently and in combined scenarios.

---

## 5. Mandatory `appFetch.create()` Instance Validation Principle
- When writing unit tests, you must include not only direct calls to the base `appFetch` function, but also tests for creating a custom instance via `appFetch.create()`, verifying the inheritance/merging behavior of default options (`baseURL`, `headers`, `timeout`, etc.), and validating isolation between multiple instances.

---

## 6. Various Data Format Validation Principle
- Beyond typical JSON payloads, you must include and verify request-body and response-parsing (`getData`) scenarios for `FormData`, `File`/`Blob` uploads, `URLSearchParams`, plain text, and binary (`application/octet-stream`, images/PDF, etc.) formats.

---

## 7. Mandatory Failure & Error-Handling Scenario Validation Principle
- Beyond the 200 OK success case, you must fully cover failure and error-handling scenarios in the test suite: HTTP 4xx/5xx error responses, timeout occurrence (`AbortError`), `HttpError` exception handling, automatic retry/delay retry failures and `onError` interceptor exception collection, query circular-reference errors, and error-object wrapping via the `returnError` helper.

---

## 8. Strict Test File Location Principle
- All unit tests and temporary test scripts must **always be created and written only under the `tests/` folder** (registered in `.gitignore` and safely managed).

---

## 9. Readability and Lint/Compile Validation
- After modifying code, always run `npm run build` and `npm test` to confirm that bundle generation, type checking, linting, and unit tests all complete successfully at 100%.
