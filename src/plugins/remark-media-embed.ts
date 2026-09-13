import type { Root, Paragraph, RootContent } from 'mdast';
import type { Parent } from 'unist';
import { visit, SKIP } from 'unist-util-visit';
import { isAutolinkLiteral, isLineStandalone, trimBoundary } from './lib/standalone-link';

// ⚠️⚠️ 下の判別（正規表現と「行として独立した URL だけ」という条件）は、
//   `~/work/kakera-cho/src/lib/markdown.ts`（かけら帳）
// に **写し** があります。**どちらかを直したら、必ずもう一方も同じように直してください。**
// かけら帳の画面は「ここで公開したらこう見える」のプレビューなので、判別が食い違うとプレビューの意味が無くなる。
// npm パッケージにして共有しないのは、この規模に釣り合わないため（2026-09-13 決定。3つ目のアプリが出たら見直す）。
// Spotify（remark-spotify-embed.ts）はかけら帳側が未対応で、そこだけ意図的に食い違っている。
// youtu.be/ID, watch?v=ID, shorts/ID, live/ID, embed/ID（si= 等のクエリは無視）
// remark-link-card が「埋め込み対象はカードにしない」判定に使うので export している。
export const YOUTUBE_PATTERN =
  /^https:\/\/(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/))([A-Za-z0-9_-]{11})/;
export const TWEET_PATTERN =
  /^https:\/\/(?:x\.com|(?:mobile\.)?twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+/;

/** URL を埋め込み HTML に変換。対象外なら null。 */
function toEmbedHtml(url: string): string | null {
  const yt = url.match(YOUTUBE_PATTERN);
  if (yt) {
    const id = yt[1];
    // youtube-nocookie + lazy + aspect-ratio 16/9。?rel=0&hl=en で astro-embed 経由の MDX と表示を揃える。
    return `<div class="youtube-embed" style="position:relative;aspect-ratio:16/9;margin-bottom:1rem;"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&hl=en" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
  }
  if (TWEET_PATTERN.test(url)) {
    // widgets.js（BaseLayout でグローバル読み込み済み）が hydrate。失敗時はリンクとして残る。
    return `<blockquote class="twitter-tweet"><a href="${url}">${url}</a></blockquote>`;
  }
  return null;
}

// isAutolinkLiteral / isLineStandalone / trimBoundary は remark-link-card と共有するため lib/standalone-link.ts に移した（中身は同じ）。

/**
 * .md 記事中の X / YouTube の生 URL を埋め込みに変換する remark プラグイン。
 * remarkSpotifyEmbed と違い、diary の「空行なし段落内の URL 行」も分割して変換する。
 * astro.config では remarkBreaksForDiary より **前** に置くこと（text 内の生 `\n` で行判定するため）。
 */
export function remarkMediaEmbed() {
  return (tree: Root) => {
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      if (!parent || typeof index !== 'number') return;

      // 段落内で最初に該当する「行独立の埋め込み URL」を探す
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (!isAutolinkLiteral(child)) continue;
        const html = toEmbedHtml(child.url);
        if (!html) continue;
        if (!isLineStandalone(node.children, i)) continue;

        const before = trimBoundary(node.children.slice(0, i), 'end');
        const after = trimBoundary(node.children.slice(i + 1), 'start');
        const htmlNode: RootContent = { type: 'html', value: html };

        const segments: RootContent[] = [];
        if (before.length > 0) segments.push({ type: 'paragraph', children: before } as Paragraph);
        segments.push(htmlNode);
        if (after.length > 0) segments.push({ type: 'paragraph', children: after } as Paragraph);

        (parent as Parent).children.splice(index, 1, ...segments);

        // after 段落があればそれを次に再訪して残りの URL も処理させる
        const hasAfter = after.length > 0;
        return [SKIP, index + segments.length - (hasAfter ? 1 : 0)];
      }
    });
  };
}
