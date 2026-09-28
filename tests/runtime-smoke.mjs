/**
 * @file runtime-smoke.mjs
 * @description 빌드된 dist 번들(ESM/CJS)을 실제 HTTP 서버에 대고 실행하는 런타임 스모크 테스트입니다.
 * 빌드 도구(tsdown/vitest)가 지원하지 않는 구버전 Node(`engines`의 하한 18)에서 번들이
 * 실제로 동작하는지 CI에서 확인하기 위해 테스트 프레임워크 없이 node:assert만 사용합니다.
 *
 * 실행: node tests/runtime-smoke.mjs (사전에 npm run build 필요)
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esm = await import('../dist/app-fetch.mjs');
const cjs = require('../dist/app-fetch.cjs');

const token = Math.random().toString(36).slice(2);
let failFirst = true;
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/flaky') && failFirst) {
    failFirst = false;
    res.statusCode = 503;
    res.end();
    return;
  }
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      method: req.method,
      url: req.url,
      auth: req.headers.authorization ?? null,
    }),
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

try {
  for (const [label, { appFetch }] of [
    ['esm', esm],
    ['cjs', cjs],
  ]) {
    const api = appFetch.create({
      baseURL,
      headers: { Authorization: `Bearer ${token}` },
    });

    const patched = await api('/items', {
      method: 'patch',
      body: { id: token },
      query: { tags: ['a', 'b'] },
    }).getData();
    assert.equal(patched.method, 'PATCH', `${label}: method uppercased`);
    assert.equal(patched.url, '/items?tags%5B0%5D=a&tags%5B1%5D=b');
    assert.equal(patched.auth, `Bearer ${token}`);

    failFirst = true;
    const retried = await api('/flaky', { retry: 1 });
    assert.equal(retried.status, 200, `${label}: retried after 503`);

    await assert.rejects(
      api('http://evil.invalid/steal'),
      /does not match baseURL/,
      `${label}: cross-origin absolute URL blocked`,
    );

    console.log(`ok ${label} (node ${process.version})`);
  }
} finally {
  server.close();
}
