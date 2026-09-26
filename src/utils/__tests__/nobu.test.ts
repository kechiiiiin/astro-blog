import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyShelf, fetchNowShelf, hanmotoUrl, isShelfEmpty, jstToday, windowStart, type NobuShelfBook } from '../nobu';

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
  afterEach(() => vi.restoreAllMocks());

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
