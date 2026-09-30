# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다. 버전 규칙은 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [3.0.0] - 2026-09-30

> **업그레이드 요약**: `exponentialBackoffRetry()`를 POST/PATCH에 쓰고 있다면 `methods: ['POST', 'PATCH', ...]`를 명시하세요. 그 외에는 코드 변경이 필요 없습니다. 2.0.x에서 바로 올린다면 [2.1.0](#210---2026-09-30)의 동작 변경(재시도 허용 목록, `Retry-After` 존중, 백오프 jitter 기본 적용)도 함께 확인하세요.

### ⚠️ Breaking
- **`exponentialBackoffRetry()`의 `methods` 기본값이 멱등 메서드 `['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']`로 바뀌었습니다.** 이제 `methods`를 지정하지 않으면 POST/PATCH를 재시도하지 않습니다. 인스턴스 기본값에 백오프를 걸었을 때 모든 POST가 재시도되어 중복 생성되던 위험을 막기 위한 변경이며, [2.1.0](#210---2026-09-30)부터 경고로 예고되었습니다.
  - 마이그레이션: POST/PATCH 재시도가 필요하면 `exponentialBackoffRetry({ methods: ['POST', 'PATCH', ...] })`처럼 명시하세요. 이미 `methods`를 지정했다면 영향이 없습니다.
- 2.1.0에서 추가된 "`methods` 없이 POST/PATCH 요청 시 1회 경고"는 기본값 변경으로 필요 없어져 제거되었습니다.
- 그 밖의 API와 동작(기본 `retry`, 커스텀 `retryStrategy`, 인터셉터, 타임아웃 등)은 2.1.1과 같습니다.

## [2.1.1] - 2026-09-30

### Docs
- `beforeRequest`에서 `options.headers = {...}` 대입은 인스턴스 기본 헤더와 자동으로 붙은 JSON `Content-Type`까지 교체하므로 `.set()`/`.append()`/`.delete()`로 수정하라는 안내 (README, `BeforeRequestOptions` JSDoc)
- `dispatcher`용 `undici`는 Node 내장 메이저에 맞춰 설치할 것(`node -p process.versions.undici`, Node 24 → `undici@^7`). 불일치 시 에러 문자열(`invalid onRequestStart method`) 안내
- `RetryContext.method`는 요청 옵션과 무관하게 항상 대문자이고, `exponentialBackoffRetry`의 `methods`는 대소문자를 구분하지 않는다는 안내

## [2.1.0] - 2026-09-30

### ⚠️ Changed (동작 변경)
- **기본 `retry`의 재시도 대상을 허용 목록 `[408, 429, 500, 502, 503, 504]`로 한정합니다.** 다시 보내도 결과가 같은 `501`, `505`, `506`, `507`, `508`, `509`, `510`, `511`은 더 이상 재시도하지 않습니다. (`exponentialBackoffRetry`의 기본 `statusCodes`와 동일)
- **기본 `retry`와 `exponentialBackoffRetry()`가 `Retry-After` 헤더를 존중합니다.** 정수 초 또는 HTTP-date를 해석해 `delay`/백오프 대신 그만큼 기다리며, 상한(기본 `retry`는 30초, 백오프는 `maxDelay`)을 넘으면 재시도하지 않고 그 응답을 반환합니다. 소수 초 등 해석할 수 없는 값은 무시합니다. 커스텀 `retryStrategy`에는 적용되지 않습니다.
- **`exponentialBackoffRetry()`의 대기 시간에 full jitter가 기본 적용됩니다.** 0~계산값 사이 무작위 값을 사용하며, 이전처럼 고정 값이 필요하면 `jitter: false`를 지정하세요. 계산값은 `maxDelay`(기본 30초)로 제한됩니다.

### ⚠️ Deprecated
- **`exponentialBackoffRetry()`를 `methods` 없이 쓰면 POST/PATCH도 재시도합니다. 3.0.0부터 기본값이 멱등 메서드(GET, HEAD, OPTIONS, PUT, DELETE)로 바뀝니다.** 2.1.0에서는 동작을 유지하되, `methods` 없이 만든 전략으로 POST/PATCH를 요청하면 요청 시점에 전략당 1회 `console.warn`을 출력합니다. 현재 동작을 유지하려면 `methods: ['POST', ...]`를 명시하세요.

### Added
- `beforeRequest` 인터셉터의 두 번째 인자 `{ path, attempt }`: 호출 경로(baseURL 결합 전)와 시도 횟수
- `beforeRequest`의 `options.headers`가 타입과 런타임 모두 항상 `Headers`입니다. 일반 객체 등 `HeadersInit`을 대입하면 즉시 `Headers`로 정규화되며, `{ ...options }` 복사에서도 유지됩니다. `as Headers` 단언이 더 이상 필요 없습니다. (새 타입 `BeforeRequestOptions`, `BeforeRequestContext`)
- `HttpError(message, status, data?)`: 에러 응답 본문 등을 `data`로 보존하며, `returnError()`가 이를 그대로 전달합니다(없으면 `null`).
- `RetryContext.method`(대문자, 기본 `'GET'`)와 `RetryContext.retryAfterMs`(해석된 `Retry-After`, 상한 미적용)
- `exponentialBackoffRetry`의 `methods`, `jitter`, `maxDelay` 옵션

### Docs
- 에러 판별 표(`TimeoutError`/`AbortError`/`TypeError`/HTTP 4xx·5xx)와 `ensureOk` 헬퍼 패턴
- 커스텀 `retryStrategy`는 POST/PATCH 제외 안전장치를 우회한다는 경고
- 스트리밍 응답의 idle 타임아웃 레시피, 짝이 맞아야 하는 처리(카운터 등)는 호출 전후에서 할 것
- `examples/sample.ts`가 `HttpError`에 에러 본문을 담아 전달

## [2.0.1] - 2026-09-30

### Added
- `dispatcher` 옵션 타입 추가. Node.js(undici) 사내 프록시용 `ProxyAgent` 등을 TypeScript에서 타입 에러 없이 전달할 수 있습니다. (런타임 동작은 기존과 동일)
- GitHub Actions CI: Node 22/24에서 lint·typecheck·build·test, Node 18/20에서 빌드된 번들 런타임 스모크 테스트
- 테스트 스위트를 저장소에 포함 (임시 스크립트는 `tests/tmp/`, git 제외)

### Fixed
- `AbortSignal.any`가 없는 런타임(Node 18.0~20.2, Chrome 115 이하, Safari 17.3 이하)에서 응답 헤더 수신 직후 사용자 `signal` 연결이 해제되어, 본문 수신 중 `abort()`/`AbortSignal.timeout()`이 전달되지 않고 `getData()`가 무기한 대기하던 문제. 이제 `getData()`로 본문 소비가 끝나거나 재시도로 응답을 버릴 때 해제합니다.
- `afterResponse` 인터셉터가 전달받은 `response.clone()`을 읽지 않으면, 원본을 읽는 동안 복제 분기가 본문 전체를 버퍼링해 메모리를 최대 2배로 점유하던 문제. 인터셉터가 반환될 때까지 읽기를 시작하지 않은 clone은 즉시 취소합니다.
- `Content-Length` 헤더 없이(chunked 등) 비어 있는 본문을 `getData()`가 JSON 파싱 에러 로그와 함께 빈 문자열(`''`)로 반환하던 문제. 204와 같이 `null`로 통일합니다.
- `AbortSignal.any`가 없는 런타임에서 사용자 `signal`의 abort `reason`이 사라져, `AbortSignal.timeout()`에 의한 중단이 `TimeoutError`가 아닌 `AbortError`로 보고되던 문제

### Docs
- 성공은 `response.ok`(2xx)로 판정하고 특정 상태 코드 고정 비교를 피하라는 권고, `dispatcher` 사용 시 소비자 측 `undici` 설치·버전 호환 안내
- `afterResponse`는 reject된 요청에서 실행되지 않으므로 로딩 해제 등은 `onError`에도 둘 것, 재시도 전체 시간 제한은 `signal`로 걸 것, `put`/`delete` 기본 재시도 주의, 세션 만료 리다이렉트 판별법(`response.redirected`) 안내
- README에 기업 환경 설정 섹션 추가: 사내 프록시(`NODE_USE_ENV_PROXY`, `ProxyAgent`), 사내 CA, SSR 서버용 `baseURL` 절대 URL 안내
- CHANGELOG 추가

## [2.0.0] - 2026-09-28

### ⚠️ Breaking
- `baseURL`이 설정된 요청에서 origin이 다른 `http(s)` 절대 URL을 요청 전에 차단합니다 (자격증명 유출/SSRF 방지). 같은 origin 절대 URL, `blob:`/`data:`, `baseURL` 없는 호출은 허용됩니다. 에러 메시지에는 origin만 포함됩니다.
  - 마이그레이션: 외부 API를 의도적으로 호출하는 경우 `allowAbsoluteUrls: true`를 지정하세요.

### Added
- `allowAbsoluteUrls` 옵션

### Docs
- SSR/서버 환경에서 모듈 전역 인터셉터 레지스트리에 사용자별 토큰을 넣지 말라는 경고

## [1.2.0] - 2026-09-28

### Changed
- 2xx 성공 응답에는 `retry`/`retryStrategy`를 평가하지 않습니다 (`attempt`만 검사하는 전략이 성공 응답을 재요청하던 문제)
- fetch 이전 단계의 에러(쿼리 순환 참조, 바디 직렬화 실패, `beforeRequest` 예외)는 재시도하지 않습니다. 타임아웃은 계속 재시도 대상입니다.
- 타임아웃 에러의 `name`이 `'TimeoutError'`입니다 (메시지 동일)
- 스크립트 태그 번들(`app-fetch.min.js`)을 ES2019 문법으로 빌드 (Chrome 73+, Safari 12.1+)
- 공개 `appFetch` 타입에서 내부 `attemptCount` 파라미터 제거

### Added
- `package.json`에 `sideEffects: false`, `engines.node >= 18`

## [1.1.0] - 2026-09-28

### Changed
- `method`는 소문자로 지정하고 전송 시 대문자로 변환됩니다 (소문자 `patch` 전송으로 405/400이 나던 문제)
- `post`/`patch`는 기본 `retry` 대상에서 제외됩니다 (필요 시 `retryStrategy` 지정)
- `afterResponse`/`retryStrategy` 예외는 재시도하지 않고 `onError` 1회 후 전달됩니다

### Fixed
- 재시도 중 실패 시 재시도가 중복되고 `onError`가 여러 번 호출되던 문제
- 재시도로 버려지는 응답 본문이 해제되지 않던 문제
- 재시도 대기(`delay`) 중 사용자 abort가 반영되지 않던 문제
- 기본 JSON `Content-Type`이 `URLSearchParams`/`Blob` 본문에 남던 문제
- `charset=EUC-KR` 등 비 UTF-8 응답이 깨지던 문제

### Added
- CJS용 타입 선언(`.d.cts`), import/require별 `exports` 분리, `unpkg`/`jsdelivr` 필드
- `HttpNoBodyMethod`에 `head`/`options`, `AppFetchInstance.create` 필수화

[2.0.1]: https://github.com/jaeryeol2/app-fetch/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/jaeryeol2/app-fetch/releases/tag/v2.0.0
