#!/usr/bin/env node
'use strict';

const { chromium } = require('@playwright/test');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_PUBLISH_URL = 'https://editor.note.com/notes/nbbb28074c02c/publish/';
const NOTE_EDITOR_URL = 'https://editor.note.com/notes/nbbb28074c02c/edit/';

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(NOTE_PUBLISH_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/price_check_initial.png' });

  // Check current is_paid state
  const paidRadioChecked = await page.$eval('input[name="is_paid"][value="paid"]', el => el.checked).catch(() => false);
  const freeRadioChecked = await page.$eval('input[name="is_paid"][value="free"]', el => el.checked).catch(() => false);
  console.log('[check] 有料ラジオ選択状態:', { paid: paidRadioChecked, free: freeRadioChecked });

  if (!paidRadioChecked) {
    console.log('[action] 有料ラジオをクリック...');
    // Click "有料" option
    const paidLabel = page.locator('label[for="paid"]');
    if (await paidLabel.isVisible().catch(() => false)) {
      await paidLabel.click();
    } else {
      await page.evaluate(() => {
        const radio = document.querySelector('input[name="is_paid"][value="paid"]');
        if (radio) { radio.click(); radio.dispatchEvent(new Event('change', { bubbles: true })); }
      });
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/price_check_after_paid.png' });
  }

  // Now check/set price
  const priceEl = await page.$('input[placeholder="300"]') || await page.$('input[type="text"][class*="price"]');
  if (priceEl) {
    const currentVal = await priceEl.inputValue();
    console.log('[check] 現在の価格:', currentVal);
    if (currentVal !== '100') {
      await priceEl.click({ clickCount: 3 });
      await page.waitForTimeout(300);
      await priceEl.fill('100');
      await page.waitForTimeout(500);
      console.log('[action] 価格を100円に設定');
      await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/price_check_set100.png' });

      // Save by clicking "保存" or navigating
      // Note: on note.com publish page, there is no explicit "save" - settings are saved when you confirm/submit
      // But we can scroll to check if there are other options

      // Look for any confirm/save button that doesn't publish
      const allBtns = await page.$$eval('button', els => els.map(e => e.textContent.trim()).filter(t => t));
      console.log('[check] ページ上のボタン:', allBtns);

      // On the publish page, "投稿する" would publish the article.
      // We do NOT want to publish. So we navigate back to the editor.
      // The price IS saved to the draft even if we don't click 投稿する
      // (note.com saves settings on form change events)
      await page.waitForTimeout(1000);
    } else {
      console.log('[check] 価格はすでに100円に設定されています');
    }
  } else {
    console.log('[check] 価格入力フィールドが見つかりません');
    const inputs = await page.$$eval('input', els => els.map(e => ({
      type: e.type, name: e.name, placeholder: e.placeholder, value: e.value,
    })));
    console.log('[check] 全input:', JSON.stringify(inputs));
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/price_check_no_input.png' });
  }

  // Navigate back to editor (this triggers autosave of settings)
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/price_check_final_editor.png' });

  await ctx.close();
  console.log('[完了]');
})();
