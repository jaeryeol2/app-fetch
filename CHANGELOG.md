# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다. 버전 규칙은 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

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
