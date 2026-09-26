import { test, expect } from '@playwright/test';

// 表紙・日記の写真は外部の画像なので、load を待つと回線しだいで遅れる。DOM ができたら見る

// 日記の本文の直後（はてなスターの上）の「この日に読んだ本」。
// ビルド時の NoBu は固定データ（tests/e2e/fixtures/nobu-feed.json の reading_days・playwright.config.ts の env）
test.describe('日記「この日に読んだ本」（NoBu の読んだ日）', () => {
  test('本がある日は、本文の直後・はてなスターの上に見出しと行が出る', async ({ page }) => {
    await page.goto('/diary/2026/09/25', { waitUntil: 'domcontentloaded' });
    const section = page.locator('[data-diary-books]');
    await expect(section).toHaveCount(1);
    await expect(section.locator('h2.dbook-head')).toHaveText('この日に読んだ本');
    expect(await section.locator('.dbook-title').allTextContents()).toEqual(['福岡市の問題解決', 'エラスティックリーダーシップ']);
    expect(await section.locator('.dbook-author').allTextContents()).toEqual(['高島宗一郎', 'Roy Osherove/島田 浩二']);

    // 位置: 本文（.diary-content）の中で、はてなスターの直前
    const order = await page.evaluate(() => {
      const s = document.querySelector('[data-diary-books]')!;
      const star = document.querySelector('[data-hatena-star-container]')!;
      return {
        inContent: Boolean(s.closest('.diary-content')),
        nextIsStar: s.nextElementSibling === star,
      };
    });
    expect(order).toEqual({ inContent: true, nextIsStar: true });
  });

  test('行全体が版元ドットコムへのリンク（新しいタブ）', async ({ page }) => {
    await page.goto('/diary/2026/09/25', { waitUntil: 'domcontentloaded' });
    const rows = page.locator('[data-diary-books] a.dbook-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAttribute('href', 'https://www.hanmoto.com/bd/isbn/9784478124130');
    await expect(rows.first()).toHaveAttribute('target', '_blank');
    await expect(rows.first()).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(rows.nth(1)).toHaveAttribute('href', 'https://www.hanmoto.com/bd/isbn/9784873118024');
  });

  test('表紙は 34×48（本文の img 全幅に負けない）', async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/diary/2026/09/25', { waitUntil: 'domcontentloaded' });
      const covers = page.locator('[data-diary-books] img.dbook-cover');
      await expect(covers).toHaveCount(2);
      for (const i of [0, 1]) {
        const box = await covers.nth(i).boundingBox();
        expect(box, `${width}px`).not.toBeNull();
        expect(Math.round(box!.width)).toBe(34);
        expect(Math.round(box!.height)).toBe(48);
      }
      // 横スクロールが出ない
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test('ISBN が無い本はリンクにならず、表紙が無い本は img を出さない', async ({ page }) => {
    await page.goto('/diary/2026/09/23', { waitUntil: 'domcontentloaded' });
    const section = page.locator('[data-diary-books]');
    expect(await section.locator('.dbook-title').allTextContents()).toEqual([
      '86-エイティシックスーEp.12 ─ホーリィ・ブルー・ブレット─',
      'ゆとりの法則',
      '読書思考トレーニング',
    ]);
    const rows = section.locator('.dbook-row');
    // ISBN 無し → <div>
    await expect(rows.nth(1)).toHaveJSProperty('tagName', 'DIV');
    await expect(rows.nth(1).locator('img.dbook-cover')).toHaveCount(1);
    // 表紙無し → img 無し（リンクにはなる）
    await expect(rows.nth(2)).toHaveJSProperty('tagName', 'A');
    await expect(rows.nth(2).locator('img')).toHaveCount(0);
  });

  test('本が無い日は何も出さない（見出しも）', async ({ page }) => {
    await page.goto('/diary/2026/09/24', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1.page-date')).toBeVisible();
    await expect(page.locator('[data-diary-books]')).toHaveCount(0);
    await expect(page.getByText('この日に読んだ本')).toHaveCount(0);
  });
});
