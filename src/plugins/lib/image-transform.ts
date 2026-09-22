// 日記の写真（images.kechiiiiin.com）を Cloudflare の画像変換（/cdn-cgi/image/...）経由の
// URL に書き換えるための、フレームワークに依存しない純粋関数。
// rehype-diary-images.ts（remark/rehype 経路）と src/lib/content/index.ts（format:html の直描画経路）の
// 両方から使う共通ロジック。ここを直したら両方に効く。

export const IMAGE_HOST = 'images.kechiiiiin.com';
const CDN_CGI_PREFIX = '/cdn-cgi/image/';

/** GIF・SVG は変換しない（アニメーション・ベクターは Cloudflare 側の変換に向かない／意味がない）。 */
const NOT_TRANSFORMABLE_EXT = /\.(?:gif|svg)$/i;

/**
 * この img の src を書き換えてよいか。
 * - images.kechiiiiin.com 以外は対象外
 * - すでに /cdn-cgi/image/ を含むものは二重に書き換えない
 * - GIF・SVG は対象外
 */
export function isTransformableImageSrc(src: string | undefined | null): src is string {
  if (!src) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.hostname !== IMAGE_HOST) return false;
  if (url.pathname.startsWith(CDN_CGI_PREFIX)) return false;
  if (NOT_TRANSFORMABLE_EXT.test(url.pathname)) return false;
  return true;
}

export interface TransformOptions {
  width: number;
  quality?: number;
  format?: string;
}

/**
 * https://images.kechiiiiin.com/<path> を
 * https://images.kechiiiiin.com/cdn-cgi/image/width=W,quality=Q,format=F/<path> に書き換える。
 * 呼ぶ側で isTransformableImageSrc 済みの src を渡すこと。
 */
export function buildTransformedUrl(src: string, { width, quality = 80, format = 'auto' }: TransformOptions): string {
  const url = new URL(src);
  const params = `width=${width},quality=${quality},format=${format}`;
  return `${url.origin}${CDN_CGI_PREFIX}${params}${url.pathname}${url.search}`;
}

/** 本文の写真（大きめ表示）に使う既定の src 幅と srcset の刻み。 */
export const DIARY_PHOTO_DEFAULT_WIDTH = 1280;
export const DIARY_PHOTO_SRCSET_WIDTHS = [640, 1280];
export const DIARY_PHOTO_SIZES = '(min-width: 768px) 720px, 100vw';

/** リンクカードのサムネ（小さい表示）に使う幅。 */
export const LINK_CARD_THUMB_WIDTH = 160;
