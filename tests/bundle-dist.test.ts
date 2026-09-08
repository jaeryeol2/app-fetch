import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
// @ts-expect-error dist mjs bundle does not have declaration file in same directory
import * as esmBundle from '../dist/app-fetch.mjs';

const require = createRequire(import.meta.url);

describe('Bundle Output Verification (app-fetch.mjs & app-fetch.cjs)', () => {
  it('ESM 번들 (dist/app-fetch.mjs) 내보내기 및 실행 정상 검증', async () => {
    expect(esmBundle.appFetch).toBeDefined();
    expect(typeof esmBundle.appFetch).toBe('function');
    expect(typeof esmBundle.appFetch.create).toBe('function');
    expect(typeof esmBundle.getData).toBe('function');
    expect(typeof esmBundle.HttpError).toBe('function');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const res = await esmBundle.appFetch('https://esm-bundle-test.com/api');
    expect(res.status).toBe(200);
    vi.restoreAllMocks();
  });

  it('CJS 번들 (dist/app-fetch.cjs) require() 내보내기 및 실행 정상 검증', async () => {
    const cjsBundle = require('../dist/app-fetch.cjs') as typeof esmBundle;

    expect(cjsBundle.appFetch).toBeDefined();
    expect(typeof cjsBundle.appFetch).toBe('function');
    expect(typeof cjsBundle.appFetch.create).toBe('function');
    expect(typeof cjsBundle.getData).toBe('function');
    expect(typeof cjsBundle.HttpError).toBe('function');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ ok: true, via: 'cjs' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await cjsBundle.appFetch('https://cjs-bundle-test.com/api');
    expect(res.status).toBe(200);
    const data = await res.getData();
    expect(data).toEqual({ ok: true, via: 'cjs' });
    vi.restoreAllMocks();
  });
});
