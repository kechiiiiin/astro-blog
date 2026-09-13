import fs from 'node:fs';
import path from 'node:path';
import type { Root, Paragraph, RootContent } from 'mdast';
import type { Parent } from 'unist';
import { visit, SKIP } from 'unist-util-visit';
import { isAutolinkLiteral, isLineStandalone, trimBoundary } from './lib/standalone-link';
import { TWEET_PATTERN, YOUTUBE_PATTERN } from './remark-media-embed';
import { SPOTIFY_PATTERN } from './remark-spotify-embed';

/**
 * 行として独立した普通のサイトの URL を、キャッシュ JSON（src/data/link-cards.json）の OGP でカードにする remark プラグイン。
 * 設計: vault「リンクカード設計・詳細」§6・§7・§12。
 *
 * - **ビルド中に外部へは一切出ない。** JSON を読むだけ（JSON はかけら帳が日記を書き出すときに commit する）
 * - **JSON が無い・壊れている・キーが無い・値がおかしい → 素のリンクのまま。ビルドは絶対に落とさない**
 * - X / YouTube / Spotify は既存プラグインの担当なので触らない（適用順が入れ替わっても二重に変換しないよう、ここでも除外する）
 * - astro.config では remarkMediaEmbed の **後**・remarkBreaksForDiary の **前**（text 内の生 `\n` で行判定するため）
 *
 * ⚠️ html ノードに**他人のサイトから来た文字列**を埋める。既存の埋め込みプラグインには無かった危険なので、
 *    タイトル・説明・ドメイン・属性値（href / src）は全て escapeHtml を通す。href は http/https、src は公開バケットだけ。
 */

// ───────────────────────────────────────────────────────────────
// URL（⚠️ かけら帳 ~/work/kakera-cho/src/lib/card/url.ts・src/lib/markdown.ts の写し。
//      正規化が食い違うと JSON を引けない。どちらかを直したら必ずもう一方も直す）
// ───────────────────────────────────────────────────────────────

/** 落とすトラッキングのクエリ（設計 §3.2）。それ以外のクエリは残す。 */
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref_src',
];

/** http / https だけ。空白・制御文字・山括弧・引用符を含むものは弾く（かけら帳 isSafeHref と同じ）。 */
export function isSafeHref(url: string): boolean {
  const u = url.trim();
  if (!u || /[\s<>"']/.test(u)) return false;
  for (let i = 0; i < u.length; i++) {
    const code = u.charCodeAt(i);
    if (code < 0x21 || code === 0x7f) return false;
  }
  return /^https?:\/\/./i.test(u);
}

/**
 * キャッシュのキーにする正規化（かけら帳 normalizeUrl と同じ）。
 * 前後の空白を落とす／フラグメントを落とす／トラッキングのクエリを落とす／ホストは小文字（URL が勝手にそうする）／
 * パスは触らない／http・https 以外は扱わない。
 */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!isSafeHref(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  // 触ったときだけ書き直す（searchParams を触るとクエリ全体が再エンコードされるため）
  if (TRACKING_PARAMS.some((p) => u.searchParams.has(p))) {
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
  }
  return u.toString();
}

/** カードの一段目に出すドメイン。先頭の www. だけ落とす。 */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** 自分の画像・画像や PDF や動画そのものへのリンクはカードにしない（設計 §7.1）。 */
const NOT_CARD_EXT = /\.(?:jpe?g|png|gif|webp|avif|svg|pdf|mp4|mov)$/i;

/**
 * かけら帳の parseStandaloneUrls は「行が ASCII の印字可能文字だけの URL」しか拾わない。
 * GFM の autolink literal は日本語まで飲み込むことがあるので、ここで揃える。
 */
const ASCII_URL = /^https?:\/\/[\x21-\x7E]+$/;

function isCardCandidate(url: string): boolean {
  if (!ASCII_URL.test(url) || !isSafeHref(url)) return false;
  if (YOUTUBE_PATTERN.test(url) || TWEET_PATTERN.test(url) || SPOTIFY_PATTERN.test(url)) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.hostname === 'images.kechiiiiin.com') return false;
  if (NOT_CARD_EXT.test(u.pathname)) return false;
  return true;
}

// ───────────────────────────────────────────────────────────────
// JSON
// ───────────────────────────────────────────────────────────────

/** 描くときの形（JSON の値を検証・整形したもの）。 */
export interface LinkCardView {
  title: string;
  description: string;
  domain: string;
  image: string | null;
}

/** カードの画像に使ってよい src。公開バケットの https だけ（`..` は不可）。それ以外は blank の画像にする。 */
const PUBLIC_IMAGE_SRC = /^https:\/\/images\.kechiiiiin\.com\/(?!.*\.\.)[A-Za-z0-9_./-]+$/;

const TITLE_MAX = 300;
const DESC_MAX = 500;

function clip(s: string, max: number): string {
  const chars = Array.from(s.replace(/\s+/g, ' ').trim());
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('');
}

/** JSON の値を検証する。形がおかしければ null（＝素のリンクのまま）。 */
export function toCardView(raw: unknown, key: string): LinkCardView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  // JSON に失敗記録は載らない約束だが、紛れ込んでも素のリンクに落とす
  if ('status' in v && v.status !== 'ok') return null;
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  // かけら帳は title を空にしない（無ければホスト名を入れる）。空・無しは壊れた行とみなす
  const title = clip(str(v.title), TITLE_MAX);
  if (!title) return null;
  const domain = clip(str(v.domain), 253) || domainOf(key);
  const image = typeof v.image === 'string' && PUBLIC_IMAGE_SRC.test(v.image) ? v.image : null;
  return { title, description: clip(str(v.description), DESC_MAX), domain, image };
}

const DEFAULT_CARDS_FILE = path.resolve(process.cwd(), 'src/data/link-cards.json');

let cache: { file: string; mtimeMs: number; cards: Record<string, unknown> } | null = null;
let warned = '';

/**
 * JSON を読む。記事ごとに読み直さず、ファイルの更新時刻が変わったときだけ読み直す（astro dev 中の書き換えにも追従）。
 * 無い・読めない・壊れている・オブジェクトでない → {}（カードを出さないだけ）。
 */
function loadCards(file: string): Record<string, unknown> {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return {}; // ファイルが無いのは正常（まだ一度も書き出していない）
  }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.cards;
  let cards: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      cards = parsed as Record<string, unknown>;
    } else {
      throw new Error('トップレベルがオブジェクトではありません');
    }
  } catch (e) {
    const sig = `${file}:${mtimeMs}`;
    if (warned !== sig) {
      warned = sig;
      console.warn('[remark-link-card] link-cards.json を読めません。カードは出しません:', (e as Error).message);
    }
  }
  cache = { file, mtimeMs, cards };
  return cards;
}

// ───────────────────────────────────────────────────────────────
// HTML
// ───────────────────────────────────────────────────────────────

/** テキスト・属性値の両方に使えるエスケープ。 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 画像が無いことを示す空白の画像（かけら帳 BlankThumb と同じ絵。外部画像は読まない・文字なし）。 */
const BLANK_THUMB_SVG =
  '<svg class="link-card-blank" viewBox="0 0 80 80" aria-hidden="true" focusable="false">' +
  '<rect x="24.5" y="27.5" width="31" height="25" rx="1.5" fill="none" stroke="currentColor" stroke-width="1"/>' +
  '<circle cx="47" cy="35" r="2.5" fill="none" stroke="currentColor" stroke-width="1"/>' +
  '<path d="M27 50 L36 40.5 L42 46.5 L46 42.5 L53 50" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>' +
  '</svg>';

/** カードの HTML。href は呼ぶ側で isSafeHref 済みのものを渡すが、ここでももう一度確かめる。 */
export function renderLinkCardHtml(href: string, card: LinkCardView): string | null {
  if (!isSafeHref(href)) return null;
  const thumb =
    card.image && PUBLIC_IMAGE_SRC.test(card.image)
      ? `<img src="${escapeHtml(card.image)}" alt="" loading="lazy" decoding="async">`
      : BLANK_THUMB_SVG;
  return (
    `<a class="link-card not-prose" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` +
    `<span class="link-card-thumb">${thumb}</span>` +
    `<span class="link-card-text">` +
    (card.domain ? `<span class="link-card-site">${escapeHtml(card.domain)}</span>` : '') +
    `<span class="link-card-title">${escapeHtml(card.title)}</span>` +
    (card.description ? `<span class="link-card-desc">${escapeHtml(card.description)}</span>` : '') +
    `</span></a>`
  );
}

// ───────────────────────────────────────────────────────────────
// プラグイン本体
// ───────────────────────────────────────────────────────────────

export interface RemarkLinkCardOptions {
  /** JSON の場所（既定: <cwd>/src/data/link-cards.json） */
  file?: string;
  /** テスト用: ファイルを読まずにこの辞書を使う */
  cards?: Record<string, unknown>;
}

export function remarkLinkCard(options: RemarkLinkCardOptions = {}) {
  return (tree: Root) => {
    const cards = options.cards ?? loadCards(options.file ?? DEFAULT_CARDS_FILE);
    if (Object.keys(cards).length === 0) return;

    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      if (!parent || typeof index !== 'number') return;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (!isAutolinkLiteral(child)) continue;
        if (!isCardCandidate(child.url)) continue;
        if (!isLineStandalone(node.children, i)) continue;
        const key = normalizeUrl(child.url);
        if (!key || !Object.prototype.hasOwnProperty.call(cards, key)) continue;
        const view = toCardView(cards[key], key);
        if (!view) continue;
        const html = renderLinkCardHtml(child.url, view);
        if (!html) continue;

        const before = trimBoundary(node.children.slice(0, i), 'end');
        const after = trimBoundary(node.children.slice(i + 1), 'start');

        const segments: RootContent[] = [];
        if (before.length > 0) segments.push({ type: 'paragraph', children: before } as Paragraph);
        segments.push({ type: 'html', value: html });
        if (after.length > 0) segments.push({ type: 'paragraph', children: after } as Paragraph);

        (parent as Parent).children.splice(index, 1, ...segments);

        // after 段落があればそれを次に再訪して残りの URL も処理させる（remark-media-embed と同じ）
        const hasAfter = after.length > 0;
        return [SKIP, index + segments.length - (hasAfter ? 1 : 0)];
      }
    });
  };
}
