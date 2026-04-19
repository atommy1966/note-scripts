#!/usr/bin/env node
'use strict';

/**
 * insert_images_gemini_article.js
 * gemini_22000yen note記事に画像3枚挿入 + 有料コンテンツライン設定 + 価格100円設定
 *
 * 対象: https://editor.note.com/notes/nbbb28074c02c/edit/
 *
 * 挿入箇所:
 *  1. "ある朝、GCPコンソールを開いたら数字が並んでいました。" の後 → billing_breakdown.png
 *  2. "3. 「有料枠」がONになっていた" の後 → paid_tier_badge.png
 *  3. "「RPDを守れば無料」も嘘だった" セクションの後 → rate_limits.png
 *
 * 有料ライン: "ここから先は、私が実際にやった対策と" の前に挿入
 * 価格: 100円
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_EDITOR_URL = 'https://editor.note.com/notes/nbbb28074c02c/edit/';
const IMAGES_DIR = path.resolve('/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/gemini_22000yen_images');

const IMAGES = [
  {
    file: path.join(IMAGES_DIR, 'billing_breakdown.png'),
    afterText: 'ある朝、GCPコンソールを開いたら数字が並んでいました。',
    caption: '合計費用（March 1 - 28, 2026）',
    label: 'billing_breakdown',
  },
  {
    file: path.join(IMAGES_DIR, 'paid_tier_badge.png'),
    afterText: '「有料枠」がONになっていた',
    caption: 'この表示が全ての元凶だった',
    label: 'paid_tier_badge',
  },
  {
    file: path.join(IMAGES_DIR, 'rate_limits.png'),
    afterText: '請求の内訳を見て、次にこう思いました。',
    caption: 'Nano Banana 2のRPDが真っ赤（1.27K / 1K）。上限突破している',
    label: 'rate_limits',
  },
];

const PAID_DIVIDER_BEFORE_TEXT = 'ここから先は、私が実際にやった対策と';
const PRICE_YEN = 100;

async function findAndClickAfterText(page, searchText) {
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
          return el.textContent.substring(0, 40);
        }
      }
    }
    return null;
  }, searchText);

  if (!found) {
    console.log(`[find] テキストが見つかりません: "${searchText}"`);
    return false;
  }
  console.log(`[find] テキスト発見: "${found}..."`);

  const el = await page.evaluateHandle((text) => {
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
        return el;
      }
    }
    return null;
  }, searchText);

  const elHandle = el.asElement();
  if (!elHandle) return false;

  const box = await elHandle.boundingBox();
  if (!box) return false;

  // Click at end of element
  await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2);
  await page.waitForTimeout(500);
  await page.keyboard.press('End');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  console.log('[find] カーソル位置設定完了');
  return true;
}

async function uploadImageAtCursor(page, imagePath, captionText) {
  const absPath = path.resolve(imagePath);
  if (!fs.existsSync(absPath)) {
    console.error(`[image] ファイルが見つかりません: ${absPath}`);
    return false;
  }
  console.log(`[image] アップロード開始: ${absPath}`);

  const figsBefore = await page.$$('.ProseMirror figure:has(img)');
  const countBefore = figsBefore.length;

  try {
    // Try floating menu 画像 button
    const imgMenuBtn = page.locator('button').filter({ hasText: /^画像$/ }).first();
    const isVisible = await imgMenuBtn.isVisible().catch(() => false);
    console.log(`[image] 「画像」ボタン表示: ${isVisible}`);

    if (isVisible) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8000 }),
        imgMenuBtn.click(),
      ]);
      await fileChooser.setFiles(absPath);
      console.log('[image] ファイル選択完了 (floating menu)');
    } else {
      // Try opening the menu first
      const menuBtn = page.locator('button[aria-label="メニューを開く"]').first();
      const menuVisible = await menuBtn.isVisible().catch(() => false);
      if (menuVisible) {
        await menuBtn.click();
        await page.waitForTimeout(500);
      }

      const imgMenuBtn2 = page.locator('button').filter({ hasText: /^画像$/ }).first();
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8000 }),
        imgMenuBtn2.click(),
      ]);
      await fileChooser.setFiles(absPath);
      console.log('[image] ファイル選択完了 (after menu open)');
    }

    await page.waitForTimeout(4000);
    const figsAfter = await page.$$('.ProseMirror figure:has(img)');
    if (figsAfter.length <= countBefore) {
      console.log('[image] 警告: 画像が追加されていない可能性があります');
    } else {
      console.log(`[image] 画像追加確認: ${countBefore} → ${figsAfter.length}`);
    }

    // Set caption on the last figure
    if (captionText) {
      const figures = await page.$$('.ProseMirror figure:has(img)');
      if (figures.length > 0) {
        const lastFig = figures[figures.length - 1];
        const figcaption = await lastFig.$('figcaption');
        if (figcaption) {
          await figcaption.click({ clickCount: 3 });
          await page.waitForTimeout(300);
          await page.keyboard.type(captionText);
          await page.waitForTimeout(500);
          await page.keyboard.press('Tab');
          await page.waitForTimeout(300);
          console.log('[image] キャプション設定完了');
        }
      }
    }

    // Save draft
    const saveBtn = await page.$('button:has-text("下書き保存")');
    if (saveBtn) {
      await saveBtn.click({ force: true });
      await page.waitForTimeout(2000);
      console.log('[image] 下書き保存完了');
    }
    return true;
  } catch (err) {
    console.error('[image] アップロード失敗:', err.message);
    return false;
  }
}

async function insertPaidDivider(page, beforeText) {
  console.log(`\n--- 有料コンテンツライン挿入 ---`);

  // Find the text and click before it
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
          return el.textContent.substring(0, 40);
        }
      }
    }
    return null;
  }, beforeText);

  if (!found) {
    console.log(`[paid] テキストが見つかりません: "${beforeText}"`);
    return false;
  }
  console.log(`[paid] テキスト発見: "${found}..."`);

  const el = await page.evaluateHandle((text) => {
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
        return el;
      }
    }
    return null;
  }, beforeText);

  const elHandle = el.asElement();
  if (!elHandle) return false;

  const box = await elHandle.boundingBox();
  if (!box) return false;

  // Click at start of the element
  await page.mouse.click(box.x + 5, box.y + box.height / 2);
  await page.waitForTimeout(500);
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
  // Create a new line before this element
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(500);

  // Now insert paid content divider via + menu
  // The floating menu appears automatically when cursor is in empty paragraph
  const menuBtn = page.locator('button[aria-label="メニューを開く"]').first();
  const menuVisible = await menuBtn.isVisible().catch(() => false);
  if (menuVisible) {
    await menuBtn.click();
    await page.waitForTimeout(500);
  }

  // Look for "有料コンテンツ" button in the menu
  const paidBtn = page.locator('button').filter({ hasText: /有料コンテンツ/ }).first();
  const paidBtnVisible = await paidBtn.isVisible().catch(() => false);
  console.log(`[paid] 有料コンテンツボタン表示: ${paidBtnVisible}`);

  if (paidBtnVisible) {
    await paidBtn.click();
    await page.waitForTimeout(2000);
    console.log('[paid] 有料コンテンツライン挿入完了');

    // Save
    const saveBtn = await page.$('button:has-text("下書き保存")');
    if (saveBtn) {
      await saveBtn.click({ force: true });
      await page.waitForTimeout(2000);
      console.log('[paid] 下書き保存完了');
    }
    return true;
  } else {
    console.log('[paid] 有料コンテンツボタンが見つかりません。スクリーンショットを撮影します。');
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_paid_menu_debug.png' });
    return false;
  }
}

async function setPriceInPublishSettings(page, priceYen) {
  console.log(`\n--- 価格設定（${priceYen}円）---`);

  // Click "公開に進む" button in the editor
  const publishBtn = page.locator('button').filter({ hasText: /公開に進む/ }).first();
  const publishBtnVisible = await publishBtn.isVisible().catch(() => false);
  if (!publishBtnVisible) {
    console.log('[price] 「公開に進む」ボタンが見つかりません');
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_price_debug.png' });
    return false;
  }

  await publishBtn.click();
  await page.waitForTimeout(3000);
  console.log('[price] 公開設定ページへ遷移:', page.url());

  // Check if we're on the publish settings page
  if (!page.url().includes('publish')) {
    console.log('[price] 公開設定ページではありません:', page.url());
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_price_page_debug.png' });
    return false;
  }

  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_publish_page_top.png' });

  // Look for price input field
  // note.com price field: input[type="number"] or input with name="price" or similar
  const priceInput = await page.$('input[type="number"]') ||
                     await page.$('input[name="price"]') ||
                     await page.$('input[placeholder*="金額"]') ||
                     await page.$('input[placeholder*="円"]');

  if (priceInput) {
    await priceInput.click({ clickCount: 3 });
    await page.waitForTimeout(300);
    await priceInput.fill(String(priceYen));
    await page.waitForTimeout(500);
    console.log(`[price] 価格設定: ${priceYen}円`);
  } else {
    console.log('[price] 価格入力フィールドが見つかりません。手動設定が必要です。');
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_price_input_debug.png' });
    // Navigate back without publishing
    await page.goBack();
    await page.waitForTimeout(2000);
    return false;
  }

  // Save the settings without publishing (go back to editor)
  // Note: We do NOT click publish/公開する here — we just set the price and go back
  // Look for a "戻る" or "キャンセル" button, or just navigate back
  const backBtn = page.locator('button').filter({ hasText: /戻る/ }).first();
  const backBtnVisible = await backBtn.isVisible().catch(() => false);
  if (backBtnVisible) {
    await backBtn.click();
    await page.waitForTimeout(2000);
    console.log('[price] 設定保存して戻りました');
  } else {
    await page.goBack();
    await page.waitForTimeout(2000);
  }
  return true;
}

(async () => {
  console.log('=== gemini_22000yen note記事 画像挿入スクリプト開始 ===');

  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  console.log(`エディタを開きます: ${NOTE_EDITOR_URL}`);
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const url = page.url();
  if (!url.includes('editor.note.com')) {
    console.error('エラー: エディタページではありません。URL:', url);
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_editor_error.png' });
    await ctx.close();
    process.exit(1);
  }

  console.log('[OK] エディタページ確認:', url);
  const initialFigs = await page.$$('.ProseMirror figure:has(img)');
  console.log(`初期画像数: ${initialFigs.length}`);

  // Take initial screenshot
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_gemini_initial.png' });

  // Insert images one by one
  const insertedImages = [];
  for (const imageInfo of IMAGES) {
    console.log(`\n--- ${imageInfo.label} 挿入開始 ---`);

    const found = await findAndClickAfterText(page, imageInfo.afterText);
    if (!found) {
      console.log(`[SKIP] テキストが見つからないためスキップ: ${imageInfo.label}`);
      await page.screenshot({ path: `/home/murakami/multi-agent-shogun/queue/reports/note_gemini_skip_${imageInfo.label}.png` });
      continue;
    }

    const success = await uploadImageAtCursor(page, imageInfo.file, imageInfo.caption);
    if (success) {
      insertedImages.push(imageInfo.label);
      console.log(`[OK] ${imageInfo.label} 挿入成功`);
      await page.waitForTimeout(1000);
    } else {
      console.log(`[FAIL] ${imageInfo.label} 挿入失敗`);
      await page.screenshot({ path: `/home/murakami/multi-agent-shogun/queue/reports/note_gemini_fail_${imageInfo.label}.png` });
    }
  }

  // Insert paid content divider
  const paidSuccess = await insertPaidDivider(page, PAID_DIVIDER_BEFORE_TEXT);
  if (paidSuccess) {
    console.log('[OK] 有料コンテンツライン挿入成功');
  } else {
    console.log('[WARN] 有料コンテンツライン挿入失敗 — 手動設定が必要');
  }

  // Set price in publish settings
  const priceSuccess = await setPriceInPublishSettings(page, PRICE_YEN);
  if (priceSuccess) {
    console.log(`[OK] 価格設定成功: ${PRICE_YEN}円`);
  } else {
    console.log('[WARN] 価格設定失敗 — 手動設定が必要');
  }

  // Final screenshots
  await page.waitForTimeout(2000);
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_gemini_final_top.png' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_gemini_final_mid.png' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_gemini_final_bottom.png' });

  const finalFigs = await page.$$('.ProseMirror figure:has(img)');
  console.log(`\n=== 完了 ===`);
  console.log(`初期画像数: ${initialFigs.length}`);
  console.log(`最終画像数: ${finalFigs.length}`);
  console.log(`挿入成功: ${insertedImages.join(', ')}`);
  console.log(`有料ライン: ${paidSuccess ? 'OK' : 'MANUAL REQUIRED'}`);
  console.log(`価格設定: ${priceSuccess ? `${PRICE_YEN}円 OK` : 'MANUAL REQUIRED'}`);

  await ctx.close();
})();
