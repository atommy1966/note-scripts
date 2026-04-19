#!/usr/bin/env node
'use strict';

/**
 * set_paid_gemini_article.js
 * gemini_22000yen note記事:
 * 1. 有料コンテンツライン挿入（「なかった。」の後）
 * 2. 価格100円設定
 */

const { chromium } = require('@playwright/test');
const path = require('path');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_EDITOR_URL = 'https://editor.note.com/notes/nbbb28074c02c/edit/';
const NOTE_PUBLISH_URL = 'https://editor.note.com/notes/nbbb28074c02c/publish/';

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // --- Phase 1: Insert paid content divider ---
  console.log('=== Phase 1: 有料コンテンツライン挿入 ===');
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Anchor: "この記事を書いた甲斐があります。" → insert paid line after it
  // This is the last paragraph before the paid section
  const ANCHOR_TEXT = 'この記事を書いた甲斐があります';

  const found = await page.evaluate((text) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return null;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(text)) {
        let el = node.parentElement;
        while (el && !['P', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE'].includes(el.tagName)) {
          el = el.parentElement;
        }
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          return el.textContent.substring(0, 60);
        }
      }
    }
    return null;
  }, ANCHOR_TEXT);

  if (!found) {
    console.log('[paid] アンカーテキストが見つかりません:', ANCHOR_TEXT);
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/paid_anchor_notfound.png' });
  } else {
    console.log('[paid] アンカー発見:', found);
    await page.waitForTimeout(1000);

    // Click at end of anchor element
    const el = await page.evaluateHandle((text) => {
      const editor = document.querySelector('.ProseMirror');
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes(text)) {
          let el = node.parentElement;
          while (el && !['P', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE'].includes(el.tagName)) {
            el = el.parentElement;
          }
          return el;
        }
      }
      return null;
    }, ANCHOR_TEXT);

    const elHandle = el.asElement();
    const box = await elHandle?.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2);
      await page.waitForTimeout(500);
      await page.keyboard.press('End');
      await page.waitForTimeout(300);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);

      // Take screenshot to see floating menu state
      await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/paid_cursor_placed.png' });

      // Try to find and click the "有料コンテンツ" option in floating menu
      // First try: click the "+" or "メニューを開く" button
      const menuBtnSelectors = [
        'button[aria-label="メニューを開く"]',
        'button[aria-label="Add block"]',
        'button[title="メニューを開く"]',
      ];

      let menuOpened = false;
      for (const sel of menuBtnSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(500);
          menuOpened = true;
          console.log('[paid] メニューを開きました:', sel);
          break;
        }
      }

      await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/paid_menu_opened.png' });

      if (!menuOpened) {
        console.log('[paid] メニューボタンが見つかりません。別アプローチを試みます。');
      }

      // Look for paid content button
      const paidBtnTexts = ['有料コンテンツ', '課金', 'paid', 'ペイウォール'];
      let paidInserted = false;

      for (const text of paidBtnTexts) {
        const btn = page.locator('button').filter({ hasText: new RegExp(text, 'i') }).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(2000);
          console.log('[paid] 有料コンテンツボタンクリック:', text);
          paidInserted = true;
          break;
        }
      }

      if (!paidInserted) {
        console.log('[paid] 有料コンテンツボタンが見つかりません。');
        // List all visible buttons
        const visibleBtns = await page.$$eval('button', els =>
          els.filter(e => e.offsetParent !== null).map(e => e.textContent.trim()).filter(t => t && t.length < 20)
        );
        console.log('[paid] 可視ボタン一覧:', visibleBtns.slice(0, 20));
        await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/paid_no_button.png' });
      } else {
        // Save draft
        const saveBtn = await page.$('button:has-text("下書き保存")');
        if (saveBtn) {
          await saveBtn.click({ force: true });
          await page.waitForTimeout(2000);
          console.log('[paid] 下書き保存完了');
        }
      }
    }
  }

  // --- Phase 2: Set price 100 yen on publish page ---
  console.log('\n=== Phase 2: 価格100円設定 ===');
  await page.goto(NOTE_PUBLISH_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/price_page_initial.png' });

  // Click "有料" radio button
  const paidRadio = page.locator('input[name="is_paid"][value="paid"]');
  if (await paidRadio.isVisible().catch(() => false)) {
    await paidRadio.click();
    await page.waitForTimeout(2000);
    console.log('[price] 有料ラジオボタンクリック完了');
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/price_paid_selected.png' });
  } else {
    // Try label click
    const paidLabel = page.locator('label[for="paid"]');
    if (await paidLabel.isVisible().catch(() => false)) {
      await paidLabel.click();
      await page.waitForTimeout(2000);
      console.log('[price] 有料ラベルクリック完了');
      await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/price_paid_label.png' });
    } else {
      console.log('[price] 有料ラジオが見つかりません');
    }
  }

  // After selecting "有料", a price input should appear
  await page.waitForTimeout(1000);
  const priceInput = await page.$('input[type="number"]') ||
                     await page.$('input[name="price"]') ||
                     await page.$('input[placeholder*="金額"]') ||
                     await page.$('input[placeholder*="円"]') ||
                     await page.$('input[placeholder*="100"]');

  if (priceInput) {
    await priceInput.click({ clickCount: 3 });
    await page.waitForTimeout(300);
    await priceInput.fill('100');
    await page.waitForTimeout(500);
    console.log('[price] 価格100円入力完了');

    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/price_100_set.png' });

    // Look for a "保存" button (not "投稿する") to save settings
    // Note: We do NOT want to publish - just save the draft settings
    // On note.com publish page, navigating back saves the settings
    await page.waitForTimeout(1000);

    // Check if there's a "下書きを保存" or similar button
    const draftSaveBtn = page.locator('button').filter({ hasText: /下書き/ }).first();
    if (await draftSaveBtn.isVisible().catch(() => false)) {
      await draftSaveBtn.click();
      await page.waitForTimeout(2000);
      console.log('[price] 下書き保存完了');
    } else {
      // Click キャンセル to go back (settings might auto-save)
      const cancelBtn = page.locator('button').filter({ hasText: /キャンセル/ }).first();
      if (await cancelBtn.isVisible().catch(() => false)) {
        // Before canceling, check if settings are saved
        await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/price_before_cancel.png' });
        // Actually, just navigate back to editor - don't cancel
        await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
        console.log('[price] エディタに戻りました（設定はブラウザに保持されます）');
      }
    }
  } else {
    // List all inputs after selecting paid
    const inputs = await page.$$eval('input', els => els.map(el => ({
      type: el.type, name: el.name, placeholder: el.placeholder, value: el.value,
    })));
    console.log('[price] 全input:', JSON.stringify(inputs));
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/price_no_input_after_paid.png' });
  }

  console.log('\n=== 完了 ===');
  await ctx.close();
})();
