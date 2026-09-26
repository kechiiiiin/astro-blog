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

test.describe('トップ「いま」の BOOK 行（NoBu の読書記録）', () => {
  // playwright.config の webServer で NOBU_FEED_URL=tests/e2e/fixtures/nobu-feed.json を渡してビルドしている。
  // 先頭は「保留にした」、次が「読了」——保留は選ばれない
  test('最新の読書（保留を除く）が1行、版元ドットコムへ新しいタブで開く', async ({ page }) => {
    await page.goto('/');

    const bookRow = page.locator('.now-row', { has: page.locator('.now-tag', { hasText: /^BOOK・/ }) });
    await expect(bookRow).toHaveCount(1);
    await expect(bookRow.locator('.now-tag')).toHaveText('BOOK・読了');
    await expect(bookRow.locator('.now-title')).toHaveText('エラスティックリーダーシップ');
    await expect(bookRow.locator('.now-desc')).toHaveText(/Roy Osherove/);
    await expect(bookRow.locator('.now-date')).toHaveText(/^\d{4}-\d{2}-\d{2} \([日月火水木金土]\)$/);
    await expect(page.locator('.now-tag', { hasText: '保留' })).toHaveCount(0);

    // 行全体がリンク
    expect(await bookRow.evaluate((el) => el.tagName)).toBe('A');
    expect(await bookRow.getAttribute('href')).toBe('https://www.hanmoto.com/bd/isbn/9784873118024');
    expect(await bookRow.getAttribute('target')).toBe('_blank');
    expect(await bookRow.getAttribute('rel')).toBe('noopener noreferrer');

    // 表紙は左に小さく
    const cover = bookRow.locator('img.now-cover');
    await expect(cover).toHaveCount(1);
    const box = await cover.boundingBox();
    const leftBox = await bookRow.locator('.now-left').boundingBox();
    expect(box && leftBox && box.x < leftBox.x).toBeTruthy();

    // PODCAST 行より後ろ
    const tags = await page.locator('.now-row .now-tag').allTextContents();
    const lastPodcast = tags.map((t) => t.startsWith('PODCAST')).lastIndexOf(true);
    const bookIndex = tags.findIndex((t) => t.startsWith('BOOK'));
    if (lastPodcast >= 0) expect(bookIndex).toBeGreaterThan(lastPodcast);
  });

  test('札は太字', async ({ page }) => {
    await page.goto('/');
    const weights = await page.locator('.now-row .now-tag').evaluateAll((els) => els.map((el) => getComputedStyle(el).fontWeight));
    expect(weights.length).toBeGreaterThan(0);
    for (const w of weights) expect(Number(w)).toBeGreaterThanOrEqual(700);
  });
});

test.describe('トップのサイトマップ', () => {
  test('行のどこを押しても遷移する（説明文も a の中・a の入れ子なし）', async ({ page }) => {
    await page.goto('/');
    const items = page.locator('ul.sitemap-list > li');
    await expect(items).toHaveCount(4);
    for (const li of await items.all()) {
      const a = li.locator('> a');
      await expect(a).toHaveCount(1);
      await expect(a.locator('.desc')).toHaveCount(1);
      await expect(a.locator('a')).toHaveCount(0);
      // リンクが行の幅いっぱい
      const liBox = (await li.boundingBox())!;
      const aBox = (await a.boundingBox())!;
      expect(Math.abs(aBox.width - liBox.width)).toBeLessThan(1);
      expect(Math.abs(aBox.height - liBox.height)).toBeLessThan(2);
    }

    // 行の右端の余白を押しても遷移する
    const blog = page.locator('ul.sitemap-list a[href="/blog/"]');
    await blog.scrollIntoViewIfNeeded();
    const box = (await blog.boundingBox())!;
    await page.mouse.click(box.x + box.width - 5, box.y + 3);
    await expect(page).toHaveURL(/\/blog\/?$/);
  });
});
