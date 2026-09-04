#!/usr/bin/env node
// 新規追加された日記エントリを X（Twitter）へ自動投稿する。
//
// GitHub Actions の deploy ワークフローから、デプロイ成功後に呼ばれる。
// BEFORE_SHA..AFTER_SHA の差分で「追加された」日記ファイルだけを拾うので、
// update(diary): / delete(diary): のコミットでは何も投稿しない（重複投稿の防止）。
//
// 必要な環境変数:
//   X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET  … OAuth 1.0a user context
//   BEFORE_SHA / AFTER_SHA … 差分の範囲（push イベントの github.event.before / github.sha）
//   SITE_URL   … 省略時 https://www.kechiiiiin.com
//   DRY_RUN=1  … 本文を組み立てて表示するだけで HTTP は投げない

import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  parseFrontmatter,
  getDiaryPath,
  isPublished,
  composeText,
  buildAuthHeader,
} from './lib/x-post.mjs';

const X_TWEETS_ENDPOINT = 'https://api.x.com/2/tweets';
const DIARY_DIR = 'src/content/diary/';

const {
  X_API_KEY = '',
  X_API_SECRET = '',
  X_ACCESS_TOKEN = '',
  X_ACCESS_TOKEN_SECRET = '',
  BEFORE_SHA = '',
  AFTER_SHA = '',
  SITE_URL = 'https://www.kechiiiiin.com',
  DRY_RUN = '',
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
  // 認証情報が揃っていなければ黙って（notice だけ残して）スキップ。
  // シークレット未設定の環境でデプロイを失敗させないための逃げ道。
  const creds = [X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET];
  if (!dryRun && creds.some((c) => !c)) {
    notice('X への投稿をスキップしました（X_* シークレットが未設定）');
    return 0;
  }

  // 初回 push や workflow_dispatch では before が空／全ゼロになり差分が取れない
  if (!BEFORE_SHA || /^0+$/.test(BEFORE_SHA)) {
    notice('X への投稿をスキップしました（BEFORE_SHA が無いため差分を取得できません）');
    return 0;
  }
  if (!AFTER_SHA) {
    notice('X への投稿をスキップしました（AFTER_SHA が未設定）');
    return 0;
  }

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
    return 1;
  }

  const added = diffOut
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.md'));

  if (added.length === 0) {
    notice('新規の日記エントリはありませんでした（X への投稿なし）');
    return 0;
  }

  const posts = [];

  for (const path of added) {
    // 範囲内で追加後に削除された場合など、AFTER 時点に存在しないものは飛ばす
    const raw = git(['show', `${AFTER_SHA}:${path}`]);
    if (raw === null) {
      notice(`${path} は ${AFTER_SHA} 時点に存在しないためスキップします`);
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
    posts.push({ path, text: composeText(fm.title, url) });
  }

  if (posts.length === 0) {
    notice('投稿対象の日記はありませんでした');
    return 0;
  }

  return (await postAll(posts)) ? 0 : 1;
}

/** 組み立てた本文を順に投稿する。1件でも失敗したら全件試したうえで exit 1。 */
async function postAll(posts) {
  let failed = false;
  for (const { path, text } of posts) {
    if (dryRun) {
      console.log(`--- DRY RUN: ${path} ---`);
      console.log(text);
      console.log(`--- (${[...text].length} 文字) ---`);
      continue;
    }
    const ok = await postTweet(text, path);
    if (!ok) failed = true;
  }
  return !failed;
}

async function postTweet(text, path) {
  const authorization = buildAuthHeader({
    method: 'POST',
    url: X_TWEETS_ENDPOINT,
    consumerKey: X_API_KEY,
    consumerSecret: X_API_SECRET,
    token: X_ACCESS_TOKEN,
    tokenSecret: X_ACCESS_TOKEN_SECRET,
    nonce: randomBytes(32).toString('hex'),
    timestamp: Math.floor(Date.now() / 1000),
    // JSON ボディのパラメータは OAuth 1.0a の署名対象に含めない
    extraParams: {},
  });

  const res = await fetch(X_TWEETS_ENDPOINT, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();

  if (!res.ok) {
    // シークレットは本文にもヘッダにも出さない（body は X からのレスポンスのみ）
    error(`X への投稿に失敗しました (${path}): status=${res.status} body=${body}`);
    return false;
  }

  let id = '(unknown)';
  try {
    id = JSON.parse(body)?.data?.id ?? id;
  } catch {
    /* JSON でなくても致命ではない */
  }
  console.log(`X へ投稿しました (${path}): status=${res.status} id=${id}`);
  return true;
}

// --- エントリポイント -------------------------------------------------------

try {
  process.exitCode = await main();
} catch (e) {
  error(`予期しないエラー: ${e?.message ?? e}`);
  process.exitCode = 1;
}
