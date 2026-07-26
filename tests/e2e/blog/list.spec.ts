import { test, expect } from '@playwright/test';

// 一覧カードのリンク。
// PreviewCard は <a href="/blog/xxx"><article>…<h2>タイトル</h2>…</article></a> という構造だが、
// BlogPreview はカード内にタグリンク（入れ子の <a>）を持つため、ブラウザのHTMLパーサが
// 外側の <a> を分割し、中身の無い（＝クリックできない）アンカー断片が生まれる。
// そのため「記事タイトル(h2)を含むアンカー」に限定して、確実にクリック可能な要素を掴む。
const ARTICLE_CARD_LINK = 'section a[href^="/blog/"]:has(h2)';

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
    const expectedTitle = (await firstArticleLink.locator('h2').innerText()).trim();
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
