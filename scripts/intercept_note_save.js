#!/usr/bin/env node
'use strict';

/**
 * intercept_note_save.js
 * note.comの価格保存APIリクエストを傍受して保存の仕組みを調査
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

  // Intercept all API calls
  const apiCalls = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('api') || url.includes('note')) {
      apiCalls.push({
        method: req.method(),
        url: url.substring(0, 100),
        postData: req.postData()?.substring(0, 200),
      });
    }
  });

  await page.goto(NOTE_PUBLISH_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log('[init] 初期APIコール数:', apiCalls.length);
  apiCalls.length = 0;  // reset

  // Click 有料エリア設定 to open modal
  const paidAreaBtn = page.locator('button').filter({ hasText: '有料エリア設定' }).first();
  if (await paidAreaBtn.isVisible().catch(() => false)) {
    console.log('[action] 有料エリア設定モーダルを開く');
    await paidAreaBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/intercept_modal.png' });

    // Get all "ラインをこの場所に変更" button text context
    const lineChangeBtns = await page.$$('button');
    let lineChangeCount = 0;
    const lineContexts = [];
    for (const btn of lineChangeBtns) {
      const text = await btn.textContent().catch(() => '');
      if (text.trim() === 'ラインをこの場所に変更') {
        lineChangeCount++;
        // Get surrounding context
        const parentText = await btn.evaluate(el => el.parentElement?.parentElement?.textContent?.substring(0, 80)).catch(() => '');
        lineContexts.push({ idx: lineChangeCount, context: parentText });
      }
    }
    console.log('[modal] ラインをこの場所に変更ボタン数:', lineChangeCount);
    console.log('[modal] コンテキスト:', JSON.stringify(lineContexts.slice(0, 5)));

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }

  // Now try changing price and monitor API calls
  const priceEl = page.locator('input[placeholder="300"]').first();
  if (await priceEl.isVisible().catch(() => false)) {
    console.log('\n[action] 価格入力中...');
    apiCalls.length = 0;
    await priceEl.click({ clickCount: 3 });
    await page.keyboard.type('100');
    await page.waitForTimeout(500);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(3000);

    console.log('[api] 価格変更後のAPIコール:', JSON.stringify(apiCalls, null, 2));
  }

  // Try clicking キャンセル and monitor
  apiCalls.length = 0;
  const cancelBtn = page.locator('button').filter({ hasText: 'キャンセル' }).first();
  if (await cancelBtn.isVisible().catch(() => false)) {
    console.log('\n[action] キャンセルクリック中...');
    await cancelBtn.click();
    await page.waitForTimeout(3000);
    console.log('[api] キャンセル後のAPIコール:', JSON.stringify(apiCalls, null, 2));
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/intercept_after_cancel.png' });
  }

  await ctx.close();
  console.log('[完了]');
})();
