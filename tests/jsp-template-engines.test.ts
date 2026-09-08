/**
 * @vitest-environment happy-dom
 */
import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getData, appFetch } from '../src';

describe('JSP & Template Engines Dual-Mode Environment (JSP, Handlebars, EJS, Thymeleaf)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('JSP CSR Mode / Script Tag (app-fetch.min.js): <script> 태그 로드 후 window.appFetch 동적 AJAX 통신 검증', async () => {
    const randomUser = `jspUser_${Math.random().toString(36).substring(2, 7)}`;
    const mockData = { jspUser: randomUser, role: 'ADMIN' };

    // JSP에서 <script src="app-fetch.min.js"></script> 로드하는 동적 스크립트 실행을 에뮬레이트
    const scriptCode = fs.readFileSync(
      path.resolve(__dirname, '../dist/app-fetch.min.js'),
      'utf-8',
    );
    window.eval(scriptCode);

    const windowAppFetch = (window as unknown as Record<string, unknown>)
      .appFetch as { appFetch: typeof appFetch; getData: typeof getData };

    expect(windowAppFetch).toBeDefined();
    expect(typeof windowAppFetch.appFetch).toBe('function');
    expect(typeof windowAppFetch.getData).toBe('function');

    vi.spyOn(window, 'fetch').mockImplementation(async (url) => {
      expect(url.toString()).toContain(`/jsp/api/data?user=${randomUser}`);
      return new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await windowAppFetch.appFetch('/jsp/api/data', { query: { user: randomUser } });
    const data = await windowAppFetch.getData(res);

    expect(res.status).toBe(200);
    expect(data).toEqual(mockData);
  });

  it('Server Template Engines SSR Mode (EJS/Handlebars/Thymeleaf): SSR 사전 템플릿 바인딩 데이터 페칭 검증', async () => {
    const randomTitle = `Template Render Title ${Math.random().toString(36).substring(2, 6)}`;
    const templateData = { title: randomTitle, items: ['A', 'B'] };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify(templateData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const response = await appFetch('http://localhost:8080/api/template-data');
    const parsed = await getData<typeof templateData>(response);

    expect(parsed).toEqual(templateData);
  });
});
