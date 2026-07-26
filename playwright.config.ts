import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2Eテスト設定
 *
 * 特徴:
 * - ヘッド付きモード（ブラウザ表示）をデフォルトに設定
 * - ビルド済みの本番相当（astro build + astro preview）に対してテストする
 * - Vitestとの共存を考慮したディレクトリ構成
 *
 * 開発サーバー（astro dev）ではなく preview を使う理由:
 * - astro dev は Dev Toolbar のUI（"No islands detected." 等の h1 を含む）を
 *   ページに注入するため、`h1` のような素直なセレクタが strict mode 違反になる
 * - 本番にデプロイされる成果物（dist/）そのものを検証できる
 *
 * ポートは開発サーバーの 4321 と衝突しないよう 4322 を使い、
 * reuseExistingServer は無効にして「必ずビルド済み成果物を見る」ことを保証する。
 */
const E2E_PORT = 4322;
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  // テストファイルの配置場所
  testDir: './tests/e2e',

  // 並列実行の無効化（ヘッド付きモードで見やすくするため）
  fullyParallel: false,
  workers: 1,

  // タイムアウト設定
  timeout: 30 * 1000, // 30秒
  expect: {
    timeout: 5000, // 5秒
  },

  // 失敗時のリトライ（CI環境のみ）
  retries: process.env.CI ? 2 : 0,

  // レポート設定
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // テスト実行時の設定
  use: {
    // ベースURL（ビルド済み成果物のプレビューサーバー）
    baseURL: E2E_BASE_URL,

    // トレース記録（失敗時のみ）
    trace: 'on-first-retry',

    // スクリーンショット（失敗時のみ）
    screenshot: 'only-on-failure',

    // ビデオ録画（失敗時のみ）
    video: 'retain-on-failure',

    // ヘッド付きモード（ブラウザ表示）
    headless: false,

    // スローモーション（デバッグ用、ミリ秒）
    launchOptions: {
      slowMo: 500, // 0.5秒のスローモーション
    },
  },

  // ブラウザ設定
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // 必要に応じて他のブラウザを追加
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // ビルド + プレビューサーバーの自動起動（本番相当の成果物を検証する）
  webServer: {
    command: `npm run build && npx astro preview --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    // 既存サーバーを流用しない（古い dist や dev サーバーを掴まないため）
    reuseExistingServer: false,
    timeout: 180 * 1000, // 3分（ビルド時間を含む）
  },
});
