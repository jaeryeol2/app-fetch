# Coding Standards Rules

This document defines the TypeScript/JavaScript coding standards and lint/static-analysis guidelines for the `app-fetch` project.

---

## 1. Type Safety (Absolute Ban on `any`)
- Strictly follow TypeScript `strict` mode.
- **Use of the `any` type is strictly prohibited** anywhere in code and tests.
- Uncertain boundary values must be safely declared using `unknown` combined with type narrowing (type guards, `instanceof`, `typeof`), generics, or explicit interfaces/types.

---

## 2. Conditionals & Ternary Operator Rules
- **Nested ternary operators are strictly prohibited**:
  - To prevent readability loss, increased cognitive complexity, and lint/SonarQube violations, **nested ternary operators** in the form `a ? b : c ? d : e` are **strictly forbidden**.
  - A single ternary is allowed only for a single-condition check; branching with 2 or more conditions must be clearly separated using `if / else`, `switch`, or a lookup table.
- **4 or fewer conditional branches**: Use `if / else if / else`.
- **5 or more conditional branches (more than 4)**: You must switch to a **`switch` statement** or a Strategy Pattern / dynamic lookup table to minimize readability loss and cognitive complexity.

---

## 3. Array Iteration & Loop Optimization Standards
- **`Array.prototype.forEach` is strictly prohibited**:
  - `forEach` usage is completely banned to avoid function-call overhead and to standardize control flow and performance across the codebase.
- **When a return value is needed (data transformation/extraction)**:
  - Actively use functional higher-order array methods such as `.map()`, `.filter()`, `.reduce()`, `.some()`, `.every()`.
- **When no return value is needed (side-effects / simple iteration)**:
  - **`for...of`** is the default, top-priority standard.
- **When large datasets are expected and the array size is known in advance (Optimized Loop & Pre-allocation)**:
  - When large-scale data processing is expected or the array `size` is known in advance, use a traditional optimized loop (`for (let i = 0; i < len; i++)` or `while`).
  - **Pre-allocate memory with `new Array(size)` and load directly by index**: To avoid the memory reallocation/relocation overhead of dynamic `.push()`, you must pre-allocate the array size with `new Array(size)` and then load data by direct index access (`arr[i] = value`).
  - Use dynamic `.push()` only for variable-length elements or small arrays.

---

## 4. Design Pattern Usage & Mandatory Documentation Rules
- **Actively apply design patterns**:
  - When creating new functions or refactoring, actively apply an appropriate **design pattern** (e.g., Strategy Pattern, Factory Pattern, Builder Pattern, Middleware/Pipeline Pattern, Dynamic Lookup Table) wherever it reduces complexity, improves performance, or increases extensibility/flexibility.
- **Mandatory pattern comments and descriptions**:
  - At the top of any function, class, or module where a design pattern is applied, you must include **the applied design pattern's name** and **a brief comment describing its role/mechanism**.
  - Example:
    ```typescript
    /**
     * @pattern Strategy Pattern
     * @description Encapsulates HTTP error-response and retry-decision logic so it can be swapped dynamically at runtime
     */
    ```

---

## 5. SonarQube Static Analysis & Default Sonar Way Compliance
- **Always comply with SonarQube rules**: Follow all SonarQube static-analysis and clean-code standards when writing or refactoring source code.
- **Apply default rules when no SonarQube instance is connected**:
  - Even without a connected external SonarQube server or CI instance, code must be written proactively to fully comply with **the default recommended standard rules provided by SonarQube (Sonar Way for TypeScript/JavaScript)**.
- **Key compliance items**:
  1. **Prohibit unnecessary mutable variables (`let`) and reassignment**: Prefer `const`, maintain immutability, and favor regular expressions and pure functions over loops/reassignment.
  2. **Minimize cognitive complexity**: Keep each function's cognitive complexity at 15 or below; split helpers based on the single-responsibility principle (SRP).
  3. **Eliminate duplicated code and dead code**: Fully remove unused parameters, unreachable branches, and unnecessary casts.
  4. **Prevent unhandled Promises and leaked async exceptions**: Guarantee proper `try/catch` and exception forwarding across all asynchronous pipelines.
  5. **Simplify conditionals and leverage Nullish Coalescing (`??`) / Optional Chaining (`?.`)**.

---

## 6. Function Declaration Style (Function Declaration vs. Arrow Function)
- `app-fetch` is a pure TypeScript library with no framework entry points such as React components or Next.js route handlers. Therefore, **every function must be written, without exception, as an arrow function expression (`const foo = () => {}`)**; `function foo() {}` style declarations must not be used.
- Exception: a `class` that extends the native `Error`, such as `HttpError`, uses `class` syntax as-is regardless of this rule (it is not subject to the function-declaration/expression discussion).
- When a downstream project consuming `app-fetch` (e.g., a Next.js app) writes its own framework entry-point functions such as route handlers or components, it follows its own project conventions (e.g., `function` declarations), which does not affect `app-fetch`'s own source code.
