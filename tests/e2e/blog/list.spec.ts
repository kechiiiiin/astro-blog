import { test, expect } from '@playwright/test';

// 一覧カードのリンク。PreviewCard は stretched link パターンで、
// <article><h2><a href="/blog/xxx">タイトル</a></h2>…<a href="/tags/…"> という構造。
// タイトルのアンカーの ::after がカード全面に広がり、カードのどこでもクリックできる。
// カード1枚につきタイトルのアンカーはちょうど1つなので、これを掴む。
const ARTICLE_CARD_LINK = 'section article h2 > a[href^="/blog/"]';

// カード内のタグリンク（カードのクリック面より手前に出ていること＝独立してクリックできること）
const TAG_LINK_IN_CARD = 'section article a[href^="/tags/"]';

test.describe('ブログ一覧ページ', () => {
  test('ブログ一覧が表示される', async ({ page }) => {
    await page.goto('/blog');

    // ページタイトルの確認
    const heading = page.getByRole('heading', { name: 'Blog' });
    await expect(heading).toBeVisible();

    // 記事プレビューの存在確認
    const articles = page.locator('article, .blog-preview');
    await expect(articles.first()).toBeVisible();
  });

  test('個別記事へのリンクが機能する', async ({ page }) => {
    await page.goto('/blog');

    // 最初の記事リンクをクリック
    const firstArticleLink = page.locator(ARTICLE_CARD_LINK).first();
    await expect(firstArticleLink).toBeVisible();

    const expectedHref = await firstArticleLink.getAttribute('href');
    // タイトルは h2 の中身＝このアンカーのテキストそのもの
    const expectedTitle = (await firstArticleLink.innerText()).trim();
    expect(expectedHref).toMatch(/^\/blog\/[a-z0-9_-]+$/i);
    expect(expectedTitle).not.toBe('');

    await firstArticleLink.click();

    // 個別記事ページに遷移していることを確認（microCMSのURL形式に対応）
    await expect(page).toHaveURL(/\/blog\/[a-z0-9_-]+/i);
    // クリックしたカードと同じ記事に遷移していること
    expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe(expectedHref);

    // 記事タイトルが表示される（Dev Toolbar が無いので h1 は記事タイトルのみ）
    const articleTitle = page.locator('h1');
    await expect(articleTitle).toBeVisible();
    await expect(articleTitle).toHaveText(expectedTitle);
  });

  test('カードのリンクが断片化しておらず、余白をクリックしても記事へ遷移する', async ({ page }) => {
    await page.goto('/blog');

    const cards = page.locator('section article');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    // カード1枚につき記事リンクはちょうど1つ（<a> の入れ子でアンカーが割れていないこと）
    expect(await page.locator(ARTICLE_CARD_LINK).count()).toBe(cardCount);

    // 中身が空でクリックできないアンカー断片が存在しないこと
    const emptyAnchorCount = await page
      .locator('section a')
      .evaluateAll((els) =>
        els.filter((el) => el.textContent.trim() === '' && !el.querySelector('img, svg')).length
      );
    expect(emptyAnchorCount).toBe(0);

    // タイトル以外（カード左上の余白）をクリックしても記事へ遷移する
    const firstCard = cards.first();
    const expectedHref = await firstCard.locator('h2 > a').getAttribute('href');
    await firstCard.click({ position: { x: 10, y: 10 } });
    expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe(expectedHref);
  });

  test('タグリンクは独立してクリックでき、キーボードでも到達できる', async ({ page }) => {
    await page.goto('/blog');

    const firstTagLink = page.locator(TAG_LINK_IN_CARD).first();
    await expect(firstTagLink).toBeVisible();
    const tagHref = await firstTagLink.getAttribute('href');
    expect(tagHref).toMatch(/^\/tags\/.+/);

    // タイトルリンクからTabで同じカードのタグリンクへ到達できる
    const firstCard = page.locator('section article').first();
    await firstCard.locator('h2 > a').focus();
    await page.keyboard.press('Tab');
    const focusedHref = await page.evaluate(() => document.activeElement?.getAttribute('href'));
    expect(focusedHref).toBe(await firstCard.locator('a[href^="/tags/"]').first().getAttribute('href'));

    // タグをクリックすると記事ではなくタグページへ遷移する（カードのクリック面に奪われない）
    await firstTagLink.click();
    expect(decodeURIComponent(new URL(page.url()).pathname).replace(/\/$/, '')).toBe(
      decodeURIComponent(tagHref)
    );
  });

  test('ページネーションが機能する', async ({ page }) => {
    await page.goto('/blog');

    // 1ページあたり10件・記事は11件以上あるため、1ページ目には必ず Next がある
    const nextPageLink = page.getByRole('link', { name: 'Next', exact: true });
    await expect(nextPageLink).toBeVisible();

    await nextPageLink.click();
    await expect(page).toHaveURL(/\/blog\/2\/?$/);

    // 2ページ目にも記事カードが並んでいる
    await expect(page.locator(ARTICLE_CARD_LINK).first()).toBeVisible();

    // 2ページ目からは Previous で1ページ目に戻れる
    const prevPageLink = page.getByRole('link', { name: 'Previous', exact: true });
    await expect(prevPageLink).toBeVisible();

    await prevPageLink.click();
    await expect(page).toHaveURL(/\/blog\/?$/);
    await expect(page.locator(ARTICLE_CARD_LINK).first()).toBeVisible();
  });

  test('ダークモードの切り替え', async ({ page }) => {
    await page.goto('/blog');

    // ダークモードトグルボタン（ThemeToggle.astro / aria-label="Toggle theme"）
    const darkModeToggle = page.getByRole('button', { name: 'Toggle theme' });
    await expect(darkModeToggle).toBeVisible();

    const html = page.locator('html');
    // 初期状態はライトモード
    await expect(html).not.toHaveClass(/dark/);

    await darkModeToggle.click();
    await expect(html).toHaveClass(/dark/);

    // もう一度押すとライトモードに戻る
    await darkModeToggle.click();
    await expect(html).not.toHaveClass(/dark/);
  });
});
