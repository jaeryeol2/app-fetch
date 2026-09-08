---
name: app-fetch-validate
description: >-
  Execute, develop, and verify the app-fetch build, lint, and test validation workflow across all 8 target
  environments (Vue 3, Nuxt 3, React 18/19, Next.js App Router, NestJS Backend, JSP Script Tag, Template Engines,
  Bundle Integrity) using dynamic random scenarios, fuzzer, and SSR/CSR dual-mode validation.
---

# `app-fetch` Validation Skill

This skill is a runbook that systematically performs, per the development guidelines and architecture principles in `AGENTS.md`, validation of the `app-fetch` library across its 8 target environments, dynamic/varied scenario testing, and dual-mode (SSR/CSR) validity evaluation.

---

## 📋 Core Validation Procedure (Step-by-Step Runbook)

### Step 1: Build & Bundle Integrity Validation
Run the build to ensure the bundle outputs (ESM, CJS, IIFE, DTS) match the latest source code:
```bash
npm run build
```
- **Validation targets**:
  - `dist/app-fetch.mjs` (ESM)
  - `dist/app-fetch.cjs` (CJS)
  - `dist/app-fetch.min.js` (IIFE Script Tag)
  - `dist/@types/app-fetch.d.mts` (DTS)

### Step 2: Static Analysis & Lint Validation
Verify code quality and compliance with SonarQube/ESLint rules:
```bash
npx eslint .
```
- **Principles**: No `any` usage, minimize cognitive complexity, switch to `switch` when there are 4+ `if` conditions.

### Step 3: Run the 8-Environment Matrix & Dynamic/Varied Tests
Run the full unit test suite and matrix harness:
```bash
npm test
```
- **Validation targets**:
  1. **Vue 3 / React 18/19 (CSR)**: Browser AJAX, reactive state, FormData uploads, chained parsing
  2. **Next.js App Router / Nuxt 3 (SSR & CSR Dual-Mode)**: Server Component/Action fetch & hydration client fetch
  3. **NestJS / Node.js Backend**: Singleton service injection, 4xx/5xx error collection, exponential backoff retry, `returnError` conversion
  4. **JSP / Legacy HTML**: Loading `dist/app-fetch.min.js` as an IIFE script tag and polymorphic queries via `window.appFetch`
  5. **Server Template Engines (EJS/Handlebars/Thymeleaf)**: SSR pre-fetching and binary Blob downloads
  6. **Multi-tenant Isolation & Circular-Reference Guard**: `appFetch.create()` instance isolation and WeakSet-based circular-reference detection
  7. **Chaos / Fuzzer**: Random queries, emoji/Unicode, extreme timeouts (0–10ms), stream-cloning safety

---

## 📚 Detailed Reference Documents (References)
- [8 Target Environments Specification](./references/target-environments.md)
- [Dynamic/Varied Data & Fuzzing Generation Guidelines](./references/dynamic-generators.md)
- [Harness Engineering Rules](../../rules/harness-engineering.md)
