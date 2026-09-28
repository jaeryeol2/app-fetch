/**
 * AGENTS.md 아키텍처 규칙 검증용 Assertion 헬퍼
 */

import { expect } from 'vitest';
import type { AppFetchInstance } from '../../src/@types/fetch-type';
import { HttpError } from '../../src';

/**
 * 네이티브 Headers 인스턴스 무결성 검증
 */
export function assertHeadersPreserved(headers: unknown, expectedRecord: Record<string, string>): void {
  expect(headers).toBeInstanceOf(Headers);
  const h = headers as Headers;
  for (const [key, value] of Object.entries(expectedRecord)) {
    expect(h.get(key)).toBe(value);
  }
}

/**
 * 두 appFetch 인스턴스 간의 격리성 (독립된 기본 설정 및 인터셉터) 검증
 */
export function assertInstanceIsolation(
  instanceA: AppFetchInstance,
  instanceB: AppFetchInstance,
): void {
  expect(instanceA).not.toBe(instanceB);
  expect(typeof instanceA).toBe('function');
  expect(typeof instanceB).toBe('function');
}

/**
 * HttpError 인스턴스 및 상태 코드 검증
 */
export function assertHttpError(error: unknown, expectedStatus: number): void {
  expect(error).toBeInstanceOf(HttpError);
  const httpErr = error as HttpError;
  expect(httpErr.status).toBe(expectedStatus);
}

/**
 * 쿼리 순환참조 예외 발생 검증
 */
export async function assertCircularReferenceRejected(action: () => Promise<unknown>): Promise<void> {
  await expect(action()).rejects.toThrow('Circular reference detected in query parameters');
}
