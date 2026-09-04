// 日記の X（Twitter）自動投稿で使う純粋関数群。
// 依存は node:crypto のみ。テスト（scripts/post-diary-to-x.test.ts）から直接叩けるように
// 副作用のある処理（git / fetch）は post-diary-to-x.mjs 側に置いている。

import { createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// 投稿テンプレート
// ---------------------------------------------------------------------------

/** 投稿本文のテンプレート。文言を変えたいときはここだけ直す。
 *  2026-09-04: Keisuke の希望でタイトルを載せず「日記投稿 + URL」だけにした。
 *  title は引数として残してあるので、載せたくなったら `${title}` を足すだけでよい。 */
export const POST_TEMPLATE = (title, url) => `日記投稿\n${url}`;

/** X の上限。URL は t.co に短縮されるため実長に関わらず 23 文字として数える。 */
export const MAX_WEIGHTED_LENGTH = 280;
export const URL_WEIGHT = 23;

/** テンプレートのうち title / url 以外の固定部分の文字数（「日記を書きました「」\n」= 11）。 */
const TEMPLATE_OVERHEAD = [...POST_TEMPLATE('', '')].length;

/**
 * 投稿本文を組み立てる。280 を超えるならタイトル側を「…」付きで切り詰める。
 * 注意: X 実機は CJK を 2 文字として重み付けするが、ここでは仕様どおり素の
 * コードポイント数で数えている（日記タイトルは短いため実運用上は問題にならない）。
 */
export function composeText(title, url) {
  const available = MAX_WEIGHTED_LENGTH - TEMPLATE_OVERHEAD - URL_WEIGHT;
  const chars = [...title];
  const finalTitle =
    chars.length <= available ? title : chars.slice(0, Math.max(0, available - 1)).join('') + '…';
  return POST_TEMPLATE(finalTitle, url);
}

// ---------------------------------------------------------------------------
// フロントマター（YAML ライブラリを使わない最小パーサ）
// ---------------------------------------------------------------------------

/**
 * `---` で囲まれたフロントマターから title / pubDate / draft / description を拾う。
 * シングル・ダブルクォート付き／裸のスカラーに対応。リスト（tags 等）や
 * ネストしたキーは読み飛ばす。
 */
export function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) return {};

  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    // インデントされた行＝リスト項目やネストしたキーなので無視する
    if (/^\s/.test(line) || line.trim().startsWith('#')) continue;
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;

    const key = kv[1];
    let value = kv[2].trim();
    if (value === '' || value.startsWith('[') || value.startsWith('{')) continue; // 空 or リスト/マップ

    // クォートを剥がす（エスケープされたクォートも戻す）
    if (
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2) ||
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
    ) {
      const quote = value[0];
      value = value.slice(1, -1).replaceAll(quote + quote, quote);
      if (quote === '"') value = value.replaceAll('\\"', '"');
    }

    if (key === 'draft') {
      result.draft = value === 'true';
    } else if (key === 'title' || key === 'pubDate' || key === 'description') {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 日付（src/utils/date.ts の getDateParts / getDiaryPath / isPublished と同じ規則）
// ---------------------------------------------------------------------------

const JST = 'Asia/Tokyo';

/** JST での年月日を取り出す（src/utils/date.ts の getDateParts と同じ結果になる）。 */
export function getJstDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type).value;
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/** 公開 URL のパス。src/utils/date.ts の getDiaryPath と一致すること。 */
export function getDiaryPath(date) {
  const { year, month, day } = getJstDateParts(date);
  // 末尾スラッシュ付き。無いと 307 リダイレクトを挟むので、X のクローラに直接届く形にしておく
  return `/diary/${year}/${month}/${day}/`;
}

/**
 * JST の日付で「今日以前」なら公開済み（src/utils/date.ts の isPublished と同じ規則）。
 * 制限: 未来日の記事はこの時点で投稿されず、公開日を迎えても後から投稿されることはない
 *       （追加コミット時にしか本スクリプトが走らないため）。許容している。
 */
export function isPublished(date, now = new Date()) {
  const a = getJstDateParts(date);
  const b = getJstDateParts(now);
  return `${a.year}${a.month}${a.day}` <= `${b.year}${b.month}${b.day}`;
}

// ---------------------------------------------------------------------------
// OAuth 1.0a（HMAC-SHA1・user context）
// ---------------------------------------------------------------------------

/** RFC 3986 準拠のパーセントエンコード（encodeURIComponent が残す !*'() も潰す）。 */
export function percentEncode(str) {
  return encodeURIComponent(str).replace(
    /[!*'()]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/**
 * 署名ベース文字列を組み立てる。
 * params には oauth_* に加え、クエリ／フォームパラメータを混ぜて渡す
 * （X の "Creating a signature" のサンプル検証用。実際の v2 呼び出しでは
 *   JSON ボディは署名対象外なので空になる）。
 */
export function buildSignatureBaseString(method, url, params) {
  const base = url.split('?')[0];
  const paramString = Object.entries(params)
    .map(([k, v]) => [percentEncode(k), percentEncode(String(v))])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${method.toUpperCase()}&${percentEncode(base)}&${percentEncode(paramString)}`;
}

/** 署名鍵は enc(consumerSecret)&enc(tokenSecret)。 */
export function buildSigningKey(consumerSecret, tokenSecret) {
  return `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
}

/** HMAC-SHA1 で署名（base64）。 */
export function signRequest({ method, url, params = {}, consumerSecret, tokenSecret }) {
  const baseString = buildSignatureBaseString(method, url, params);
  return createHmac('sha1', buildSigningKey(consumerSecret, tokenSecret))
    .update(baseString)
    .digest('base64');
}

/**
 * Authorization: OAuth ... ヘッダの値を組み立てる。
 * extraParams は署名にだけ混ぜ、ヘッダには oauth_* のみを載せる。
 */
export function buildAuthHeader({
  method,
  url,
  consumerKey,
  consumerSecret,
  token,
  tokenSecret,
  nonce,
  timestamp,
  extraParams = {},
}) {
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp),
    oauth_token: token,
    oauth_version: '1.0',
  };
  const signature = signRequest({
    method,
    url,
    params: { ...oauth, ...extraParams },
    consumerSecret,
    tokenSecret,
  });
  const all = { ...oauth, oauth_signature: signature };
  return (
    'OAuth ' +
    Object.keys(all)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(all[k])}"`)
      .join(', ')
  );
}
