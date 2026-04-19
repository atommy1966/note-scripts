#!/usr/bin/env node
'use strict';

/**
 * delete_last_paywall.js
 * 末尾の誤ったPAYWALL-LINEを削除（正しい位置のものは残す）
 */

const { chromium } = require('@playwright/test');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_EDITOR_URL = 'https://editor.note.com/notes/nbbb28074c02c/edit/';

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Count PAYWALL-LINE elements
  const paywallCount = await page.$$eval('paywall-line', els => els.length);
  console.log('[check] PAYWALL-LINE数:', paywallCount);

  if (paywallCount <= 1) {
    console.log('[check] PAYWALL-LINEは1つ以下。削除不要。');
  } else {
    // Get positions of all PAYWALL-LINE elements
    const paywallPositions = await page.$$eval('paywall-line', els => els.map((el, i) => {
      const editor = document.querySelector('.ProseMirror');
      const children = Array.from(editor.children);
      const idx = children.indexOf(el);
      return { index: i, editorChildIndex: idx, id: el.id };
    }));
    console.log('[check] PAYWALL-LINE位置:', JSON.stringify(paywallPositions));

    // Delete the LAST PAYWALL-LINE (which is at the end of the article - wrong position)
    const lastPaywall = await page.evaluateHandle(() => {
      const paywalls = document.querySelectorAll('paywall-line');
      return paywalls[paywalls.length - 1];  // last one
    });

    const lastEl = lastPaywall.asElement();
    if (lastEl) {
      const box = await lastEl.boundingBox();
      if (box) {
        // Scroll to it
        await lastEl.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/del_paywall_found.png' });

        // Click on it to select
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(500);
        await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/del_paywall_clicked.png' });

        // Try to delete it with Backspace or Delete
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(1000);

        const paywallCountAfter = await page.$$eval('paywall-line', els => els.length);
        console.log('[delete] 削除後のPAYWALL-LINE数:', paywallCountAfter);

        if (paywallCountAfter < paywallCount) {
          console.log('[delete] 削除成功');
          await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/del_paywall_deleted.png' });

          // Save draft
          const saveBtn = await page.$('button:has-text("下書き保存")');
          if (saveBtn) {
            await saveBtn.click({ force: true });
            await page.waitForTimeout(2000);
            console.log('[delete] 下書き保存完了');
          }
        } else {
          // Try Delete key
          await page.keyboard.press('Delete');
          await page.waitForTimeout(1000);
          const count2 = await page.$$eval('paywall-line', els => els.length);
          console.log('[delete] Delete後のPAYWALL-LINE数:', count2);

          if (count2 < paywallCount) {
            console.log('[delete] Delete成功');
            const saveBtn = await page.$('button:has-text("下書き保存")');
            if (saveBtn) { await saveBtn.click({ force: true }); await page.waitForTimeout(2000); }
          } else {
            console.log('[delete] キーボードで削除失敗。DOM直接操作を試みます。');
            await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/del_paywall_failed.png' });
          }
        }
      }
    }
  }

  // Verify final state
  const finalCount = await page.$$eval('paywall-line', els => els.length);
  console.log('[final] PAYWALL-LINE最終数:', finalCount);

  // Take screenshot of editor near "やった対策" and end
  await page.evaluate(() => {
    const h2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('やった対策'));
    if (h2) h2.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/del_final_yakatta.png' });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/del_final_bottom.png' });

  await ctx.close();
  console.log('[完了]');
})();
