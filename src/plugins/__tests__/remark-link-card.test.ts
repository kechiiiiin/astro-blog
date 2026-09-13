import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { VFile } from 'vfile';
import { remarkBlankLines } from '../remark-blank-lines';
import { remarkSpotifyEmbed } from '../remark-spotify-embed';
import { remarkMediaEmbed } from '../remark-media-embed';
import { remarkBreaksForDiary } from '../remark-breaks-for-diary';
import { remarkLinkCard, normalizeUrl, escapeHtml, type RemarkLinkCardOptions } from '../remark-link-card';

const CARDS = {
  'https://example.com/article': {
    title: '記事の題',
    description: '説明の文',
    siteName: 'Example',
    domain: 'example.com',
    image: 'https://images.kechiiiiin.com/diary/cards/0123456789abcdef.jpg',
  },
  'https://example.org/no-image': { title: '画像なし', description: '', siteName: 'example.org', image: null },
  'https://example.net/evil': {
    title: '"><script>alert(1)</script>',
    description: `it's <b>bold</b> & "quoted" >`,
    siteName: 'x',
    domain: '"><img src=x onerror=alert(1)>',
    image: 'javascript:alert(1)',
  },
  'https://example.com/tracked?id=1': { title: '正規化', description: '', siteName: 'e', image: null },
  'https://example.com/other-host-image': {
    title: '外部画像',
    description: '',
    siteName: 'e',
    image: 'https://evil.example/x.jpg',
  },
  'https://example.com/broken': 'not an object',
  'https://example.com/failed': { status: 'failed' },
  'https://example.com/no-title': { title: '', description: 'x', siteName: 'e', image: null },
};

async function render(md: string, opts: RemarkLinkCardOptions = { cards: CARDS }) {
  const file = new VFile({ path: '/repo/src/content/diary/2026-09-13.md', value: md });
  const out = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBlankLines)
    .use(remarkSpotifyEmbed)
    .use(remarkMediaEmbed)
    .use(remarkLinkCard, opts)
    .use(remarkBreaksForDiary)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(file);
  return String(out);
}

describe('normalizeUrl（かけら帳と同じ規則）', () => {
  it('フラグメントとトラッキングのクエリを落とし、ホストを小文字にする', () => {
    expect(normalizeUrl(' https://EXAMPLE.com/tracked?id=1&utm_source=x&fbclid=y#top ')).toBe(
      'https://example.com/tracked?id=1',
    );
  });
  it('http/https 以外は null', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('ftp://example.com/')).toBeNull();
  });
});

describe('remarkLinkCard', () => {
  it('行として独立した URL をカードにする（画像あり）', async () => {
    const html = await render('前の行\nhttps://example.com/article\n後の行');
    expect(html).toContain('<a class="link-card not-prose" href="https://example.com/article" target="_blank" rel="noopener noreferrer">');
    expect(html).toContain('<img src="https://images.kechiiiiin.com/diary/cards/0123456789abcdef.jpg" alt="" loading="lazy" decoding="async">');
    expect(html).toContain('<span class="link-card-site">example.com</span>');
    expect(html).toContain('<span class="link-card-title">記事の題</span>');
    expect(html).toContain('<span class="link-card-desc">説明の文</span>');
    // URL の行を取り除いた跡に孤立した <br> を残さない
    expect(html).toContain('<p>前の行</p>');
    expect(html).toContain('<p>後の行</p>');
    expect(html).not.toMatch(/<br>\s*<\/p>/);
  });

  it('画像なし → blank の SVG、説明なし → desc を出さない、domain 無し → キーのホスト', async () => {
    const html = await render('https://example.org/no-image');
    expect(html).toContain('class="link-card-blank"');
    expect(html).not.toContain('link-card-desc');
    expect(html).toContain('<span class="link-card-site">example.org</span>');
  });

  it('公開バケット以外の画像は使わない', async () => {
    const html = await render('https://example.com/other-host-image');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('link-card-blank');
  });

  it('他人のサイトから来た文字列はエスケープする', async () => {
    const html = await render('https://example.net/evil');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<img src="x"');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('&#x3C;script>alert(1)&#x3C;/script>');
    expect(escapeHtml(`"<>&'`)).toBe('&quot;&lt;&gt;&amp;&#39;');
  });

  it('トラッキング付きで書いても正規化して引ける。href は書いたとおり', async () => {
    const html = await render('https://example.com/tracked?id=1&utm_source=x#frag');
    expect(html).toContain('<span class="link-card-title">正規化</span>');
    expect(html).toContain('href="https://example.com/tracked?id=1&#x26;utm_source=x#frag"');
  });

  it('キャッシュに無い・値が壊れている URL は素のリンク', async () => {
    const html = await render(
      'https://example.com/unknown\nhttps://example.com/broken\nhttps://example.com/failed\nhttps://example.com/no-title',
    );
    expect(html).not.toContain('link-card');
    expect(html).toContain('<a href="https://example.com/unknown">');
  });

  it('行の途中の URL・[テキスト](URL) は触らない', async () => {
    const html = await render('ここ https://example.com/article を見た\n[リンク](https://example.com/article)');
    expect(html).not.toContain('link-card');
  });

  it('X / YouTube / Spotify と並んでも二重に変換しない', async () => {
    const md = [
      'https://x.com/someone/status/1234567890',
      'https://example.com/article',
      'https://youtu.be/T_pYQcRmxtI',
      '',
      'https://open.spotify.com/track/abc123',
    ].join('\n');
    const html = await render(md);
    expect(html.match(/class="link-card /g)?.length).toBe(1);
    expect(html).toContain('twitter-tweet');
    expect(html).toContain('youtube-nocookie.com/embed/T_pYQcRmxtI');
    expect(html).toContain('open.spotify.com/embed/track/abc123');
  });

  it('埋め込み対象がキャッシュにあってもカードにしない（適用順が変わっても安全）', async () => {
    const html = await render('https://youtu.be/T_pYQcRmxtI', {
      cards: { 'https://youtu.be/T_pYQcRmxtI': { title: 'yt', description: '', siteName: 'y', image: null } },
    });
    expect(html).not.toContain('link-card');
  });

  it('JSON が無い・壊れているときは落ちずに素のリンク', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-card-'));
    const missing = await render('https://example.com/article', { file: path.join(dir, 'none.json') });
    expect(missing).not.toContain('link-card');

    const broken = path.join(dir, 'broken.json');
    fs.writeFileSync(broken, '{ not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await render('https://example.com/article', { file: broken });
    expect(out).not.toContain('link-card');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    const arr = path.join(dir, 'arr.json');
    fs.writeFileSync(arr, '[]');
    expect(await render('https://example.com/article', { file: arr })).not.toContain('link-card');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
