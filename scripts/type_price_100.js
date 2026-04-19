#!/usr/bin/env node
'use strict';

/**
 * type_price_100.js
 * 実際のキーボード入力で価格100円を設定して長めに待機
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

  // Scroll down to price section
  const priceEl = page.locator('input[placeholder="300"]').first();
  if (!await priceEl.isVisible().catch(() => false)) {
    console.log('[error] 価格入力フィールドが見つかりません');
    const paidChecked = await page.$eval('input[name="is_paid"][value="paid"]', el => el.checked).catch(() => false);
    console.log('[check] 有料ラジオ:', paidChecked);
    if (!paidChecked) {
      await page.evaluate(() => {
        const radio = document.querySelector('input[name="is_paid"][value="paid"]');
        if (radio) radio.click();
      });
      await page.waitForTimeout(2000);
    }
  }

  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/type100_before.png' });

  const priceEl2 = page.locator('input[placeholder="300"]').first();
  const isVis = await priceEl2.isVisible().catch(() => false);
  console.log('[check] 価格フィールド表示:', isVis);

  if (isVis) {
    // Use actual keyboard input
    await priceEl2.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await priceEl2.click({ clickCount: 3 });
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);
    await page.keyboard.type('100');
    await page.waitForTimeout(500);

    const val = await priceEl2.inputValue();
    console.log('[action] 入力後の値:', val);

    // Press Tab to blur and trigger save
    await page.keyboard.press('Tab');
    await page.waitForTimeout(5000);  // wait 5 sec for auto-save API call

    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/type100_after_tab.png' });

    // Check value is still 100
    const val2 = await priceEl2.inputValue().catch(() => 'detached');
    console.log('[check] Tab後の値:', val2);
  } else {
    console.log('[error] 価格フィールドが見つかりません');
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/type100_notfound.png' });
  }

  // Reload to verify
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const reloadPrice = await page.$eval('input[placeholder="300"]', el => el.value).catch(() => 'not found');
  console.log('[verify] リロード後の価格:', reloadPrice);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/type100_reload.png' });

  await ctx.close();
  console.log('[完了]');
})();
