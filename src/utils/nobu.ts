import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { formatDisplayDate, getDateParts } from './date';

// トップ「いま」の「本」。NoBu（読書記録・https://nobu.kechiiiiin.com）の公開 JSON をビルド時に取り、
// 読んでいる／最近読み終えた／最近買った の3区分に分ける（どれも直近1週間）。
// 取れなかったときは null を返し、トップは「本」を出さないだけで落とさない（ポッドキャストと同じ方針）。
//
// 取り先は環境変数 NOBU_FEED_URL で差し替えられる。http(s) の URL のほか、手元の JSON ファイル
// （絶対／相対パス・file:// URL）も読める——NoBu をデプロイせずにローカルで見た目を確かめるため。
// 「今日」は既定でビルドした日（JST）。NOBU_TODAY=YYYY-MM-DD で固定できる（E2E・確認用）。

// 既定は workers.dev から取る。nobu.kechiiiiin.com だと GitHub Actions からは Cloudflare の
// ボット対策（cf-mitigated=challenge）で 403 になるため（2026-09-26）。NoBu 側は workers.dev では
// フィード2本以外を 404 にしている
export const NOBU_FEED_URL_DEFAULT = 'https://nobu.kechiiiiin.workers.dev/u/kechiiiiin/feed.json';

/** 1週間＝今日（JST）を含む7日間 */
export const SHELF_WINDOW_DAYS = 7;

/** feed.json の shelf の1冊（NoBu 側で is_public = 1・読んでる／読了／買った・直近31日に動きがあるものに絞ってある） */
export interface NobuShelfBook {
  title: string;
  author: string | null;
  isbn13: string | null;
  cover_url: string | null;
  cover_kind: string;
  /** want / bought / reading / paused / read */
  status: string;
  /** 読書中の回の読み始めた日（JST YYYY-MM-DD） */
  started_on: string | null;
  /** 最後に「読んだ日」 */
  last_read_on: string | null;
  /** 最新の読了日 */
  finished_on: string | null;
  /** 最後に「買った」にした日 */
  bought_on: string | null;
}

export interface NowBookRow {
  title: string;
  author: string | null;
  /** 表示する日付（読んでいる＝「読み始めた日〜」、読み終えた＝読了日、買った＝買った日）。不明なら null */
  dateText: string | null;
  /** 版元ドットコムの書籍ページ。ISBN が無ければ null（行をリンクにしない） */
  url: string | null;
  /** 表紙。無ければ null（画像を出さない） */
  cover: string | null;
}

export interface NowShelf {
  reading: NowBookRow[];
  finished: NowBookRow[];
  bought: NowBookRow[];
}

/** 版元ドットコムの書籍ページ。ISBN13 として正しくなければ null */
export function hanmotoUrl(isbn13: string | null | undefined): string | null {
  if (!isbn13) return null;
  const digits = isbn13.replace(/[-\s]/g, '');
  if (!/^97[89]\d{10}$/.test(digits)) return null;
  return `https://www.hanmoto.com/bd/isbn/${digits}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** JST の今日（YYYY-MM-DD） */
export function jstToday(now: Date = new Date()): string {
  const { year, month, day } = getDateParts(now);
  return `${year}-${month}-${day}`;
}

/** today を含む days 日間の初日 */
export function windowStart(today: string, days = SHELF_WINDOW_DAYS): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
}

const displayDay = (day: string) => formatDisplayDate(new Date(`${day}T00:00:00+09:00`));

function toRow(b: NobuShelfBook, dateText: string | null): NowBookRow {
  return {
    title: b.title,
    author: b.author || null,
    dateText,
    url: hanmotoUrl(b.isbn13),
    cover: b.cover_url && /^https:\/\//.test(b.cover_url) ? b.cover_url : null,
  };
}

const newest = (...days: (string | null)[]) => days.filter((d): d is string => Boolean(d)).sort().at(-1) ?? '';

/**
 * 3区分に分ける。どれも today を含む7日間。同じ本は上の区分を優先（読んでいる > 読み終えた > 買った）。
 * 保留（paused）・気になる（want）は出さない。並びは各区分とも新しい順。
 */
export function classifyShelf(shelf: NobuShelfBook[], today: string, days = SHELF_WINDOW_DAYS): NowShelf {
  const since = windowStart(today, days);
  const inWindow = (d: string | null): d is string => Boolean(d && DAY.test(d) && d >= since && d <= today);
  const used = new Set<NobuShelfBook>();
  const visible = shelf.filter((b) => b.status !== 'paused' && b.status !== 'want');

  const reading = visible
    .filter((b) => b.status === 'reading' && (inWindow(b.started_on) || inWindow(b.last_read_on)))
    .sort((a, b) => newest(b.started_on, b.last_read_on).localeCompare(newest(a.started_on, a.last_read_on)));
  reading.forEach((b) => used.add(b));

  const finished = visible
    .filter((b) => !used.has(b) && inWindow(b.finished_on))
    .sort((a, b) => b.finished_on!.localeCompare(a.finished_on!));
  finished.forEach((b) => used.add(b));

  const bought = visible
    .filter((b) => !used.has(b) && inWindow(b.bought_on))
    .sort((a, b) => b.bought_on!.localeCompare(a.bought_on!));

  return {
    reading: reading.map((b) => toRow(b, b.started_on && DAY.test(b.started_on) ? `${displayDay(b.started_on)}〜` : null)),
    finished: finished.map((b) => toRow(b, displayDay(b.finished_on!))),
    bought: bought.map((b) => toRow(b, displayDay(b.bought_on!))),
  };
}

/** 3区分とも空か */
export function isShelfEmpty(s: NowShelf): boolean {
  return s.reading.length === 0 && s.finished.length === 0 && s.bought.length === 0;
}

/**
 * 失敗した応答の手がかり（ビルドログに出す）。
 * GitHub Actions からだけ 403 になる件（2026-09-26）で、Cloudflare のボット対策か
 * Access か Worker 自身かを見分けるため: cf-mitigated が challenge ならボット対策、
 * 本文の <title> が Cloudflare の画面か NoBu の文言かでも分かる
 */
async function describeFailure(res: Response): Promise<string> {
  const h = (k: string) => res.headers.get(k) ?? '-';
  const body = await res.text().catch(() => '');
  const title = body.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  const snippet = title ?? body.replace(/\s+/g, ' ').slice(0, 120);
  return `server=${h('server')} cf-mitigated=${h('cf-mitigated')} cf-ray=${h('cf-ray')} content-type=${h('content-type')} body=${JSON.stringify(snippet)}`;
}

/** http(s) は fetch、それ以外（パス・file://）は手元のファイルとして読む */
async function loadFeedUncached(src: string): Promise<unknown> {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await describeFailure(res)}`);
    return res.json();
  }
  const path = src.startsWith('file://') ? fileURLToPath(src) : src;
  return JSON.parse(await readFile(path, 'utf8'));
}

// 1ビルドで NoBu への取得は1回だけ（取り先ごと）。日記ページは200件以上あり、トップとも同じ feed.json を使う。
// 失敗も覚えておく（ページごとに取り直して NoBu を叩き続けない・失敗のログも1回で済ませる）
const feedCache = new Map<string, Promise<unknown>>();
/** 日記の取得失敗を警告した取り先（200ページぶん同じ警告を出さない） */
const diaryWarned = new Set<string>();

function loadFeed(src: string): Promise<unknown> {
  let p = feedCache.get(src);
  if (!p) {
    p = loadFeedUncached(src);
    // 誰も待っていない間に失敗しても unhandled rejection にしない（待つ側には失敗がそのまま届く）
    p.catch(() => {});
    feedCache.set(src, p);
  }
  return p;
}

/** テスト用: 取得のキャッシュを空にする */
export function resetNobuFeedCache(): void {
  feedCache.clear();
  diaryWarned.clear();
}

function hasShelf(v: unknown): v is { shelf: NobuShelfBook[] } {
  return typeof v === 'object' && v !== null && Array.isArray((v as { shelf?: unknown }).shelf);
}

/** トップの「本」。取れない・形が違うときは null（呼び出し側は「本」を出さない） */
export async function fetchNowShelf(
  src: string = process.env.NOBU_FEED_URL || NOBU_FEED_URL_DEFAULT,
  today: string = process.env.NOBU_TODAY && DAY.test(process.env.NOBU_TODAY) ? process.env.NOBU_TODAY : jstToday(),
): Promise<NowShelf | null> {
  try {
    const feed = await loadFeed(src);
    if (!hasShelf(feed)) throw new Error('feed.json に shelf がありません');
    return classifyShelf(feed.shelf, today);
  } catch (e) {
    console.warn('[nobu] 読書記録の取得に失敗したため「いま」の「本」を出しません:', src, e instanceof Error ? e.message : e);
    return null;
  }
}

// ---------------------------------------------------------------- 日記「この日に読んだ本」
//
// 各日記ページの本文の直後に、その日に NoBu で「読んだ日」を記録した本を並べる（読了・読み始めた・買ったは載せない）。
// 元は feed.json の reading_days（読んだ日の全履歴・NoBu 側で is_public = 1 に絞ってある）。
// 古い feed.json（reading_days が無い）や取得失敗のときは空＝本欄を出さないだけで、ビルドは落とさない。

export interface DiaryBookRow {
  title: string;
  author: string | null;
  /** 版元ドットコムの書籍ページ。ISBN が無ければ null（行をリンクにしない） */
  url: string | null;
  /** 表紙。無ければ null（画像を出さない） */
  cover: string | null;
}

interface RawBook {
  title?: unknown;
  author?: unknown;
  isbn13?: unknown;
  cover_url?: unknown;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/**
 * feed.json から、その日（JST YYYY-MM-DD）に読んだ本の行を並べる。純粋関数。
 * 並びは feed.json の順（NoBu の記録順）。同じ日に同じ本が重なったら1回（ISBN、無ければ書名＋著者で見る）。
 * reading_days が無い・形が違うときは空。
 */
export function diaryBooksForDay(feed: unknown, day: string): DiaryBookRow[] {
  if (typeof feed !== 'object' || feed === null) return [];
  const days = (feed as { reading_days?: unknown }).reading_days;
  if (!Array.isArray(days)) return [];
  const out: DiaryBookRow[] = [];
  const seen = new Set<string>();
  for (const d of days) {
    if (typeof d !== 'object' || d === null || (d as { day?: unknown }).day !== day) continue;
    const books = (d as { books?: unknown }).books;
    if (!Array.isArray(books)) continue;
    for (const raw of books as RawBook[]) {
      const title = str(raw?.title);
      if (!title) continue;
      const author = str(raw.author);
      const isbn = str(raw.isbn13);
      const key = isbn ? `isbn:${isbn.replace(/[-\s]/g, '')}` : `t:${title}\u0000${author ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cover = str(raw.cover_url);
      out.push({ title, author, url: hanmotoUrl(isbn), cover: cover && /^https:\/\//.test(cover) ? cover : null });
    }
  }
  return out;
}


/** 日記ページ用。その日に読んだ本（無ければ・取れなければ空）。取得はビルドで1回だけ */
export async function fetchDiaryBooks(
  day: string,
  src: string = process.env.NOBU_FEED_URL || NOBU_FEED_URL_DEFAULT,
): Promise<DiaryBookRow[]> {
  try {
    return diaryBooksForDay(await loadFeed(src), day);
  } catch (e) {
    if (!diaryWarned.has(src)) {
      diaryWarned.add(src);
      console.warn('[nobu] 読書記録の取得に失敗したため日記の「この日に読んだ本」を出しません:', src, e instanceof Error ? e.message : e);
    }
    return [];
  }
}
