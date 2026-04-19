#!/usr/bin/env node
'use strict';

/**
 * set_paywall_and_price.js
 * 1. publishページで有料ラジオ選択
 * 2. 価格100円設定
 * 3. 「有料エリア設定」→モーダルで正しい位置のラインを選択
 * 4. キャンセル（→設定保存）してエディタに戻る
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

  // Step 1: Select 有料
  const paidChecked = await page.$eval('input[name="is_paid"][value="paid"]', el => el.checked).catch(() => false);
  if (!paidChecked) {
    await page.evaluate(() => {
      const radio = document.querySelector('input[name="is_paid"][value="paid"]');
      if (radio) radio.click();
    });
    await page.waitForTimeout(2000);
    console.log('[step1] 有料選択完了');
  } else {
    console.log('[step1] 有料はすでに選択済み');
  }

  // Step 2: Set price to 100
  await page.waitForTimeout(500);
  const priceSet = await page.evaluate(() => {
    const input = document.querySelector('input[placeholder="300"]');
    if (!input) return false;
    // Set value via React-compatible way
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, '100');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return input.value;
  });
  console.log('[step2] 価格設定:', priceSet);
  await page.waitForTimeout(3000);  // wait for React state update + auto-save

  // Take screenshot to see current state
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/paywall_step2.png' });

  // Step 3: Click 有料エリア設定 button to open modal
  const paidAreaBtn = page.locator('button').filter({ hasText: '有料エリア設定' }).first();
  if (await paidAreaBtn.isVisible().catch(() => false)) {
    await paidAreaBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/paywall_modal.png' });
    console.log('[step3] 有料エリア設定モーダル開いた');

    // Check the modal content - find the button corresponding to "やった対策" section
    // The modal shows multiple "ラインをこの場所に変更" buttons for each section boundary
    // We need to identify which one corresponds to before "やった対策"

    // List all buttons and their context
    const modalBtns = await page.$$eval('[role="dialog"] button, .modal button, button:visible', els =>
      els.map(e => ({
        text: e.textContent.trim(),
        ariaLabel: e.getAttribute('aria-label'),
        parent: e.parentElement?.textContent?.substring(0, 60),
      })).filter(b => b.text)
    ).catch(async () => {
      // Fallback: get all visible buttons
      return await page.$$eval('button', els =>
        els.filter(e => e.offsetParent !== null)
           .map(e => ({ text: e.textContent.trim(), parent: e.parentElement?.textContent?.substring(0, 60) }))
           .filter(b => b.text && b.text.length < 20)
      );
    });
    console.log('[step3] モーダルボタン:', JSON.stringify(modalBtns.slice(0, 20)));

    // The modal shows article sections with "ラインをこの場所に変更" buttons
    // We need the one near "やった対策" or the free/paid boundary

    // For now, close the modal
    const escapeKey = await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }

  // Step 4: Verify price
  const currentPrice = await page.$eval('input[placeholder="300"]', el => el.value).catch(() => 'not found');
  console.log('[verify] 現在の価格:', currentPrice);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/paywall_verify.png' });

  // Step 5: Try clicking キャンセル to save and go back
  const cancelBtn = page.locator('button').filter({ hasText: 'キャンセル' }).first();
  if (await cancelBtn.isVisible().catch(() => false)) {
    await cancelBtn.click();
    await page.waitForTimeout(3000);
    console.log('[step5] キャンセルクリック → エディタに戻る');
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/paywall_after_cancel.png' });
  }

  // Step 6: Go back to publish page and verify price
  await page.goto(NOTE_PUBLISH_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const savedPrice = await page.$eval('input[placeholder="300"]', el => el.value).catch(() => 'not found');
  const savedPaid = await page.$eval('input[name="is_paid"][value="paid"]', el => el.checked).catch(() => false);
  console.log('[step6] 再ロード後の価格:', savedPrice);
  console.log('[step6] 再ロード後の有料状態:', savedPaid);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/paywall_reload_check.png' });

  await ctx.close();
  console.log('[完了]');
})();
