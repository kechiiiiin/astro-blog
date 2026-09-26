import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  classifyShelf,
  diaryBooksForDay,
  fetchDiaryBooks,
  fetchNowShelf,
  hanmotoUrl,
  isShelfEmpty,
  jstToday,
  resetNobuFeedCache,
  windowStart,
  type NobuShelfBook,
} from '../nobu';

const book = (title: string, extra: Partial<NobuShelfBook> = {}): NobuShelfBook => ({
  title,
  author: null,
  isbn13: null,
  cover_url: null,
  cover_kind: 'none',
  status: 'bought',
  started_on: null,
  last_read_on: null,
  finished_on: null,
  bought_on: null,
  ...extra,
});

const TODAY = '2026-09-26';
const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe('hanmotoUrl（版元ドットコムの書籍ページ）', () => {
  it('ISBN13 から組み立てる', () => {
    expect(hanmotoUrl('9784873118024')).toBe('https://www.hanmoto.com/bd/isbn/9784873118024');
    expect(hanmotoUrl('979-10-0000000-0')).toBe('https://www.hanmoto.com/bd/isbn/9791000000000');
  });

  it('ISBN が無い・形が違うときは null', () => {
    expect(hanmotoUrl(null)).toBeNull();
    expect(hanmotoUrl(undefined)).toBeNull();
    expect(hanmotoUrl('')).toBeNull();
    expect(hanmotoUrl('4873118026')).toBeNull();
    expect(hanmotoUrl('97848731180X4')).toBeNull();
    expect(hanmotoUrl('1234567890123')).toBeNull();
  });
});

describe('窓（今日を含む7日間）', () => {
  it('初日は6日前', () => {
    expect(windowStart('2026-09-26')).toBe('2026-09-20');
    expect(windowStart('2026-03-01')).toBe('2026-02-23');
  });

  it('JST の今日（UTC 15:00 以降は翌日）', () => {
    expect(jstToday(new Date('2026-09-25T15:00:00Z'))).toBe('2026-09-26');
    expect(jstToday(new Date('2026-09-25T14:59:59Z'))).toBe('2026-09-25');
  });
});

describe('classifyShelf（読んでいる／最近読み終えた／最近買った）', () => {
  it('読んでいる＝読書中で、1週間以内に読み始めたか読んだ日がある本', () => {
    const s = classifyShelf(
      [
        book('今週読み始めた', { status: 'reading', started_on: '2026-09-22' }),
        book('昔から読んでて今週も読んだ', { status: 'reading', started_on: '2026-01-09', last_read_on: '2026-09-23' }),
        book('読書中だが今週は触っていない', { status: 'reading', started_on: '2026-09-01', last_read_on: '2026-09-19' }),
      ],
      TODAY,
    );
    expect(titles(s.reading)).toEqual(['昔から読んでて今週も読んだ', '今週読み始めた']);
    expect(s.reading[0]!.dateText).toBe('2026-01-09 (金)〜');
    expect(s.reading[1]!.dateText).toBe('2026-09-22 (火)〜');
  });

  it('窓の端: 7日前（6日前まで入る）', () => {
    const s = classifyShelf(
      [book('6日前', { status: 'read', finished_on: '2026-09-20' }), book('7日前', { status: 'read', finished_on: '2026-09-19' })],
      TODAY,
    );
    expect(titles(s.finished)).toEqual(['6日前']);
  });

  it('読み終えた・買ったは新しい順、日付は読了日・買った日', () => {
    const s = classifyShelf(
      [
        book('古い読了', { status: 'read', finished_on: '2026-09-22' }),
        book('新しい読了', { status: 'read', finished_on: '2026-09-26' }),
        book('買った', { status: 'bought', bought_on: '2026-09-23' }),
        book('先月買った', { status: 'bought', bought_on: '2026-08-31' }),
      ],
      TODAY,
    );
    expect(titles(s.finished)).toEqual(['新しい読了', '古い読了']);
    expect(s.finished[0]!.dateText).toBe('2026-09-26 (土)');
    expect(titles(s.bought)).toEqual(['買った']);
    expect(s.bought[0]!.dateText).toBe('2026-09-23 (水)');
  });

  it('同じ本は上の区分を優先（買った→読み始めた本は「読んでいる」だけ・買って読み終えた本は「読み終えた」だけ）', () => {
    const s = classifyShelf(
      [
        book('買って読み始めた', { status: 'reading', bought_on: '2026-09-21', started_on: '2026-09-22' }),
        book('買って読み終えた', { status: 'read', bought_on: '2026-09-21', finished_on: '2026-09-25' }),
      ],
      TODAY,
    );
    expect(titles(s.reading)).toEqual(['買って読み始めた']);
    expect(titles(s.finished)).toEqual(['買って読み終えた']);
    expect(s.bought).toEqual([]);
  });

  it('保留・気になるは出さない', () => {
    const s = classifyShelf(
      [
        book('保留', { status: 'paused', started_on: '2026-09-22', bought_on: '2026-09-22' }),
        book('気になる', { status: 'want', bought_on: '2026-09-22' }),
      ],
      TODAY,
    );
    expect(isShelfEmpty(s)).toBe(true);
  });

  it('リンク・表紙・著者（無ければ null）', () => {
    const s = classifyShelf(
      [
        book('全部ある', { status: 'read', finished_on: '2026-09-26', author: '著者', isbn13: '9784873118024', cover_url: 'https://thumbnail.image.rakuten.co.jp/x.jpg' }),
        book('何もない', { status: 'read', finished_on: '2026-09-25' }),
      ],
      TODAY,
    );
    expect(s.finished[0]).toEqual({
      title: '全部ある',
      author: '著者',
      dateText: '2026-09-26 (土)',
      url: 'https://www.hanmoto.com/bd/isbn/9784873118024',
      cover: 'https://thumbnail.image.rakuten.co.jp/x.jpg',
    });
    expect(s.finished[1]).toMatchObject({ author: null, url: null, cover: null });
  });

  it('読み始めた日が不明なら日付を出さない', () => {
    const s = classifyShelf([book('不明', { status: 'reading', last_read_on: '2026-09-26' })], TODAY);
    expect(s.reading[0]!.dateText).toBeNull();
  });
});

describe('fetchNowShelf（取り先・失敗時）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetNobuFeedCache();
  });

  const dir = mkdtempSync(join(tmpdir(), 'nobu-'));
  const file = join(dir, 'feed.json');
  writeFileSync(
    file,
    JSON.stringify({ handle: 'kechiiiiin', items: [], shelf: [book('本', { status: 'read', finished_on: TODAY, isbn13: '9784873118024' })] }),
  );

  it('手元のファイル（パス・file://）を読める', async () => {
    expect(titles((await fetchNowShelf(file, TODAY))!.finished)).toEqual(['本']);
    expect((await fetchNowShelf(pathToFileURL(file).href, TODAY))!.finished[0]!.url).toBe('https://www.hanmoto.com/bd/isbn/9784873118024');
    // 窓の外の日を今日とみなすと空（null ではない＝取れてはいる）
    const later = await fetchNowShelf(file, '2026-12-31');
    expect(later && isShelfEmpty(later)).toBe(true);
  });

  it('取れない・壊れている・shelf が無いときは null（例外にしない）', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await fetchNowShelf(join(dir, 'nothing.json'), TODAY)).toBeNull();
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{');
    expect(await fetchNowShelf(broken, TODAY)).toBeNull();
    const old = join(dir, 'old.json');
    writeFileSync(old, '{"items":[]}');
    expect(await fetchNowShelf(old, TODAY)).toBeNull();
  });

  it('HTTP のエラーも null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 401 }));
    expect(await fetchNowShelf('https://nobu.example/u/x/feed.json', TODAY)).toBeNull();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    expect(await fetchNowShelf('https://nobu.example/u/x/feed.json', TODAY)).toBeNull();
  });
});

// ---------------------------------------------------------------- 日記「この日に読んだ本」

const RK = 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/x/';
const feedWithDays = {
  handle: 'kechiiiiin',
  items: [],
  shelf: [],
  reading_days: [
    {
      day: '2026-09-25',
      books: [
        { title: '福岡市の問題解決', author: '高島宗一郎', isbn13: '9784478124130', cover_url: `${RK}a.jpg`, cover_kind: 'rakuten' },
        { title: 'エラスティックリーダーシップ', author: 'Roy Osherove/島田 浩二', isbn13: '9784873118024', cover_url: `${RK}b.jpg`, cover_kind: 'rakuten' },
        // 同じ日に同じ本がもう一度（NoBu 側は UNIQUE だが念のため）
        { title: '福岡市の問題解決', author: '高島宗一郎', isbn13: '9784478124130', cover_url: `${RK}a.jpg`, cover_kind: 'rakuten' },
      ],
    },
    {
      day: '2026-09-20',
      books: [
        { title: 'ISBN無し', author: null, isbn13: null, cover_url: `${RK}c.jpg`, cover_kind: 'rakuten' },
        { title: 'ISBN無し', author: null, isbn13: null, cover_url: `${RK}c.jpg`, cover_kind: 'rakuten' },
        { title: '表紙無し', author: '著者', isbn13: '9784480077301', cover_url: null, cover_kind: 'none' },
        { title: '変な表紙', author: '', isbn13: 'abc', cover_url: 'javascript:alert(1)', cover_kind: 'rakuten' },
      ],
    },
  ],
};

describe('diaryBooksForDay（日付 → その日に読んだ本）', () => {
  it('その日の本を記録順に、表紙と版元ドットコムのリンクつきで', () => {
    expect(diaryBooksForDay(feedWithDays, '2026-09-25')).toEqual([
      { title: '福岡市の問題解決', author: '高島宗一郎', url: 'https://www.hanmoto.com/bd/isbn/9784478124130', cover: `${RK}a.jpg` },
      { title: 'エラスティックリーダーシップ', author: 'Roy Osherove/島田 浩二', url: 'https://www.hanmoto.com/bd/isbn/9784873118024', cover: `${RK}b.jpg` },
    ]);
  });

  it('同じ日の同じ本は1回。ISBN 無し→リンク無し、表紙無し・https 以外の表紙→null、空の著者→null', () => {
    expect(diaryBooksForDay(feedWithDays, '2026-09-20')).toEqual([
      { title: 'ISBN無し', author: null, url: null, cover: `${RK}c.jpg` },
      { title: '表紙無し', author: '著者', url: 'https://www.hanmoto.com/bd/isbn/9784480077301', cover: null },
      { title: '変な表紙', author: null, url: null, cover: null },
    ]);
  });

  it('本の無い日は空', () => {
    expect(diaryBooksForDay(feedWithDays, '2026-09-24')).toEqual([]);
  });

  it('古い feed.json（reading_days が無い）・形が違うものは空（落ちない）', () => {
    expect(diaryBooksForDay({ handle: 'k', items: [], shelf: [] }, '2026-09-25')).toEqual([]);
    expect(diaryBooksForDay(null, '2026-09-25')).toEqual([]);
    expect(diaryBooksForDay('x', '2026-09-25')).toEqual([]);
    expect(diaryBooksForDay({ reading_days: 'x' }, '2026-09-25')).toEqual([]);
    expect(diaryBooksForDay({ reading_days: [null, { day: '2026-09-25' }, { day: '2026-09-25', books: [null, { title: 1 }] }] }, '2026-09-25')).toEqual([]);
  });
});

describe('fetchDiaryBooks（1ビルドで取得は1回・失敗時は空）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetNobuFeedCache();
  });

  it('何ページぶん呼んでも NoBu への取得は1回（トップの fetchNowShelf とも共有）', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(feedWithDays), { status: 200 }));
    const src = 'https://nobu.example/u/k/feed.json';
    const results = await Promise.all(['2026-09-25', '2026-09-24', '2026-09-20'].map((d) => fetchDiaryBooks(d, src)));
    expect(results.map((r) => r.length)).toEqual([2, 0, 3]);
    await fetchDiaryBooks('2026-09-25', src);
    expect(await fetchNowShelf(src, '2026-09-26')).not.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('取れないときは空で、警告は1回だけ（取り直さない）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 403 }));
    const src = 'https://nobu.example/u/k/feed.json';
    expect(await fetchDiaryBooks('2026-09-25', src)).toEqual([]);
    expect(await fetchDiaryBooks('2026-09-24', src)).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('古い feed.json（reading_days が無い）でも空で落ちない', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ handle: 'k', items: [], shelf: [] }), { status: 200 }));
    expect(await fetchDiaryBooks('2026-09-25', 'https://nobu.example/u/old/feed.json')).toEqual([]);
  });
});
