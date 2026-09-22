export interface DateParts {
  year: string;
  month: string;
  day: string;
}

export function getDateParts(date: Date): DateParts {
  // JSTで日付を取得（ビルド環境のタイムゾーンに依存しないようにする）
  const jstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return {
    year: jstDate.getFullYear().toString(),
    month: (jstDate.getMonth() + 1).toString().padStart(2, '0'),
    day: jstDate.getDate().toString().padStart(2, '0'),
  };
}

export function getDiaryPath(date: Date): string {
  const { year, month, day } = getDateParts(date);
  return `/diary/${year}/${month}/${day}`;
}

export function matchesDateParts(
  date: Date,
  params: { year?: string; month?: string; day?: string }
): boolean {
  const parts = getDateParts(date);
  return parts.year === params.year &&
         parts.month === params.month &&
         parts.day === params.day;
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** JST の年月日から曜日（日〜土）を返す。ビルド環境のタイムゾーンに依存しない。 */
export function getWeekdayJa(parts: DateParts): string {
  const utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return WEEKDAYS_JA[new Date(utc).getUTCDay()]!;
}

/**
 * サイト全体の日付表示（2026-09-21 (月)）。表示用の日付はすべてこれを通す。
 * 日付は JST で解釈する。
 */
export function formatDisplayDate(date: Date): string {
  const parts = getDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day} (${getWeekdayJa(parts)})`;
}

/**
 * 旧来の YYYY/MM/DD 表示。平成ページ（/heisei・平成風の隠しページ）だけが使う。
 * 平成ページは「今のまま」残す方針（2026-09-22）なので、新しいページでは使わない。
 */
export function formatDate(date: Date): string {
  const { year, month, day } = getDateParts(date);
  return `${year}/${month}/${day}`;
}

export function isPublished(date: Date): boolean {
  // 現在のJST日付を取得（年/月/日のみ）
  const now = new Date();
  const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

  // 記事の日付をJSTとして解釈（年/月/日のみ）
  const jstArticleDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

  // 日付のみで比較（時刻は無視）
  jstNow.setHours(0, 0, 0, 0);
  jstArticleDate.setHours(0, 0, 0, 0);

  return jstArticleDate <= jstNow;
}
