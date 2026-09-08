# 8 Target Environments Specification & Harness Validation Strategy (Target Environments Reference)

## 1. Vue 3 (CSR)
- **Runtime**: Browser DOM (`window.fetch`, `happy-dom`)
- **Validation focus**: Reactive-state binding, chained methods (`await appFetch('...').getData()`), `FormData`/`File` uploads, dynamic Bearer token injection.

## 2. Nuxt 3 (SSR & CSR Dual-Mode)
- **Runtime**: Universal (Node.js server engine + browser client hydration)
- **Validation focus**: Nitro server-side API fetching, automatic relative/absolute path correction, session/cookie/header synchronization after client hydration.

## 3. React 18/19 (CSR)
- **Runtime**: Browser DOM (`window.fetch`)
- **Validation focus**: Hook/component lifecycle integration, `AbortController`-based request cancellation on unmount, Strategy Pattern-based retry.

## 4. Next.js App Router (SSR & CSR Dual-Mode)
- **Runtime**: Node.js Server Components, Server Actions & Client Components
- **Validation focus**: Per-request isolated instances inside Server Actions, Request Memoization inheritance, interactive communication from Client Components.

## 5. NestJS / Node.js Backend
- **Runtime**: Node.js backend server (`globalThis.fetch`)
- **Validation focus**: Singleton service injection, inter-microservice communication, 4xx/5xx error interceptor (`onError`) logging and `returnError` conversion.

## 6. JSP / Legacy HTML Script Tag
- **Runtime**: Browser window (`app-fetch.min.js` IIFE bundle)
- **Validation focus**: Global `window.appFetch` exposure after loading via `<script src="app-fetch.min.js">`, legacy AJAX calls, polymorphic query encoding (Date, Map, Set, Regex, Unicode/emoji).

## 7. Server Template Engines (EJS, Handlebars, Thymeleaf)
- **Runtime**: Node.js / Java-compatible template rendering server
- **Validation focus**: Pre-bound render-data fetching, large binary (`application/octet-stream`, `Blob`) downloads and buffer parsing.

## 8. Bundle Integrity (ESM / CJS / IIFE)
- **Runtime**: Rolldown (`tsdown`) build output
- **Validation focus**: Correctness of `dist/app-fetch.mjs` (ESM), `dist/app-fetch.cjs` (CJS), `dist/app-fetch.min.js` (IIFE), and `dist/@types/app-fetch.d.mts` (DTS).
