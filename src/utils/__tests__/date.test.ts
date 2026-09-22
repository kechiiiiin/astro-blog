import { describe, it, expect } from 'vitest';
import { formatDate, formatDisplayDate, getWeekdayJa } from '../date';

describe('formatDisplayDate（サイト共通の日付表示）', () => {
  it('YYYY-MM-DD (曜) の形で返す', () => {
    expect(formatDisplayDate(new Date('2026-09-21T00:00:00+09:00'))).toBe('2026-09-21 (月)');
    expect(formatDisplayDate(new Date('2025-07-02T00:00:00+09:00'))).toBe('2025-07-02 (水)');
  });

  it('JST で日付を解釈する（UTC 15:00 以降は翌日）', () => {
    expect(formatDisplayDate(new Date('2026-09-20T15:00:00Z'))).toBe('2026-09-21 (月)');
    expect(formatDisplayDate(new Date('2026-09-20T14:59:59Z'))).toBe('2026-09-20 (日)');
  });

  it('frontmatter の UTC 0時（pubDate: 2025-07-02T00:00:00Z）は JST 同日', () => {
    expect(formatDisplayDate(new Date('2025-07-02T00:00:00.000Z'))).toBe('2025-07-02 (水)');
  });
});

describe('getWeekdayJa', () => {
  it('年またぎ・うるう日でも正しい曜日', () => {
    expect(getWeekdayJa({ year: '2024', month: '02', day: '29' })).toBe('木');
    expect(getWeekdayJa({ year: '2027', month: '01', day: '01' })).toBe('金');
  });
});

describe('formatDate（平成ページ用の旧表示）', () => {
  it('YYYY/MM/DD のまま', () => {
    expect(formatDate(new Date('2026-09-21T00:00:00+09:00'))).toBe('2026/09/21');
  });
});
