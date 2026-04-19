#!/usr/bin/env node
'use strict';

/**
 * save_price_100.js
 * 価格100円設定 - 「有料エリア設定」ボタン経由で保存を試みる
 */

const { chromium } = require('@playwright/test');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_PUBLISH_URL = 'https://editor.note.com/notes/nbbb28074c02c/publish/';

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(NOTE_PUBLISH_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/save100_initial.png' });

  // 1. Ensure "有料" is selected
  const paidChecked = await page.$eval('input[name="is_paid"][value="paid"]', el => el.checked).catch(() => false);
  if (!paidChecked) {
    const paidLabel = page.locator('label[for="paid"]');
    await paidLabel.click();
    await page.waitForTimeout(2000);
    console.log('[action] 有料ラジオクリック');
  } else {
    console.log('[check] 有料ラジオはすでに選択済み');
  }

  // 2. Set price to 100
  const priceEl = await page.$('input[placeholder="300"]');
  if (priceEl) {
    await priceEl.click({ clickCount: 3 });
    await page.waitForTimeout(300);
    await priceEl.fill('100');
    // Trigger change/blur events
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="300"]');
      if (input) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    });
    await page.waitForTimeout(2000);  // wait for auto-save
    console.log('[action] 価格100円設定 + イベント発火');
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/save100_price_set.png' });
  }

  // 3. Click "有料エリア設定" button to see what it does
  const paidAreaBtn = page.locator('button').filter({ hasText: '有料エリア設定' }).first();
  const isVisible = await paidAreaBtn.isVisible().catch(() => false);
  console.log('[check] 有料エリア設定ボタン:', isVisible);
  if (isVisible) {
    await paidAreaBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/save100_paid_area_btn.png' });

    // Check what appeared
    const newBtns = await page.$$eval('button', els =>
      els.filter(e => e.offsetParent !== null).map(e => e.textContent.trim()).filter(t => t && t.length < 30)
    );
    console.log('[check] 有料エリア設定クリック後のボタン:', newBtns.slice(0, 15));

    // Close/escape if modal appeared
    const closeBtn = page.locator('button').filter({ hasText: /閉じる|キャンセル|✕|×/ }).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  }

  // 4. Verify current price before navigating
  const currentPrice = await page.$eval('input[placeholder="300"]', el => el.value).catch(() => 'not found');
  console.log('[verify] 価格入力値:', currentPrice);

  // 5. Try Tab key to confirm the price input (triggers blur/change)
  if (currentPrice === '100') {
    await priceEl?.press('Tab');
    await page.waitForTimeout(3000);
    console.log('[action] Tab押下でフォーカス移動（auto-save期待）');
  }

  // 6. Re-check
  const finalPrice = await page.$eval('input[placeholder="300"]', el => el.value).catch(() => 'not found');
  console.log('[verify] 最終価格:', finalPrice);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/save100_final.png' });

  // 7. Reload page to verify if price was saved
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const reloadedPrice = await page.$eval('input[placeholder="300"]', el => el.value).catch(() => 'not found');
  const reloadedPaid = await page.$eval('input[name="is_paid"][value="paid"]', el => el.checked).catch(() => false);
  console.log('[verify] リロード後の価格:', reloadedPrice);
  console.log('[verify] リロード後の有料状態:', reloadedPaid);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/save100_after_reload.png' });

  await ctx.close();
  console.log('[完了]');
})();
