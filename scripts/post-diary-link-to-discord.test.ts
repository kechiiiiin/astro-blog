import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  getDiaryPath,
  isPublished,
  composeText,
  POST_TEMPLATE,
  buildIntentUrl,
  buildDiaryDiscordPayload,
  excludeMovedDiaries,
} from './lib/diary-post.mjs';
import { getDiaryPath as getDiaryPathTs } from '../src/utils/date';

describe('parseFrontmatter', () => {
  it('シングルクォート付きのスカラーを読む（CMS が出す実際の形）', () => {
    const raw = [
      '---',
      'title: GitHubアカウントを移行した',
      "pubDate: '2026-07-29T12:47:00.000Z'",
      'draft: false',
      'tags: []',
      'description: 移行ってめんどー',
      '---',
      '本文',
    ].join('\n');

    expect(parseFrontmatter(raw)).toEqual({
      title: 'GitHubアカウントを移行した',
      pubDate: '2026-07-29T12:47:00.000Z',
      draft: false,
      description: '移行ってめんどー',
    });
  });

  it('ダブルクォート付き・裸のスカラーの両方を扱える', () => {
    const raw = `---\ntitle: "引用符「入り」のタイトル"\npubDate: 2026-01-02T03:04:05.000Z\ndraft: true\n---\n`;
    const fm = parseFrontmatter(raw);
    expect(fm.title).toBe('引用符「入り」のタイトル');
    expect(fm.pubDate).toBe('2026-01-02T03:04:05.000Z');
    expect(fm.draft).toBe(true);
  });

  it('リスト形式の tags やインデント行を無視する', () => {
    const raw = `---\ntitle: リストあり\ntags:\n  - foo\n  - bar\npubDate: '2026-03-04T00:00:00.000Z'\n---\n`;
    const fm = parseFrontmatter(raw);
    expect(fm.title).toBe('リストあり');
    expect(fm.pubDate).toBe('2026-03-04T00:00:00.000Z');
    expect(fm).not.toHaveProperty('tags');
  });

  it('draft 未指定なら draft は undefined（＝下書き扱いしない）', () => {
    const raw = `---\ntitle: t\npubDate: '2026-03-04T00:00:00.000Z'\n---\n`;
    expect(parseFrontmatter(raw).draft).toBeUndefined();
  });

  it('フロントマターが無ければ空オブジェクト', () => {
    expect(parseFrontmatter('本文だけ')).toEqual({});
  });
});

describe('getDiaryPath（src/utils/date.ts と一致し、末尾スラッシュ付きであること）', () => {
  const cases = [
    '2026-07-29T12:47:00.000Z', // JST 21:47 → 同日
    '2026-07-29T15:30:00.000Z', // JST 翌 00:30 → 日付が繰り上がる
    '2026-07-29T14:59:59.999Z', // JST 23:59 → まだ同日
    '2026-12-31T15:00:00.000Z', // 年またぎ
    '2026-01-01T00:00:00.000Z',
    '2026-02-28T16:00:00.000Z',
  ];

  for (const iso of cases) {
    it(`${iso}`, () => {
      const d = new Date(iso);
      expect(getDiaryPath(d)).toBe(getDiaryPathTs(d) + '/');
    });
  }

  it('UTC 日付境界をまたぐケースが期待どおり', () => {
    expect(getDiaryPath(new Date('2026-07-29T15:30:00.000Z'))).toBe('/diary/2026/07/30/');
    expect(getDiaryPath(new Date('2026-12-31T15:00:00.000Z'))).toBe('/diary/2027/01/01/');
  });
});

describe('isPublished', () => {
  const now = new Date('2026-07-29T12:00:00.000Z'); // JST 2026-07-29 21:00

  it('当日は公開扱い', () => {
    expect(isPublished(new Date('2026-07-29T23:00:00.000Z'), now)).toBe(false); // JST 07-30
    expect(isPublished(new Date('2026-07-29T00:00:00.000Z'), now)).toBe(true);
  });

  it('過去は公開・未来は未公開', () => {
    expect(isPublished(new Date('2026-07-01T00:00:00.000Z'), now)).toBe(true);
    expect(isPublished(new Date('2026-08-01T00:00:00.000Z'), now)).toBe(false);
  });
});

describe('composeText', () => {
  it('テンプレートどおりに組み立てる（タイトルは載せない）', () => {
    const text = composeText('GitHubアカウントを移行した', 'https://www.kechiiiiin.com/diary/2026/07/29/');
    expect(text).toBe('日記\nhttps://www.kechiiiiin.com/diary/2026/07/29/');
    expect(text).toBe(
      POST_TEMPLATE('GitHubアカウントを移行した', 'https://www.kechiiiiin.com/diary/2026/07/29/')
    );
  });

  it('タイトルが長くても本文は 280 に収まる', () => {
    const url = 'https://www.kechiiiiin.com/diary/2026/07/29/';
    const text = composeText('あ'.repeat(500), url);
    const weighted = [...text].length - [...url].length + 23;
    expect(weighted).toBeLessThanOrEqual(280);
  });
});

describe('buildIntentUrl（X の投稿画面リンク）', () => {
  it('composeText と同じ本文を x.com/intent/post の text= に載せる', () => {
    const title = 'GitHubアカウントを移行した';
    const url = 'https://www.kechiiiiin.com/diary/2026/07/29/';
    const intentUrl = buildIntentUrl(title, url);
    expect(intentUrl.startsWith('https://x.com/intent/post?text=')).toBe(true);
    const text = decodeURIComponent(intentUrl.slice('https://x.com/intent/post?text='.length));
    expect(text).toBe(composeText(title, url));
    expect(text).toBe('日記\nhttps://www.kechiiiiin.com/diary/2026/07/29/');
  });

  it('引用符・改行を含むタイトルでも正しくエンコードされる（デコードで元の本文に戻る）', () => {
    const title = '「移行」めんどー\nすぎる';
    const url = 'https://www.kechiiiiin.com/diary/2026/09/26/';
    const intentUrl = buildIntentUrl(title, url);
    const text = decodeURIComponent(intentUrl.slice('https://x.com/intent/post?text='.length));
    expect(text).toBe(composeText(title, url));
  });
});

describe('buildDiaryDiscordPayload（Discord へ送る embed）', () => {
  it('title に intent リンク、description にタイトルと URL を載せる', () => {
    const title = '53km歩いた';
    const url = 'https://www.kechiiiiin.com/diary/2026/09/26/';
    const payload = buildDiaryDiscordPayload(title, url);
    expect(payload.embeds).toHaveLength(1);
    const embed = payload.embeds[0];
    expect(embed.title).toBe('📝 日記を X に投稿する');
    expect(embed.url).toBe(buildIntentUrl(title, url));
    expect(embed.description).toBe(`「${title}」\n開いて「ポスト」を押すだけです\n${url}`);
  });

  it('引用符・日本語を含むタイトルでも壊れずに JSON化できる', () => {
    const title = '「引用符」入りのタイトル';
    const url = 'https://www.kechiiiiin.com/diary/2026/01/02/';
    const payload = buildDiaryDiscordPayload(title, url);
    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json);
    expect(parsed.embeds[0].description).toContain(title);
  });
});

describe('excludeMovedDiaries（日付を変えただけの日記を X に投稿しない）', () => {
  const D = (d: string) => `src/content/diary/${d}.md`;
  const base = new Set([D('2026-09-18'), D('2026-09-01')]);
  const make = (commits: Record<string, string | null | undefined>, deleted: Record<string, string[] | null>) => ({
    addingCommit: (p: string) => commits[p],
    deletedDiariesIn: (sha: string) => (sha in deleted ? deleted[sha]! : []),
    existedAtBase: (p: string) => base.has(p),
  });

  it('同じ commit で公開済みの日記を消して足したもの（移動）は投稿しない', () => {
    const r = excludeMovedDiaries([D('2026-09-17')], make({ [D('2026-09-17')]: 'm1' }, { m1: [D('2026-09-18')] }));
    expect(r).toEqual({ post: [], moved: [{ path: D('2026-09-17'), from: D('2026-09-18') }], unknown: [] });
  });

  it('何も消していない追加（新しい日記）は投稿する', () => {
    const r = excludeMovedDiaries([D('2026-09-19')], make({ [D('2026-09-19')]: 'c1' }, { c1: [] }));
    expect(r.post).toEqual([D('2026-09-19')]);
  });

  it('まだデプロイされていない日記を移したもの（未投稿）は投稿する', () => {
    const r = excludeMovedDiaries([D('2026-09-15')], make({ [D('2026-09-15')]: 'm2' }, { m2: [D('2026-09-16')] }));
    expect(r.post).toEqual([D('2026-09-15')]);
  });

  it('デプロイ前に2回移したもの（18→17→16）も起点の 18 まで辿って投稿しない', () => {
    const r = excludeMovedDiaries(
      [D('2026-09-16')],
      make({ [D('2026-09-16')]: 'm2', [D('2026-09-17')]: 'm1' }, { m2: [D('2026-09-17')], m1: [D('2026-09-18')] })
    );
    expect(r).toEqual({ post: [], moved: [{ path: D('2026-09-16'), from: D('2026-09-18') }], unknown: [] });
  });

  it('範囲内で新しく作ってから2回移したもの（未投稿）は投稿する', () => {
    const r = excludeMovedDiaries(
      [D('2026-09-14')],
      make(
        { [D('2026-09-14')]: 'm2', [D('2026-09-15')]: 'm1', [D('2026-09-16')]: 'c1' },
        { m2: [D('2026-09-15')], m1: [D('2026-09-16')], c1: [] }
      )
    );
    expect(r.post).toEqual([D('2026-09-14')]);
  });

  it('git が読めなければ投稿しない（二重投稿を避ける）', () => {
    const r = excludeMovedDiaries(
      [D('2026-09-19'), D('2026-09-20')],
      make({ [D('2026-09-19')]: null, [D('2026-09-20')]: 'c2' }, { c2: null })
    );
    expect(r).toEqual({ post: [], moved: [], unknown: [D('2026-09-19'), D('2026-09-20')] });
  });
});
