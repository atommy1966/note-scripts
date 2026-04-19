#!/usr/bin/env node
'use strict';

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
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/verify_publish_page.png' });

  const paidChecked = await page.$eval('input[name="is_paid"][value="paid"]', el => el.checked).catch(() => false);
  const priceInputs = await page.$$eval('input', els => els.map(e => ({
    type: e.type, placeholder: e.placeholder, value: e.value,
  })));
  console.log('[verify] 有料ラジオ選択:', paidChecked);
  console.log('[verify] 全input:', JSON.stringify(priceInputs.filter(e => e.placeholder || e.value)));

  await ctx.close();
})();
