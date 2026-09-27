#!/usr/bin/env node
// 新規追加された日記エントリの「X 投稿画面リンク（Web Intent）」を Discord へ送る。
//
// GitHub Actions の deploy ワークフローから、デプロイ成功後に呼ばれる。
// BEFORE_SHA..AFTER_SHA の差分で「追加された」日記ファイルだけを拾うので、
// update(diary): / delete(diary): のコミットでは何も送らない（重複防止）。
// 日付を変えただけの日記（同じ commit で公開済みの日記を消して足したもの）も送らない
// （excludeMovedDiaries。かけら帳の move(diary): や GitHub の画面での改名）。
//
// 2026-09-27: 以前は X API（OAuth 1.0a・$0.20/件）で直接投稿していたが、費用ゼロ化のため
// 投稿画面リンクを Discord に送るだけにした。開いて「ポスト」を押すのは Keisuke 自身。
//
// 必要な環境変数:
//   DISCORD_DEPLOY_WEBHOOK_URL … 送り先（既存の deploy 通知と共用。新しい secret は作らない）
//   BEFORE_SHA / AFTER_SHA … 差分の範囲（push イベントの github.event.before / github.sha）
//   SITE_URL   … 省略時 https://www.kechiiiiin.com
//   FORCE_FILE … 指定すると差分を見ずにそのファイルだけ対象にする（送り直し用・BEFORE_SHA 不要）
//   DRY_RUN=1  … Discord へ送らず、送る予定の JSON を標準出力するだけ

import { execFileSync } from 'node:child_process';
import {
  parseFrontmatter,
  getDiaryPath,
  isPublished,
  buildDiaryDiscordPayload,
  excludeMovedDiaries,
} from './lib/diary-post.mjs';

const DIARY_DIR = 'src/content/diary/';

const {
  DISCORD_DEPLOY_WEBHOOK_URL = '',
  BEFORE_SHA = '',
  AFTER_SHA = '',
  SITE_URL = 'https://www.kechiiiiin.com',
  DRY_RUN = '',
  FORCE_FILE = '',
} = process.env;

const dryRun = DRY_RUN === '1';

function notice(msg) {
  console.log(`::notice::${msg}`);
}
function error(msg) {
  console.log(`::error::${msg}`);
}

/** git を叩く。失敗時は null（ファイル不在などを握りつぶすため）。 */
function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

async function main() {
  // webhook URL が無ければ黙って（notice だけ残して）スキップ。
  // シークレット未設定の環境でデプロイを失敗させないための逃げ道。
  if (!dryRun && !DISCORD_DEPLOY_WEBHOOK_URL) {
    notice('日記の投稿リンク送信をスキップしました（DISCORD_DEPLOY_WEBHOOK_URL が未設定）');
    return 0;
  }

  const added = FORCE_FILE ? [FORCE_FILE.trim()] : await listAddedDiaries();
  if (added === null) return 1;
  if (FORCE_FILE) notice(`FORCE_FILE 指定のため ${FORCE_FILE} を送り直します`);

  if (added.length === 0) {
    notice('新規の日記エントリはありませんでした（投稿リンク送信なし）');
    return 0;
  }

  const posts = [];

  for (const path of added) {
    // 範囲内で追加後に削除された場合など、AFTER 時点に存在しないものは飛ばす
    const raw = git(['show', `${AFTER_SHA || 'HEAD'}:${path}`]);
    if (raw === null) {
      notice(`${path} は ${AFTER_SHA || 'HEAD'} 時点に存在しないためスキップします`);
      continue;
    }

    const fm = parseFrontmatter(raw);
    if (!fm.title || !fm.pubDate) {
      notice(`${path} は title / pubDate が読めなかったためスキップします`);
      continue;
    }
    if (fm.draft) {
      notice(`${path} は draft のためスキップします`);
      continue;
    }

    const date = new Date(fm.pubDate);
    if (Number.isNaN(date.getTime())) {
      notice(`${path} の pubDate が解釈できないためスキップします: ${fm.pubDate}`);
      continue;
    }
    if (!isPublished(date)) {
      notice(`${path} は公開日が未来（${fm.pubDate}）のためスキップします`);
      continue;
    }

    const url = `${SITE_URL.replace(/\/$/, '')}${getDiaryPath(date)}`;
    posts.push({ path, title: fm.title, url });
  }

  if (posts.length === 0) {
    notice('送信対象の日記はありませんでした');
    return 0;
  }

  return (await sendAll(posts)) ? 0 : 1;
}

/**
 * BEFORE_SHA..AFTER_SHA で追加された日記ファイル一覧。
 * 差分が取れない状況（初回 push 等）は [] を、git 自体の失敗は null を返す。
 */
async function listAddedDiaries() {
  // 初回 push や workflow_dispatch では before が空／全ゼロになり差分が取れない
  if (!BEFORE_SHA || /^0+$/.test(BEFORE_SHA)) {
    notice('投稿リンク送信をスキップしました（BEFORE_SHA が無いため差分を取得できません）');
    return [];
  }
  if (!AFTER_SHA) {
    notice('投稿リンク送信をスキップしました（AFTER_SHA が未設定）');
    return [];
  }

  // ⚠️ A の判定は git の既定の rename 検出に頼っている（似た中身の改名は R になり A に出ない）。
  // 本文が大きく変わった改名は A に出るので、下の excludeMovedDiaries で移動を除く。
  // ここに --no-renames は付けない（rename 検出も再送防止の一段なので）。
  const diffOut = git([
    'diff',
    '--diff-filter=A',
    '--name-only',
    BEFORE_SHA,
    AFTER_SHA,
    '--',
    DIARY_DIR,
  ]);
  if (diffOut === null) {
    error(`git diff に失敗しました（${BEFORE_SHA}..${AFTER_SHA}）。fetch-depth を確認してください`);
    return null;
  }

  const added = diffOut
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.md'));

  const { post, moved, unknown } = excludeMovedDiaries(added, {
    addingCommit: (path) => {
      const out = git(['log', '--no-renames', '--diff-filter=A', '--format=%H', `${BEFORE_SHA}..${AFTER_SHA}`, '--', path]);
      if (out === null) return null;
      return out.split('\n').map((l) => l.trim()).find(Boolean);
    },
    deletedDiariesIn: (sha) => {
      const out = git(['show', '--no-renames', '--name-status', '--format=', sha, '--', DIARY_DIR]);
      if (out === null) return null;
      return out
        .split('\n')
        .map((l) => l.split('\t'))
        .filter(([status, p]) => status === 'D' && p?.endsWith('.md'))
        .map(([, p]) => p);
    },
    existedAtBase: (path) => git(['cat-file', '-e', `${BEFORE_SHA}:${path}`]) !== null,
  });
  for (const m of moved) notice(`${m.path} は ${m.from} から日付を変えただけなので送りません`);
  for (const p of unknown) {
    error(`${p} が移動かどうか git で確かめられなかったため送りません（新しい日記なら x_post_file で送り直してください）`);
  }
  return post;
}

/** 組み立てた Discord ペイロードを1件ずつ送る。1件でも失敗したら全件試したうえで exit 1。 */
async function sendAll(posts) {
  let failed = false;
  for (const { path, title, url } of posts) {
    const payload = buildDiaryDiscordPayload(title, url);
    if (dryRun) {
      console.log(`--- DRY RUN: ${path} ---`);
      console.log(JSON.stringify(payload, null, 2));
      continue;
    }
    const ok = await sendToDiscord(payload, path);
    if (!ok) failed = true;
  }
  return !failed;
}

async function sendToDiscord(payload, path) {
  const res = await fetch(DISCORD_DEPLOY_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    // webhook URL は本文にもログにも出さない（body は Discord からのレスポンスのみ）
    error(`日記の投稿リンク送信に失敗しました (${path}): status=${res.status} body=${body}`);
    return false;
  }

  console.log(`日記の投稿リンクを Discord に送りました (${path})`);
  return true;
}

// --- エントリポイント -------------------------------------------------------

try {
  process.exitCode = await main();
} catch (e) {
  error(`予期しないエラー: ${e?.message ?? e}`);
  process.exitCode = 1;
}
