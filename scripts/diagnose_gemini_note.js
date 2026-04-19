#!/usr/bin/env node
'use strict';

/**
 * diagnose_gemini_note.js
 * gemini_22000yen note記事の現状診断
 * 1. エディタの全テキスト内容確認
 * 2. publishページのUI確認
 */

const { chromium } = require('@playwright/test');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_EDITOR_URL = 'https://editor.note.com/notes/nbbb28074c02c/edit/';
const NOTE_PUBLISH_URL = 'https://editor.note.com/notes/nbbb28074c02c/publish/';

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // --- Phase 1: Editor content check ---
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/diag_editor_top.png' });

  const allText = await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return 'ProseMirror not found';
    return editor.innerText;
  });

  // Search for "ここから先" in the text
  const hasKokokaraText = allText.includes('ここから先');
  console.log('[diag] ここから先テキスト存在:', hasKokokaraText);
  const idx = allText.indexOf('ここから先');
  if (idx >= 0) {
    console.log('[diag] 前後100文字:', allText.substring(Math.max(0, idx - 50), idx + 100));
  }

  // Count images
  const figs = await page.$$('.ProseMirror figure:has(img)');
  console.log('[diag] 画像数:', figs.length);

  // Check for paid content block
  const paidBlock = await page.$('[data-type="paid_content"]') ||
                    await page.$('.paid-content') ||
                    await page.$('.tiptap-paid');
  console.log('[diag] 有料コンテンツブロック:', paidBlock ? '存在' : 'なし');

  // Scroll to find "ここから先"
  if (hasKokokaraText) {
    await page.evaluate((text) => {
      const editor = document.querySelector('.ProseMirror');
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes(text)) {
          node.parentElement.scrollIntoView({ behavior: 'instant', block: 'center' });
          break;
        }
      }
    }, 'ここから先');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/diag_kokokara_area.png' });
  }

  // Write full text to file for inspection
  require('fs').writeFileSync(
    '/home/murakami/multi-agent-shogun/queue/reports/note_gemini_fulltext.txt',
    allText
  );
  console.log('[diag] 全テキストをnote_gemini_fulltext.txtに保存');

  // --- Phase 2: Publish page UI ---
  await page.goto(NOTE_PUBLISH_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/diag_publish_top.png' });

  // Scroll to find price input
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/diag_publish_mid.png' });

  // Get all inputs on publish page
  const inputs = await page.$$eval('input', els => els.map(el => ({
    type: el.type,
    name: el.name,
    placeholder: el.placeholder,
    value: el.value,
    id: el.id,
    className: el.className.substring(0, 50),
  })));
  console.log('[diag] Publishページのinput一覧:', JSON.stringify(inputs, null, 2));

  // Get all buttons
  const buttons = await page.$$eval('button', els => els.map(el => el.textContent.trim()).filter(t => t));
  console.log('[diag] Publishページのボタン一覧:', buttons.slice(0, 20));

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/diag_publish_bottom.png' });

  await ctx.close();
  console.log('[diag] 完了');
})();
