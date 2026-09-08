# Dynamic/Varied Data & Fuzzing Generation Guidelines (Dynamic Generators Reference)

## 1. Principle: Exclude Static Fixtures
- Every test must inject random and dynamic elements on each run to detect boundary conditions and edge cases.

## 2. Core Generator Patterns
- **Strings/IDs**: `randomString(prefix, length)`, `randomUuid()`
- **HTTP status codes**: `randomHttpStatus('all' | 'client' | 'server')` (drawn variably from 400–599)
- **Variable delay/timeout**: `randomDelayMs(min, max)`, `generateExtremeTimeout()` (0ms, 1ms, 5ms boundary values)
- **Payloads**:
  - `JSON`: dynamic ID, variable fields, arrays
  - `FormData`: variable text fields, `Blob` file attachments
  - `Blob`: variable size and MIME type
  - `Binary`: `Uint8Array` (1 byte to N KB)
  - `URLSearchParams`: variable key/value parameters
- **Polymorphic Query**:
  - `Date` instances (ISO 8601 serialization)
  - `Map` / `Set` collections
  - `RegExp` regular expressions
  - Special characters, emoji, multilingual Unicode
- **Circular Data Structure**:
  - Validate that structures containing self-references (`self`) and nested parent-object references (`parent`) are correctly blocked by `WeakSet`-based circular-reference detection.
