import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { rehypeDiaryImages } from '../rehype-diary-images';

/**
 * format:'html'（microCMS 移行分）の diary/blog/emonicle は astro:content の render() を経由せず
 * entry.body を直接 set:html しているため、astro.config の rehypePlugins（remark/rehype 経路）を
 * 通らない。ここで同じ rehypeDiaryImages を HTML 文字列に対して直接かけ、md 記事と同じ書き換えを効かせる。
 *
 * - 壊れた/変な HTML でも例外を投げてビルドを落とさない（失敗時は元の HTML をそのまま返す）
 * - enabled=false（既定・Cloudflare の画像変換が未有効化の間）なら何もせずそのまま返す
 */
export async function transformDiaryImagesHtml(html: string, enabled: boolean): Promise<string> {
  if (!enabled || !html) return html;
  try {
    const file = await unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeDiaryImages, { enabled: true })
      .use(rehypeStringify)
      .process(html);
    return String(file);
  } catch (e) {
    console.warn('[transformDiaryImagesHtml] 画像URLの書き換えに失敗したため元のHTMLのまま出します:', e);
    return html;
  }
}
