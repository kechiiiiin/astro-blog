import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchLatestBook, hanmotoUrl, pickLatest, toNowBook, type NobuFeedItem } from '../nobu';
import { formatDisplayDate } from '../date';

const book = (title: string, extra: Partial<NobuFeedItem['books'][number]> = {}) => ({
  title,
  author: null,
  isbn13: null,
  cover_url: null,
  cover_kind: 'none',
  ...extra,
});

const item = (label: string, to_status: string | null, books: NobuFeedItem['books'], day = '2026-09-26'): NobuFeedItem => ({
  kind: to_status ? 'status' : 'read',
  label,
  to_status,
  day,
  at: `${day}T12:00:00.000Z`,
  books,
});

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

describe('pickLatest / toNowBook', () => {
  it('保留は選ばず、次に新しい出来事を返す', () => {
    const items = [item('保留にした', 'paused', [book('保留の本')]), item('読了', 'read', [book('読んだ本')], '2026-09-25')];
    expect(pickLatest(items)?.books[0]?.title).toBe('読んだ本');
  });

  it('本の無い出来事・空の一覧は選ばない', () => {
    expect(pickLatest([])).toBeNull();
    expect(pickLatest([item('読んだ', null, [])])).toBeNull();
    expect(pickLatest([item('保留にした', 'paused', [book('a')])])).toBeNull();
  });

  it('読んだ複数冊は「／」でつなぎ、表紙とリンクは先頭の1冊', () => {
    const b = toNowBook(
      item('読んだ', null, [
        book('一冊目', { author: 'A', isbn13: '9784000000001', cover_url: 'https://img.hanmoto.com/bd/img/9784000000001.jpg' }),
        book('二冊目', { author: 'B', isbn13: '9784000000002', cover_url: 'https://img.hanmoto.com/bd/img/9784000000002.jpg' }),
      ]),
    );
    expect(b.label).toBe('読んだ');
    expect(b.title).toBe('一冊目／二冊目');
    expect(b.author).toBe('A／B');
    expect(b.url).toBe('https://www.hanmoto.com/bd/isbn/9784000000001');
    expect(b.cover).toBe('https://img.hanmoto.com/bd/img/9784000000001.jpg');
  });

  it('表紙・ISBN・著者が無ければ null', () => {
    const b = toNowBook(item('買った', 'bought', [book('素の本')]));
    expect(b).toMatchObject({ label: '買った', title: '素の本', author: null, url: null, cover: null });
  });

  it('日付は JST の day（formatDisplayDate で同じ日になる）', () => {
    expect(formatDisplayDate(toNowBook(item('読了', 'read', [book('x')], '2026-09-26')).date)).toBe('2026-09-26 (土)');
  });
});

describe('fetchLatestBook（取り先・失敗時）', () => {
  afterEach(() => vi.restoreAllMocks());

  const dir = mkdtempSync(join(tmpdir(), 'nobu-'));
  const file = join(dir, 'feed.json');
  writeFileSync(
    file,
    JSON.stringify({
      handle: 'kechiiiiin',
      items: [item('保留にした', 'paused', [book('保留')]), item('読了', 'read', [book('本', { isbn13: '9784873118024' })])],
    }),
  );

  it('手元のファイル（パス・file://）を読める', async () => {
    expect((await fetchLatestBook(file))?.title).toBe('本');
    expect((await fetchLatestBook(pathToFileURL(file).href))?.url).toBe('https://www.hanmoto.com/bd/isbn/9784873118024');
  });

  it('取れない・壊れている・形が違うときは null（例外にしない）', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await fetchLatestBook(join(dir, 'nothing.json'))).toBeNull();
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{');
    expect(await fetchLatestBook(broken)).toBeNull();
    const wrong = join(dir, 'wrong.json');
    writeFileSync(wrong, '{"items":"x"}');
    expect(await fetchLatestBook(wrong)).toBeNull();
  });

  it('HTTP のエラーも null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 401 }));
    expect(await fetchLatestBook('https://nobu.example/u/x/feed.json')).toBeNull();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    expect(await fetchLatestBook('https://nobu.example/u/x/feed.json')).toBeNull();
  });
});
