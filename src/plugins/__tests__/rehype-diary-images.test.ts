import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import { rehypeDiaryImages } from '../rehype-diary-images';
import { transformDiaryImagesHtml } from '../lib/transform-diary-html';
import { isTransformableImageSrc, buildTransformedUrl } from '../lib/image-transform';

async function renderHast(html: string, enabled = true) {
  const file = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeDiaryImages, { enabled })
    .use(rehypeStringify)
    .process(html);
  return String(file);
}

// format:md 記事の実際の経路（remark → rehype-raw → rehypeDiaryImages）を模した経路。
// astro:content の md 記事は raw html も rehype-raw を通って要素になるため、この経路で確認する。
async function renderFromMarkdown(md: string, enabled = true) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeDiaryImages, { enabled })
    .use(rehypeStringify)
    .process(md);
  return String(file);
}

describe('isTransformableImageSrc', () => {
  it('images.kechiiiiin.com の画像は対象', () => {
    expect(isTransformableImageSrc('https://images.kechiiiiin.com/diary/2026/09/20_01.jpg')).toBe(true);
  });
  it('他ホストは対象外', () => {
    expect(isTransformableImageSrc('https://example.com/x.jpg')).toBe(false);
  });
  it('すでに /cdn-cgi/image/ を含むものは対象外（二重書き換え防止）', () => {
    expect(
      isTransformableImageSrc('https://images.kechiiiiin.com/cdn-cgi/image/width=640/diary/x.jpg'),
    ).toBe(false);
  });
  it('GIF・SVG は対象外', () => {
    expect(isTransformableImageSrc('https://images.kechiiiiin.com/diary/x.gif')).toBe(false);
    expect(isTransformableImageSrc('https://images.kechiiiiin.com/diary/x.svg')).toBe(false);
  });
  it('不正なURLは対象外', () => {
    expect(isTransformableImageSrc('not a url')).toBe(false);
    expect(isTransformableImageSrc(undefined)).toBe(false);
  });
});

describe('buildTransformedUrl', () => {
  it('width・quality・format を /cdn-cgi/image/ に埋め込む', () => {
    expect(buildTransformedUrl('https://images.kechiiiiin.com/diary/x.jpg', { width: 1280 })).toBe(
      'https://images.kechiiiiin.com/cdn-cgi/image/width=1280,quality=80,format=auto/diary/x.jpg',
    );
  });
  it('クエリがあれば保つ', () => {
    expect(buildTransformedUrl('https://images.kechiiiiin.com/diary/x.jpg?v=2', { width: 640 })).toBe(
      'https://images.kechiiiiin.com/cdn-cgi/image/width=640,quality=80,format=auto/diary/x.jpg?v=2',
    );
  });
});

describe('rehypeDiaryImages（enabled: false）', () => {
  it('何もしない（既定はオフ）', async () => {
    const html = await renderHast('<img src="https://images.kechiiiiin.com/diary/x.jpg">', false);
    expect(html).toBe('<img src="https://images.kechiiiiin.com/diary/x.jpg">');
  });
});

describe('rehypeDiaryImages（enabled: true）', () => {
  it('本文の写真は src を書き換え、srcset・sizes を付ける', async () => {
    const html = await renderHast('<img src="https://images.kechiiiiin.com/diary/2026/09/20_01.jpg" alt="">');
    expect(html).toContain(
      'src="https://images.kechiiiiin.com/cdn-cgi/image/width=1280,quality=80,format=auto/diary/2026/09/20_01.jpg"',
    );
    expect(html).toContain(
      'srcset="https://images.kechiiiiin.com/cdn-cgi/image/width=640,quality=80,format=auto/diary/2026/09/20_01.jpg 640w, https://images.kechiiiiin.com/cdn-cgi/image/width=1280,quality=80,format=auto/diary/2026/09/20_01.jpg 1280w"',
    );
    expect(html).toContain('sizes="(min-width: 768px) 720px, 100vw"');
    expect(html).toContain('loading="lazy"');
  });

  it('既存の loading 属性は上書きしない', async () => {
    const html = await renderHast(
      '<img src="https://images.kechiiiiin.com/diary/x.jpg" loading="eager">',
    );
    expect(html).toContain('loading="eager"');
  });

  it('images.kechiiiiin.com 以外の画像は素通し', async () => {
    const html = await renderHast('<img src="https://example.com/x.jpg">');
    expect(html).toBe('<img src="https://example.com/x.jpg">');
  });

  it('GIF・SVG は書き換えない', async () => {
    const gif = await renderHast('<img src="https://images.kechiiiiin.com/diary/x.gif">');
    expect(gif).toBe('<img src="https://images.kechiiiiin.com/diary/x.gif">');
    const svg = await renderHast('<img src="https://images.kechiiiiin.com/diary/x.svg">');
    expect(svg).toBe('<img src="https://images.kechiiiiin.com/diary/x.svg">');
  });

  it('すでに /cdn-cgi/image/ を含む画像は二重に書き換えない', async () => {
    const src = 'https://images.kechiiiiin.com/cdn-cgi/image/width=640,quality=80,format=auto/diary/x.jpg';
    const html = await renderHast(`<img src="${src}">`);
    expect(html).toBe(`<img src="${src}">`);
  });

  it('リンクカードのサムネ（span.link-card-thumb 内）は幅160で1枚だけ、srcset は付けない', async () => {
    const html = await renderHast(
      '<span class="link-card-thumb"><img src="https://images.kechiiiiin.com/diary/cards/x.jpg" alt="" loading="lazy" decoding="async"></span>',
    );
    expect(html).toContain(
      'src="https://images.kechiiiiin.com/cdn-cgi/image/width=160,quality=80,format=auto/diary/cards/x.jpg"',
    );
    expect(html).not.toContain('srcset');
    expect(html).toContain('loading="lazy"'); // 既存の属性を保つ
  });

  it('本文中の raw html（remark-rehype + rehype-raw 経由）でも効く（md 記事の実経路）', async () => {
    const html = await renderFromMarkdown(
      '前の文\n\n<img src="https://images.kechiiiiin.com/diary/2026/09/20_01.jpg" alt="">\n\n後の文',
    );
    expect(html).toContain(
      'src="https://images.kechiiiiin.com/cdn-cgi/image/width=1280,quality=80,format=auto/diary/2026/09/20_01.jpg"',
    );
  });
});

describe('transformDiaryImagesHtml（format: html 直描画の経路）', () => {
  it('enabled=false なら素通し', async () => {
    const html = '<p>本文</p><img src="https://images.kechiiiiin.com/diary/x.jpeg" alt="">';
    expect(await transformDiaryImagesHtml(html, false)).toBe(html);
  });

  it('enabled=true なら rehypeDiaryImages と同じ書き換えをする（実際の diary body の形）', async () => {
    const html =
      '<p>これを</p><img src="https://images.kechiiiiin.com/diary/20260116221241.jpeg" alt="" loading="lazy" style="max-width: 100%; height: auto;"><p>こうなる</p>';
    const out = await transformDiaryImagesHtml(html, true);
    expect(out).toContain(
      'src="https://images.kechiiiiin.com/cdn-cgi/image/width=1280,quality=80,format=auto/diary/20260116221241.jpeg"',
    );
    expect(out).toContain('srcset=');
    // 元の属性（style・loading）は保たれる
    expect(out).toContain('style="max-width: 100%; height: auto;"');
    expect(out).toContain('loading="lazy"');
  });

  it('壊れた入力でも例外を投げず、失敗時は元のHTMLを返す', async () => {
    // rehype-parse は基本的に何を渡しても落ちないが、念のため空文字・非HTML文字列でも壊れないことを確認
    expect(await transformDiaryImagesHtml('', true)).toBe('');
    const weird = '<img src="https://images.kechiiiiin.com/diary/x.jpg"';
    await expect(transformDiaryImagesHtml(weird, true)).resolves.toEqual(expect.any(String));
  });
});
