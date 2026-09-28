/**
 * AGENTS.md 9번/10번 규칙 준수 테스트 결과 리포터 및 README 마크다운 생성기
 */

export interface TestExecutionRecord {
  category: string;
  testFile: string;
  totalTests: number;
  passedTests: number;
  status: 'Pass' | 'Fail';
  details: string;
}

export interface TestHistoryReportOptions {
  version: string;
  dateStr: string; // YYYY-MM-DD
  nodeVersion?: string;
  vitestVersion?: string;
  durationSeconds?: number;
  records: TestExecutionRecord[];
  failFixHistory?: string[];
}

/**
 * AGENTS.md 표준 준수 테스트 실행 기록 마크다운 블록 생성
 */
export function generateTestHistoryMarkdown(options: TestHistoryReportOptions): string {
  const total = options.records.reduce((acc, r) => acc + r.totalTests, 0);
  const passed = options.records.reduce((acc, r) => acc + r.passedTests, 0);
  const fileCount = options.records.length;
  const is100Percent = total === passed;
  const percentage = total > 0 ? ((passed / total) * 100).toFixed(1) : '100';

  const lines: string[] = [];

  lines.push('<details open>');
  lines.push(`<summary style="font-size: 1.1rem; font-weight: bold; cursor: pointer;">📋 ${options.version} (${options.dateStr}) - 통합 단위 테스트 및 하네스 매트릭스 검증 이력</summary>`);
  lines.push('');
  lines.push('<br />');
  lines.push('');
  lines.push(`- **테스트 결과**: **${fileCount}개 파일 / ${total}개 테스트 중 ${passed}개 성공 (${is100Percent ? '100% Pass' : `${percentage}%`})**`);
  lines.push(`- **테스트 환경**: Node.js ${options.nodeVersion ?? process.version} / Vitest ${options.vitestVersion ?? 'v4.1.10'} / Happy-DOM`);
  if (options.durationSeconds) {
    lines.push(`- **소요 시간**: ${options.durationSeconds.toFixed(2)}초`);
  }
  lines.push('');

  if (options.failFixHistory && options.failFixHistory.length > 0) {
    lines.push(`#### 🛠️ 금일(${options.dateStr}) 무작위 동적 가변 검증 및 수정 이력`);
    for (const item of options.failFixHistory) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  lines.push('| 환경 / 대상 구분 | 테스트 파일 | 실행 테스트 수 | 상태 | 검증 주요 내용 |');
  lines.push('| :--- | :--- | :---: | :---: | :--- |');

  for (const rec of options.records) {
    const statusIcon = rec.status === 'Pass' ? '✅ Pass' : '❌ Fail';
    lines.push(
      `| **${rec.category}** | \`${rec.testFile}\` | ${rec.passedTests} / ${rec.totalTests} | ${statusIcon} | ${rec.details} |`,
    );
  }

  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}
