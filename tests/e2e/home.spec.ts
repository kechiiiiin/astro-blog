import { test, expect } from '@playwright/test';

test.describe('ホームページ', () => {
  test('トップページが正しく表示される', async ({ page }) => {
    await page.goto('/');

    // タイトルの確認
    await expect(page).toHaveTitle(/まあ、そうかもしれない/);

    // メインコンテンツの確認
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();
  });

  test('ソーシャルリンクが表示される', async ({ page }) => {
    await page.goto('/');

    // SocialLinksコンポーネントの確認
    const socialLinks = page.locator('a[target="_blank"]');
    await expect(socialLinks.first()).toBeVisible();
  });

  test('ナビゲーションリンクが機能する', async ({ page }) => {
    await page.goto('/');

    // Blogリンクをクリック（ナビゲーション内の最初のBlogリンク）
    await page.getByRole('link', { name: 'Blog', exact: true }).first().click();

    // URLの確認
    await expect(page).toHaveURL(/\/blog/);
  });

  test('「いま」に最新の日記・最新のブログが出て、日付は YYYY-MM-DD (曜)', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'いま', level: 2 })).toBeVisible();

    const diaryRow = page.locator('a.now-row', { has: page.locator('.now-tag', { hasText: 'DIARY' }) });
    await expect(diaryRow).toHaveCount(1);
    expect(await diaryRow.getAttribute('href')).toMatch(/^\/diary\/\d{4}\/\d{2}\/\d{2}$/);
    await expect(diaryRow.locator('.now-date')).toHaveText(/^\d{4}-\d{2}-\d{2} \([日月火水木金土]\)$/);

    const blogRow = page.locator('a.now-row', { has: page.locator('.now-tag', { hasText: 'BLOG' }) });
    await expect(blogRow).toHaveCount(1);
    expect(await blogRow.getAttribute('href')).toMatch(/^\/blog\/.+/);
  });
});

test.describe('平成ページ', () => {
  test('/heisei は リニューアル対象外で旧レイアウトのまま残る', async ({ page }) => {
    const response = await page.goto('/heisei');
    expect(response?.status()).toBe(200);

    // 平成風の中身が出ている
    await expect(page.getByText('ようこそ！けちーんのホームページへ！')).toBeVisible();
    // 新しいヘッダー（.site-header）ではなく旧レイアウト
    await expect(page.locator('.site-header')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/katachi/);
  });
});
