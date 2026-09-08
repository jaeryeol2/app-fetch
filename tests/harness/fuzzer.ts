/**
 * AGENTS.md 지침 기반 카오스 & 퍼징(Fuzzing) 테스트 하네스 엔진
 * 엣지 케이스, 경계 조건(Boundary Conditions), 순환 참조, 이상 페이로드를 생성합니다.
 */

import { randomInt, randomString } from './generators';

export interface CircularDataStructure {
  id: string;
  self?: unknown;
  nested?: {
    parent?: unknown;
  };
}

/**
 * 쿼리 직렬화 순환 참조 감지 검증용 순환 데이터 생성기
 */
export function generateCircularData(): CircularDataStructure {
  const obj: CircularDataStructure = {
    id: randomString('circular', 8),
  };
  obj.self = obj;
  obj.nested = {
    parent: obj,
  };
  return obj;
}

/**
 * 대용량/경계값 바이너리 버퍼 생성기 (0 바이트, 1 바이트, N KB)
 */
export function generateBoundaryBinary(sizeBytes = 1024): Uint8Array {
  const buffer = new Uint8Array(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) {
    buffer[i] = (i + Math.floor(Math.random() * 256)) % 256;
  }
  return buffer;
}

/**
 * 복잡 다형성 데이터 구조 (Date, Map, Set, RegExp, 심볼릭 키) 생성기
 */
export function generatePolymorphicQuery(): Record<string, unknown> {
  const set = new Set<string>();
  const map = new Map<string, unknown>();

  for (let i = 0; i < randomInt(2, 4); i++) {
    set.add(randomString('set-item', 5));
    map.set(randomString('map-key', 4), randomInt(1, 100));
  }

  return {
    queryDate: new Date(Date.now() - randomInt(1000, 100000)),
    queryRegex: new RegExp(`^${randomString('regex', 4)}.*`, 'i'),
    querySet: set,
    queryMap: map,
    specialChars: '!@#$%^&*()_+~`|}{[]:;?><,./-=\\"\'',
    unicode: '🚀 jaeryeol2 플랫폼 ⚡ 한국어 & Emoji 🌟',
    deepNested: {
      l1: {
        l2: {
          l3: {
            value: randomInt(1000, 9999),
            active: Math.random() > 0.5,
          },
        },
      },
    },
  };
}

/**
 * 극한의 타임아웃 경계값(0ms, 1ms, 5ms 등) 생성기
 */
export function generateExtremeTimeout(): number {
  const extremeValues = [0, 1, 2, 5, 10];
  const idx = Math.floor(Math.random() * extremeValues.length);
  return extremeValues[idx];
}
