import type { Root, Element } from 'hast';
import { visitParents } from 'unist-util-visit-parents';
import {
  isTransformableImageSrc,
  buildTransformedUrl,
  DIARY_PHOTO_DEFAULT_WIDTH,
  DIARY_PHOTO_SRCSET_WIDTHS,
  DIARY_PHOTO_SIZES,
  LINK_CARD_THUMB_WIDTH,
} from './lib/image-transform';

/**
 * 日記本文の写真（images.kechiiiiin.com）を、表示時だけ Cloudflare の画像変換
 * （/cdn-cgi/image/width=...,quality=80,format=auto/<path>）経由の URL に書き換える rehype プラグイン。
 * 元の URL（RSS・出典としての一次データ）は書き換えず、表示用の src/srcset だけを差し替える。
 *
 * - remark/rehype を通る記事（format: md）はこのプラグインが直接効く（astro.config の rehypePlugins に登録）。
 * - src/lib/content/index.ts の format:'html' 直描画（Content() が entry.body をそのまま返す経路）は
 *   remark/rehype をまったく通らないため、ここを通らない。同じロジックを transformDiaryImagesHtml() で
 *   再利用し、その経路でも同じ書き換えが効くようにしている。
 * - リンクカードのサムネ（remark-link-card.ts が <span class="link-card-thumb"><img ...></span> を
 *   raw html で埋め込む）は表示サイズが小さいので、幅を分けて縮める（srcset は付けない・1枚で足りる）。
 * - オン/オフは src/config.ts の imageTransform 定数（Cloudflare の画像変換がまだ無効なため既定 false）。
 */

export interface RehypeDiaryImagesOptions {
  /** 既定は src/config.ts の imageTransform。テストではここで明示的に true/false を渡す。 */
  enabled: boolean;
}

function hasClass(node: Element, className: string): boolean {
  const properties = node.properties ?? {};
  const raw = properties.className;
  if (Array.isArray(raw)) return raw.some((c) => String(c) === className);
  if (typeof raw === 'string') return raw.split(/\s+/).includes(className);
  const classAttr = properties.class;
  if (typeof classAttr === 'string') return classAttr.split(/\s+/).includes(className);
  return false;
}

function isInsideLinkCardThumb(ancestors: Array<Root | Element>): boolean {
  return ancestors.some((a) => a.type === 'element' && a.tagName === 'span' && hasClass(a, 'link-card-thumb'));
}

function transformImgNode(node: Element, isLinkCardThumb: boolean): void {
  const src = node.properties?.src;
  if (typeof src !== 'string' || !isTransformableImageSrc(src)) return;

  node.properties = node.properties ?? {};

  if (isLinkCardThumb) {
    node.properties.src = buildTransformedUrl(src, { width: LINK_CARD_THUMB_WIDTH });
    node.properties.width = LINK_CARD_THUMB_WIDTH;
  } else {
    node.properties.src = buildTransformedUrl(src, { width: DIARY_PHOTO_DEFAULT_WIDTH });
    node.properties.srcset = DIARY_PHOTO_SRCSET_WIDTHS.map(
      (w) => `${buildTransformedUrl(src, { width: w })} ${w}w`,
    ).join(', ');
    node.properties.sizes = DIARY_PHOTO_SIZES;
  }

  // 既存の loading/decoding はそのまま（remark-link-card はすでに loading="lazy" decoding="async" を付けている）。
  if (node.properties.loading === undefined) {
    node.properties.loading = 'lazy';
  }
}

export function rehypeDiaryImages(options: RehypeDiaryImagesOptions) {
  return (tree: Root) => {
    if (!options.enabled) return;
    visitParents(tree, 'element', (node: Element, ancestors) => {
      if (node.tagName !== 'img') return;
      transformImgNode(node, isInsideLinkCardThumb(ancestors));
    });
  };
}
