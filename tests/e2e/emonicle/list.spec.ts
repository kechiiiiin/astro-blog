import { test, expect } from '@playwright/test';

// 一覧カードのリンク。EmoniclePreview / PreviewCard は stretched link パターンで、
// <article><h2><a href="/emonicle/xxx">タイトル</a></h2>…</article> という構造。
// タイトルのアンカーの ::after がカード全面に広がり、カードのどこでもクリックできる。
const ARTICLE_CARD_LINK = 'section article h2 > a[href^="/emonicle/"]';

// Pagination.astro の pageSize（[...page].astro の paginate 設定と揃える）
const PAGE_SIZE = 10;

test.describe('Emonicle一覧ページ', () => {
  test('Emonicle一覧が表示される', async ({ page }) => {
    await page.goto('/emonicle');

    const heading = page.getByRole('heading', { name: 'Emonicle' });
    await expect(heading).toBeVisible();
  });

  test('個別Emonicle記事へのリンクが機能する', async ({ page }) => {
    await page.goto('/emonicle');

    const firstArticle = page.locator(ARTICLE_CARD_LINK).first();
    await expect(firstArticle).toBeVisible();

    const expectedHref = await firstArticle.getAttribute('href');
    // タイトルは h2 の中身＝このアンカーのテキストそのもの
    const expectedTitle = (await firstArticle.innerText()).trim();
    expect(expectedHref).toMatch(/^\/emonicle\/[a-z0-9_-]+$/i);
    expect(expectedTitle).not.toBe('');

    await firstArticle.click();

    await expect(page).toHaveURL(/\/emonicle\/[a-z0-9_-]+/i);
    expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe(expectedHref);

    const title = page.locator('h1');
    await expect(title).toBeVisible();
    await expect(title).toHaveText(expectedTitle);
  });

  test('ページネーションが機能する', async ({ page }) => {
    await page.goto('/emonicle');

    const nextPageLink = page.getByRole('link', { name: 'Next', exact: true });

    // Emonicle は件数が少なくページ数が変動しうるため、
    // 「Next がある／ない」どちらの場合も必ず何かを検証する（無条件のスキップにはしない）
    if ((await nextPageLink.count()) > 0) {
      await nextPageLink.click();
      await expect(page).toHaveURL(/\/emonicle\/2\/?$/);
      await expect(page.locator(ARTICLE_CARD_LINK).first()).toBeVisible();

      const prevPageLink = page.getByRole('link', { name: 'Previous', exact: true });
      await expect(prevPageLink).toBeVisible();
      await prevPageLink.click();
      await expect(page).toHaveURL(/\/emonicle\/?$/);
    } else {
      // 1ページに収まっている場合: Previous も無く、記事数も1ページ分以内で、2ページ目は存在しない
      await expect(page.getByRole('link', { name: 'Previous', exact: true })).toHaveCount(0);
      expect(await page.locator(ARTICLE_CARD_LINK).count()).toBeLessThanOrEqual(PAGE_SIZE);

      const response = await page.request.get('/emonicle/2');
      expect(response.status()).toBe(404);
    }
  });
});
