#!/usr/bin/env node
'use strict';

/**
 * replace_table_with_image.js
 * note記事（nedb886542772）のMarkdown表テキストをrole_table.png画像に差し替える。
 *
 * 手順:
 *  1. エディタ内の表テキスト（| 役職...から5行）を選択して削除
 *  2. 同位置にrole_table.pngを挿入
 *  3. 下書き保存（公開禁止）
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_EDITOR_URL = 'https://editor.note.com/notes/nedb886542772/edit/';
const IMAGE_PATH = '/home/murakami/multi-agent-shogun/projects/note_mcp_server/assets/naginata_illustrations/role_table.png';

// Table markers to find in the editor
const TABLE_MARKER = '| 役職 | 担当 | 人数 |';

(async () => {
  console.log('=== 表テキスト→画像差替スクリプト開始 ===');

  if (!fs.existsSync(IMAGE_PATH)) {
    console.error('画像ファイルが見つかりません:', IMAGE_PATH);
    process.exit(1);
  }

  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  console.log('エディタを開きます:', NOTE_EDITOR_URL);
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const url = page.url();
  if (!url.includes('editor.note.com')) {
    console.error('エラー: エディタページではありません。URL:', url);
    await ctx.close();
    process.exit(1);
  }
  console.log('[OK] エディタページ確認');

  // Step 1: Find and delete the table text
  console.log('\n--- STEP 1: 表テキスト検索・削除 ---');

  const tableFound = await page.evaluate((marker) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return false;

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(marker)) {
        console.log('表テキスト発見:', node.textContent.substring(0, 50));
        return true;
      }
    }
    return false;
  }, TABLE_MARKER);

  if (!tableFound) {
    console.log('[WARN] 表テキストが見つかりません。既に削除済みの可能性。');
    console.log('エディタ内容を確認します...');

    // Check if image already exists
    const figCount = (await page.$$('.ProseMirror figure:has(img)')).length;
    console.log('現在の画像数:', figCount);
  } else {
    console.log('[OK] 表テキスト発見');

    // Select and delete the table rows
    // Strategy: find the first row "| 役職 | 担当 | 人数 |", select from there through all table rows
    const deleted = await page.evaluate(() => {
      const editor = document.querySelector('.ProseMirror');
      if (!editor) return false;

      // Find all text nodes that look like table rows (start with |)
      const tableNodes = [];
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
      let node;
      let foundStart = false;
      while ((node = walker.nextNode())) {
        const text = node.textContent.trim();
        if (text.includes('| 役職 | 担当 | 人数 |')) {
          foundStart = true;
        }
        if (foundStart && (text.startsWith('|') || text.match(/^\|?-+/))) {
          tableNodes.push({
            parent: node.parentElement,
            text: text.substring(0, 60),
          });
        }
        // Stop after finding all table rows (next non-table text)
        if (foundStart && !text.startsWith('|') && !text.match(/^\|?-+/) && tableNodes.length > 0) {
          break;
        }
      }

      if (tableNodes.length === 0) return false;

      // Remove parent elements of table rows
      const removedParents = new Set();
      for (const tn of tableNodes) {
        let el = tn.parent;
        // Go up to P or similar block element
        while (el && !['P', 'H2', 'H3', 'H4', 'LI'].includes(el.tagName)) {
          el = el.parentElement;
        }
        if (el && !removedParents.has(el)) {
          removedParents.add(el);
          // Store next sibling for cursor placement
          el._nextSibling = el.nextElementSibling;
          el.remove();
        }
      }
      return { count: removedParents.size, texts: tableNodes.map(t => t.text) };
    });

    console.log('[DELETE] 削除結果:', JSON.stringify(deleted));

    // Save draft after deletion
    const saveBtn = await page.$('button:has-text("下書き保存")');
    if (saveBtn) {
      await saveBtn.click({ force: true });
      await page.waitForTimeout(2000);
      console.log('[SAVE] 表削除後の下書き保存完了');
    }
  }

  // Step 2: Insert role_table.png
  console.log('\n--- STEP 2: role_table.png 挿入 ---');

  // Find the anchor text "人間（殿）は将軍に指示を出すだけ。" and insert BEFORE it
  // The table was just before this text
  const anchorText = '人間（殿）は将軍に指示を出すだけ。';

  const anchorFound = await page.evaluate((text) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return false;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(text)) {
        let el = node.parentElement;
        while (el && !['P', 'H2', 'H3', 'H4'].includes(el.tagName)) {
          el = el.parentElement;
        }
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          return el.textContent.substring(0, 40);
        }
      }
    }
    return null;
  }, anchorText);

  console.log('[FIND] アンカーテキスト:', anchorFound);

  if (anchorFound) {
    // Click at the start of the anchor element
    const elHandle = await page.evaluateHandle((text) => {
      const editor = document.querySelector('.ProseMirror');
      if (!editor) return null;
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes(text)) {
          let el = node.parentElement;
          while (el && !['P', 'H2', 'H3', 'H4'].includes(el.tagName)) {
            el = el.parentElement;
          }
          return el;
        }
      }
      return null;
    }, anchorText);

    const el = elHandle.asElement();
    if (el) {
      const box = await el.boundingBox();
      if (box) {
        // Click at the left edge (start of element)
        await page.mouse.click(box.x + 10, box.y + box.height / 2);
        await page.waitForTimeout(500);

        // Move cursor to beginning and press Enter to create space, then move up
        await page.keyboard.press('Home');
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(500);

        console.log('[CURSOR] カーソル位置設定完了（アンカーテキストの直前）');

        // Now upload the image at cursor position
        const countBefore = (await page.$$('.ProseMirror figure:has(img)')).length;
        console.log('画像挿入前の画像数:', countBefore);

        // Try the + menu button approach
        try {
          const menuBtn = page.locator('button[aria-label="メニューを開く"]').first();
          const menuVisible = await menuBtn.isVisible().catch(() => false);
          if (menuVisible) {
            await menuBtn.click();
            await page.waitForTimeout(800);
          }

          const imgBtn = page.locator('button').filter({ hasText: /^画像$/ }).first();
          const imgVisible = await imgBtn.isVisible().catch(() => false);
          console.log('画像ボタン表示:', imgVisible);

          if (imgVisible) {
            const [fc] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 10000 }),
              imgBtn.click(),
            ]);
            await fc.setFiles(IMAGE_PATH);
            console.log('[UPLOAD] ファイル選択完了');
          } else {
            // Try floating menu
            const floatBtn = page.locator('button').filter({ hasText: /^画像$/ }).first();
            const [fc] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 10000 }),
              floatBtn.click(),
            ]);
            await fc.setFiles(IMAGE_PATH);
            console.log('[UPLOAD] フローティングメニューからファイル選択完了');
          }

          await page.waitForTimeout(6000);
          const countAfter = (await page.$$('.ProseMirror figure:has(img)')).length;
          console.log('画像挿入後の画像数:', countAfter);

          if (countAfter > countBefore) {
            console.log('[OK] 画像挿入成功');
          } else {
            console.log('[WARN] 画像数変化なし。リトライします...');
          }
        } catch (err) {
          console.error('[ERROR] 画像アップロード失敗:', err.message);
        }

        // Save draft
        const saveBtn2 = await page.$('button:has-text("下書き保存")');
        if (saveBtn2) {
          await saveBtn2.click({ force: true });
          await page.waitForTimeout(2000);
          console.log('[SAVE] 下書き保存完了');
        }
      } else {
        console.log('[WARN] アンカー要素のboundingBox取得失敗');
      }
    }
  } else {
    console.log('[WARN] アンカーテキストが見つかりません');
  }

  // Step 3: Verify and screenshot
  console.log('\n--- STEP 3: 最終確認 ---');

  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check table text is gone
  const tableStillExists = await page.evaluate((marker) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return false;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(marker)) return true;
    }
    return false;
  }, TABLE_MARKER);

  console.log('表テキスト残存:', tableStillExists ? 'YES (削除失敗)' : 'NO (OK)');

  // Check image count
  const finalFigs = await page.$$('.ProseMirror figure:has(img)');
  console.log('最終画像数:', finalFigs.length);

  // Screenshots
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_table_replace_top.png' });

  // Scroll to the table/image area
  await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes('人間（殿）は将軍に指示を出すだけ。')) {
        node.parentElement.scrollIntoView({ behavior: 'instant', block: 'center' });
        return;
      }
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_table_replace_area.png' });

  console.log('\n=== 完了 ===');
  console.log('表テキスト削除:', tableStillExists ? 'FAIL' : 'OK');
  console.log('画像挿入:', finalFigs.length > 0 ? 'OK' : '要確認');
  console.log('スクリーンショット保存完了');

  await ctx.close();
})();
