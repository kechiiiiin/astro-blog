import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// トップ「いま」の BOOK 行。NoBu（読書記録・https://nobu.kechiiiiin.com）の公開 JSON をビルド時に取る。
// 取れなかったときは null を返し、トップは BOOK 行を出さないだけで落とさない（ポッドキャストと同じ方針）。
//
// 取り先は環境変数 NOBU_FEED_URL で差し替えられる。http(s) の URL のほか、手元の JSON ファイル
// （絶対／相対パス・file:// URL）も読める——NoBu をデプロイせずにローカルで見た目を確かめるため。

export const NOBU_FEED_URL_DEFAULT = 'https://nobu.kechiiiiin.com/u/kechiiiiin/feed.json';

export interface NobuFeedBook {
  title: string;
  author: string | null;
  isbn13: string | null;
  cover_url: string | null;
  cover_kind: string;
}

export interface NobuFeedItem {
  kind: 'status' | 'read';
  /** 読了／読み始めた／買った／保留にした／読んだ など */
  label: string;
  /** 状態の変化の行き先（読んだ日は null） */
  to_status: string | null;
  /** JST の日付 YYYY-MM-DD */
  day: string;
  at: string;
  books: NobuFeedBook[];
}

export interface NowBook {
  label: string;
  /** 複数冊（その日に読んだ本）は「／」でつなぐ */
  title: string;
  author: string | null;
  date: Date;
  /** 版元ドットコムの書籍ページ（先頭の1冊）。ISBN が無ければ null */
  url: string | null;
  /** 表紙（先頭の1冊）。無ければ null */
  cover: string | null;
}

/** 版元ドットコムの書籍ページ。ISBN13 として正しくなければ null */
export function hanmotoUrl(isbn13: string | null | undefined): string | null {
  if (!isbn13) return null;
  const digits = isbn13.replace(/[-\s]/g, '');
  if (!/^97[89]\d{10}$/.test(digits)) return null;
  return `https://www.hanmoto.com/bd/isbn/${digits}`;
}

/** 保留（paused）を除いた、いちばん新しい出来事（並びは NoBu 側で新しい順） */
export function pickLatest(items: NobuFeedItem[]): NobuFeedItem | null {
  return items.find((i) => i.to_status !== 'paused' && Array.isArray(i.books) && i.books.length > 0) ?? null;
}

export function toNowBook(item: NobuFeedItem): NowBook {
  const [first] = item.books;
  const authors = [...new Set(item.books.map((b) => b.author).filter((a): a is string => Boolean(a)))];
  const cover = first?.cover_url && /^https:\/\//.test(first.cover_url) ? first.cover_url : null;
  return {
    label: item.label,
    title: item.books.map((b) => b.title).join('／'),
    author: authors.length > 0 ? authors.join('／') : null,
    // day は JST の日付。formatDisplayDate が JST で読むので +09:00 で作る
    date: new Date(`${item.day}T00:00:00+09:00`),
    url: hanmotoUrl(first?.isbn13),
    cover,
  };
}

/** http(s) は fetch、それ以外（パス・file://）は手元のファイルとして読む */
async function loadFeed(src: string): Promise<unknown> {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  const path = src.startsWith('file://') ? fileURLToPath(src) : src;
  return JSON.parse(await readFile(path, 'utf8'));
}

function isFeed(v: unknown): v is { items: NobuFeedItem[] } {
  return typeof v === 'object' && v !== null && Array.isArray((v as { items?: unknown }).items);
}

/** 最新の読書の出来事（保留を除く）。取れない・形が違う・該当なしは null */
export async function fetchLatestBook(src: string = process.env.NOBU_FEED_URL || NOBU_FEED_URL_DEFAULT): Promise<NowBook | null> {
  try {
    const feed = await loadFeed(src);
    if (!isFeed(feed)) throw new Error('feed.json の形が違います');
    const item = pickLatest(feed.items);
    if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.day)) return null;
    return toNowBook(item);
  } catch (e) {
    console.warn('[nobu] 読書記録の取得に失敗したため「いま」の BOOK 行を出しません:', src, e instanceof Error ? e.message : e);
    return null;
  }
}
