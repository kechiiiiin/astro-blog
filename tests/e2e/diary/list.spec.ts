import { test, expect } from '@playwright/test';

// Pagination.astro のページ送りリンク（2026-09 リニューアルで Next / Previous から日本語に）
const NEXT_LABEL = '古い記事 ›';
const PREV_LABEL = '‹ 新しい記事';

// 一覧の行のリンク。ListRow は stretched link パターンで、
// <article><h2><a href="/diary/YYYY/MM/DD">タイトル</a></h2>…</article> という構造。
// タイトルのアンカーの ::after がカード全面に広がり、カードのどこでもクリックできる。
const ENTRY_CARD_LINK = 'section article h2 > a[href^="/diary/"]';

test.describe('日記一覧ページ', () => {
  test('日記一覧が表示される', async ({ page }) => {
    await page.goto('/diary');

    // 2026-09 リニューアルで見出しは「日記」
    const heading = page.getByRole('heading', { name: '日記', level: 1 });
    await expect(heading).toBeVisible();

    const entries = page.locator('article, .diary-preview');
    const count = await entries.count();
    expect(count).toBeGreaterThan(0);
  });

  test('個別日記へのリンクが機能する', async ({ page }) => {
    await page.goto('/diary');

    const firstEntryLink = page.locator(ENTRY_CARD_LINK).first();
    await expect(firstEntryLink).toBeVisible();

    const expectedHref = await firstEntryLink.getAttribute('href');
    // タイトルは h2 の中身＝このアンカーのテキストそのもの
    const expectedTitle = (await firstEntryLink.innerText()).trim();
    expect(expectedHref).toMatch(/^\/diary\/\d{4}\/\d{2}\/\d{2}$/);
    expect(expectedTitle).not.toBe('');

    await firstEntryLink.click();

    // 日付形式のURL（YYYY/MM/DD）
    await expect(page).toHaveURL(/\/diary\/\d{4}\/\d{2}\/\d{2}/);
    // クリックしたカードと同じ日記に遷移していること
    expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe(expectedHref);

    const entryTitle = page.locator('h1');
    await expect(entryTitle).toBeVisible();
    await expect(entryTitle).toHaveText(expectedTitle);
  });

  test('ページネーションが機能する', async ({ page }) => {
    await page.goto('/diary');

    // 1ページあたり10件・日記は11件以上あるため、1ページ目には必ず「古い記事」がある
    const nextPageLink = page.getByRole('link', { name: NEXT_LABEL, exact: true });
    await expect(nextPageLink).toBeVisible();

    await nextPageLink.click();
    await expect(page).toHaveURL(/\/diary\/2\/?$/);

    const entries = page.locator('article, .diary-preview');
    expect(await entries.count()).toBeGreaterThan(0);
    await expect(page.locator(ENTRY_CARD_LINK).first()).toBeVisible();

    // 2ページ目からは「新しい記事」で1ページ目に戻れる
    const prevPageLink = page.getByRole('link', { name: PREV_LABEL, exact: true });
    await expect(prevPageLink).toBeVisible();

    await prevPageLink.click();
    await expect(page).toHaveURL(/\/diary\/?$/);
    await expect(page.locator(ENTRY_CARD_LINK).first()).toBeVisible();
  });
});
