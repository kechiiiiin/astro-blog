// 日記を X（Twitter）へ投稿するためのリンクを組み立てる純粋関数群。
// 依存なし。テスト（scripts/post-diary-link-to-discord.test.ts）から直接叩けるように
// 副作用のある処理（git / fetch）は post-diary-link-to-discord.mjs 側に置いている。
//
// 2026-09-27: X API（有料 $0.20/件）での自動投稿をやめ、Web Intent リンクを
// Discord へ送るだけにした（費用ゼロ化）。OAuth 1.0a 署名まわりの関数は
// 不要になったため削除した（X の投稿エンドポイントへの直接呼び出しはもうしない。git 履歴に残る）。

// ---------------------------------------------------------------------------
// 投稿テンプレート
// ---------------------------------------------------------------------------

/** 投稿本文のテンプレート。文言を変えたいときはここだけ直す。
 *  2026-09-04: Keisuke の希望でタイトルを載せず「日記投稿 + URL」だけにした。
 *  title は引数として残してあるので、載せたくなったら `${title}` を足すだけでよい。 */
export const POST_TEMPLATE = (title, url) => `日記\n${url}`;

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
// X の投稿画面リンク（Web Intent）と Discord への通知
// ---------------------------------------------------------------------------

/**
 * X の投稿画面をあらかじめ本文入りで開く Web Intent リンク。
 * これを開いて「ポスト」を押すだけで投稿できる（API を叩かないので無料）。
 */
export function buildIntentUrl(title, url) {
  return `https://x.com/intent/post?text=${encodeURIComponent(composeText(title, url))}`;
}

/**
 * Discord へ送る embed 1件分のペイロード。
 * タイトルに引用符・日本語が入りうるので、呼び出し側で文字列連結せずこの関数（＝JS の
 * テンプレートリテラル）で組み立てる。
 */
export function buildDiaryDiscordPayload(title, url) {
  const intentUrl = buildIntentUrl(title, url);
  return {
    embeds: [
      {
        title: '📝 日記を X に投稿する',
        url: intentUrl,
        description: `「${title}」\n開いて「ポスト」を押すだけです\n${url}`,
        color: 3066993,
      },
    ],
  };
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
// 日付を変えた（移した）日記を「追加」から外す
// ---------------------------------------------------------------------------

/**
 * 追加された日記のうち、**日付を変えただけのもの**を除く（X に同じ日記を二度投稿しない）。
 *
 * 判定: その日記を追加した commit（範囲内で最後のもの）が、同じ commit で別の日記を消しており、
 * 消された日記が起点（最後に成功したデプロイ）の時点で既にあった → 公開済みの日記の移動とみなす。
 * 消された日記が起点に無くても、それ自身が範囲内で「移動として」足されたものなら辿って遡る
 * （デプロイ前に 18→17→16 と2回移したとき、16 を 18 の移動と見抜く）。
 * - かけら帳の「日付を変える」は旧削除＋新追加を 1 commit で積む（move(diary): …）
 * - GitHub の画面で改名したときも 1 commit になる
 * - 起点にまだ無かった日記（未デプロイのうちに作って移した）は、まだ投稿していないので投稿する
 * 判定に必要な git が読めなかったものは、二重投稿を避けて投稿しない（unknown に入れる。
 * 本当に新しい日記なら workflow_dispatch の x_post_file で投稿し直せる）。
 *
 * ⚠️ 「追加された」の一覧（呼び手の git diff --diff-filter=A）は git の既定の rename 検出に頼っている。
 *   中身が似ていれば改名は R になって A に出ない（それも再投稿を防ぐ一段になっている）が、
 *   本文が大きく変わると A に出る。ここはその A を拾う側なので rename 検出の有無に依らず正しく判定する。
 *   一覧の git diff に --no-renames は付けない（守りを一段減らすだけ）。
 *
 * @param {string[]} added 追加された日記のパス
 * @param {{
 *   addingCommit: (path: string) => string | null | undefined,   // null=読めない / undefined=見つからない
 *   deletedDiariesIn: (sha: string) => string[] | null,
 *   existedAtBase: (path: string) => boolean,
 * }} git
 * @returns {{ post: string[], moved: { path: string, from: string }[], unknown: string[] }}
 */
export function excludeMovedDiaries(added, git) {
  const post = [];
  const moved = [];
  const unknown = [];
  for (const path of added) {
    const r = traceMove(path, git, new Set([path]));
    if (r === 'unknown') unknown.push(path);
    else if (r) moved.push({ path, from: r });
    else post.push(path);
  }
  return { post, moved, unknown };
}

/**
 * path を足した commit が消した日記を辿り、起点にあった日記に行き着けばそのパスを返す。
 * 行き着かなければ null、git が読めなければ 'unknown'。
 */
function traceMove(path, git, seen) {
  const sha = git.addingCommit(path);
  if (sha === null) return 'unknown';
  if (sha === undefined) return null;
  const deleted = git.deletedDiariesIn(sha);
  if (deleted === null) return 'unknown';
  let sawUnknown = false;
  for (const d of deleted) {
    if (d === path || seen.has(d)) continue;
    if (git.existedAtBase(d)) return d;
    seen.add(d);
    const r = traceMove(d, git, seen);
    if (r === 'unknown') sawUnknown = true;
    else if (r) return r;
  }
  return sawUnknown ? 'unknown' : null;
}
