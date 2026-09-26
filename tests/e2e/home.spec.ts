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

  test('「いま」は小見出し 日記／ブログ／ポッドキャスト／本 で区切り、日付は YYYY-MM-DD (曜)', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'いま', level: 2 })).toBeVisible();
    const subheads = await page.locator('h3.now-subhead').allTextContents();
    expect(subheads).toEqual(['日記', 'ブログ', 'ポッドキャスト', '本']);

    const diaryRow = page.locator('[data-now="diary"] a.now-row');
    await expect(diaryRow).toHaveCount(1);
    expect(await diaryRow.getAttribute('href')).toMatch(/^\/diary\/\d{4}\/\d{2}\/\d{2}$/);
    await expect(diaryRow.locator('.now-date')).toHaveText(/^\d{4}-\d{2}-\d{2} \([日月火水木金土]\)$/);

    const blogRow = page.locator('[data-now="blog"] a.now-row');
    await expect(blogRow).toHaveCount(1);
    expect(await blogRow.getAttribute('href')).toMatch(/^\/blog\/.+/);

    // DIARY・BLOG の札は無い。ポッドキャストは番組名だけの札（太字）
    await expect(page.locator('[data-now="diary"] .now-tag, [data-now="blog"] .now-tag')).toHaveCount(0);
    const podcastTags = await page.locator('[data-now="podcast"] .now-tag').allTextContents();
    for (const t of podcastTags) expect(t).not.toMatch(/PODCAST/);
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

test.describe('トップ「いま」の「本」（NoBu の読書記録）', () => {
  // playwright.config の webServer で NOBU_FEED_URL=tests/e2e/fixtures/nobu-feed.json・NOBU_TODAY=2026-09-26 でビルドしている
  test('読んでいる／最近読み終えた／最近買った に分かれ、新しい順・保留は出ない', async ({ page }) => {
    await page.goto('/');
    const book = page.locator('[data-now="book"]');
    expect(await book.locator('h4.now-minorhead').allTextContents()).toEqual(['読んでいる', '最近読み終えた', '最近買った']);

    const titlesOf = (key: string) => book.locator(`[data-book="${key}"] .now-title`).allTextContents();
    // 読んでいるの「新しい」は最後に動いた日（読んだ日・読み始めた日の遅い方）
    expect(await titlesOf('reading')).toEqual(['福岡市の問題解決', '86-エイティシックスーEp.12 ─ホーリィ・ブルー・ブレット─']);
    expect(await titlesOf('finished')).toEqual(['エラスティックリーダーシップ', '読書思考トレーニング']);
    expect(await titlesOf('bought')).toEqual(['ゆとりの法則', '人文知は武器になる']);
    await expect(book.getByText('失敗の本質')).toHaveCount(0);

    // 日付: 読んでいる＝読み始めた日〜、読み終えた＝読了日、買った＝買った日
    await expect(book.locator('[data-book="reading"] .now-row').first().locator('.now-date')).toHaveText('2026-09-22 (火)〜');
    await expect(book.locator('[data-book="finished"] .now-row').first().locator('.now-date')).toHaveText('2026-09-26 (土)');
    await expect(book.locator('[data-book="bought"] .now-row').first().locator('.now-date')).toHaveText('2026-09-24 (木)');
  });

  test('ISBN があれば行全体が版元ドットコムへ新しいタブ・無ければリンクにしない／表紙が無ければ画像を出さない', async ({ page }) => {
    await page.goto('/');
    const book = page.locator('[data-now="book"]');

    const done = book.locator('[data-book="finished"] .now-row').first();
    expect(await done.evaluate((el) => el.tagName)).toBe('A');
    expect(await done.getAttribute('href')).toBe('https://www.hanmoto.com/bd/isbn/9784873118024');
    expect(await done.getAttribute('target')).toBe('_blank');
    expect(await done.getAttribute('rel')).toBe('noopener noreferrer');
    await expect(done.locator('.now-desc')).toHaveText(/Roy Osherove/);
    const cover = done.locator('img.now-cover');
    await expect(cover).toHaveCount(1);
    const box = await cover.boundingBox();
    const leftBox = await done.locator('.now-left').boundingBox();
    expect(box && leftBox && box.x < leftBox.x).toBeTruthy();

    const noIsbn = book.locator('[data-book="bought"] .now-row').first();
    expect(await noIsbn.evaluate((el) => el.tagName)).toBe('DIV');

    const noCover = book.locator('[data-book="finished"] .now-row').nth(1);
    await expect(noCover.locator('img')).toHaveCount(0);
  });

  test('ポッドキャストの札（番組名）は太字', async ({ page }) => {
    await page.goto('/');
    const weights = await page.locator('.now-row .now-tag').evaluateAll((els) => els.map((el) => getComputedStyle(el).fontWeight));
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
