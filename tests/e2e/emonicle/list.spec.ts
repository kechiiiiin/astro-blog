import { test, expect } from '@playwright/test';

// 一覧カードのリンク。EmoniclePreview / PreviewCard は
// <a href="/emonicle/xxx"><article>…<h2>タイトル</h2>…</article></a> という構造なので、
// `article a`（記事の「中」のリンク）ではなく、記事を包むアンカー自体を掴む必要がある。
const ARTICLE_CARD_LINK = 'section a[href^="/emonicle/"]:has(h2)';

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
    const expectedTitle = (await firstArticle.locator('h2').innerText()).trim();
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
