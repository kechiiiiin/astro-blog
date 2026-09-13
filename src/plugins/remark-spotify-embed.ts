import type { Root, Paragraph, Link } from 'mdast';
import type { Parent } from 'unist';
import { visit } from 'unist-util-visit';

// ⚠️⚠️ 下の判別（Spotify の URL の正規表現と「段落がその URL だけ」という条件）は、
//   `~/work/kakera-cho/src/lib/markdown.ts`（かけら帳）
// に **写し** があります。**どちらかを直したら、必ずもう一方も同じように直してください。**
// かけら帳の画面は「ここで公開したらこう見える」のプレビューなので、判別が食い違うとプレビューの意味が無くなる。
// npm パッケージにして共有しないのは、この規模に釣り合わないため（2026-09-13 決定。3つ目のアプリが出たら見直す）。

// remark-link-card が「埋め込み対象はカードにしない」判定に使うので export している。
export const SPOTIFY_PATTERN =
  /^https:\/\/open\.spotify\.com\/(track|album|artist|playlist|episode|show)\/([a-zA-Z0-9]+)/;

/**
 * Remark plugin to convert Spotify URLs to embedded players.
 * Only processes standalone links (single link in a paragraph).
 */
export function remarkSpotifyEmbed() {
  return (tree: Root) => {
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      // Only process paragraphs with a single link child
      if (node.children.length !== 1) return;
      const child = node.children[0];
      if (child.type !== 'link') return;

      const link = child as Link;
      if (!SPOTIFY_PATTERN.test(link.url)) return;

      // Convert URL to embed format
      const embedSrc = link.url.replace(
        'open.spotify.com/',
        'open.spotify.com/embed/'
      );

      // Replace with HTML node
      const html = {
        type: 'html' as const,
        value: `<div style="margin-bottom: 1rem;"><iframe
  src="${embedSrc}"
  width="100%"
  height="152"
  frameborder="0"
  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
  loading="lazy"
  style="border-radius: 12px;">
</iframe></div>`,
      };

      // Replace in parent node
      if (parent && typeof index === 'number') {
        (parent as Parent).children[index] = html;
      }
    });
  };
}
