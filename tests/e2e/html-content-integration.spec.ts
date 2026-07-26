import { test, expect } from '@playwright/test';

test.describe('HTMLコンテンツ統合テスト', () => {
  test.describe('検索機能', () => {
    test('検索モーダルが開く', async ({ page }) => {
      await page.goto('/');

      const searchButton = page.locator('#search-button, button:has-text("Search")');
      if (await searchButton.isVisible()) {
        await searchButton.click();

        const searchModal = page.locator('#search-modal, [role="dialog"]');
        await expect(searchModal).toBeVisible();
      }
    });

    test('記事が検索できる', async ({ page }) => {
      await page.goto('/');

      const searchButton = page.locator('#search-button, button:has-text("Search")');
      if (await searchButton.isVisible()) {
        await searchButton.click();

        const searchInput = page.locator('#search-input, input[type="search"]');
        await searchInput.fill('test');

        // デバウンス待機
        await page.waitForTimeout(500);

        const searchResults = page.locator('#search-results, .search-results');
        const resultsText = await searchResults.textContent();
        expect(resultsText).toBeTruthy();
      }
    });

    test('検索結果から記事に遷移できる', async ({ page }) => {
      await page.goto('/');

      const searchButton = page.locator('#search-button, button:has-text("Search")');
      if (await searchButton.isVisible()) {
        await searchButton.click();

        const searchInput = page.locator('#search-input, input[type="search"]');
        await searchInput.fill('blog');
        await page.waitForTimeout(500);

        const resultLinks = page.locator('#search-results a, .search-results a');
        if (await resultLinks.count() > 0) {
          await resultLinks.first().click();
          await expect(page).toHaveURL(/\/(blog|diary|emonicle)\//);
        }
      }
    });
  });

  test.describe('タグ機能', () => {
    test('タグ一覧ページが表示される', async ({ page }) => {
      await page.goto('/tags');

      const heading = page.getByRole('heading', { name: /tags/i });
      await expect(heading).toBeVisible();
    });

    test('タグ別記事が表示される', async ({ page }) => {
      await page.goto('/blog');

      const tagLinks = page.locator('a[href^="/tags/"]');
      if (await tagLinks.count() > 0) {
        const firstTag = tagLinks.first();
        await firstTag.click();

        await expect(page).toHaveURL(/\/tags\/[^/]+/);

        const heading = page.locator('h1').first();
        await expect(heading).toBeVisible();
      }
    });
  });

  test.describe('アーカイブページ', () => {
    test('アーカイブページが表示される', async ({ page }) => {
      await page.goto('/archive');

      const heading = page.getByRole('heading', { name: /archive/i });
      await expect(heading).toBeVisible();

      const yearHeadings = page.locator('h2');
      expect(await yearHeadings.count()).toBeGreaterThan(0);
    });

    test('アーカイブから記事に遷移できる', async ({ page }) => {
      await page.goto('/archive');

      const articleLinks = page.locator('a[href^="/blog/"]');
      if (await articleLinks.count() > 0) {
        await articleLinks.first().click();
        await expect(page).toHaveURL(/\/blog\/[a-z0-9_-]+/i);
      }
    });
  });

  test.describe('HTMLコンテンツレンダリング', () => {
    test('format:html 記事のHTMLが正しく表示される', async ({ page }) => {
      await page.goto('/blog');

      // 一覧カードのリンク（記事タイトル h2 の中のアンカー）。
      // PreviewCard は stretched link パターンで、タイトルのアンカーがカード全面の
      // クリック領域を担う。`article a` ではタグリンクを掴んでしまうため h2 配下に限定する。
      const firstArticle = page.locator('section article h2 > a[href^="/blog/"]').first();
      await expect(firstArticle).toBeVisible();
      await firstArticle.click();
      await expect(page).toHaveURL(/\/blog\/[a-z0-9_-]+/i);

      // コンテンツエリアが表示される
      const content = page.locator('article, .prose').first();
      await expect(content).toBeVisible();

      // HTMLタグが正しくレンダリングされている（生のHTMLタグが見えない）
      const bodyText = await content.textContent();
      expect(bodyText).not.toContain('<div');
      expect(bodyText).not.toContain('<p>');
    });
  });
});
