#!/usr/bin/env node
'use strict';

/**
 * insert_images_tests_article.js
 * 「AIにテストコードを書かせるな」note記事に画像3枚挿入（下書き保存のみ・公開禁止）
 *
 * 対象: https://editor.note.com/notes/ncdfbdfeeadd4/edit/
 *
 * 挿入箇所:
 *  1. 「人間が結果を見るまで、誰も気づかなかった。」の後 → illust_same_name.jpg
 *  2. 「だからテストは無駄なのだ。少なくとも、AIに書かせるテストは。」の後 → illust_useless_test.jpg
 *  3. 「AIが書いたコードには、AIが残した矛盾がある。」の後 → illust_night_audit.jpg
 *
 * 絶対厳守: 公開ボタンは押さない。下書き保存のみ。
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_EDITOR_URL = 'https://editor.note.com/notes/ncdfbdfeeadd4/edit/';
const IMAGES_DIR = path.resolve('/home/murakami/multi-agent-shogun/projects/note_mcp_server/assets/naginata_illustrations');

const IMAGES = [
  {
    file: path.join(IMAGES_DIR, 'illust_same_name.jpg'),
    afterText: '人間が結果を見るまで、誰も気づかなかった。',
    caption: '6人が喋っているのに、全員の名前が同じだった',
    label: 'same_name',
  },
  {
    file: path.join(IMAGES_DIR, 'illust_useless_test.jpg'),
    afterText: 'だからテストは無駄なのだ。少なくとも、AIに書かせるテストは。',
    caption: 'AIは通るテストしか書かない',
    label: 'useless_test',
  },
  {
    file: path.join(IMAGES_DIR, 'illust_night_audit.jpg'),
    afterText: 'AIが書いたコードには、AIが残した矛盾がある。',
    caption: '夜間に無人で矛盾レポートが届く',
    label: 'night_audit',
  },
];

async function getCursorContext(page) {
  return page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const node = sel.anchorNode;
    let el = node.nodeType === 3 ? node.parentElement : node;
    const chain = [];
    while (el && !el.classList?.contains('ProseMirror')) {
      chain.push(el.tagName);
      el = el.parentElement;
    }
    return chain;
  });
}

async function findAndClickAfterText(page, searchText) {
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
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          return el.textContent.substring(0, 40);
        }
      }
    }
    return null;
  }, searchText);

  const elText = await el.jsonValue().catch(() => null);
  if (!elText) {
    console.log(`[find] テキストが見つかりません: "${searchText}"`);
    return false;
  }
  console.log(`[find] テキスト発見: "${elText}..."`);

  const elHandle = await page.evaluateHandle((text) => {
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

  const elElement = elHandle.asElement();
  if (!elElement) return false;

  const box = await elElement.boundingBox();
  if (!box) return false;

  // Click at end of element
  await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
  await page.waitForTimeout(500);
  await page.keyboard.press('End');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);

  // Check if cursor is inside a list (LI > UL) — images can't be inserted there
  const cursorCtx = await getCursorContext(page);
  if (cursorCtx && cursorCtx.includes('LI')) {
    console.log('[find] カーソルがLI内、外に逃します');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height + 50);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
  }

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

  const countBefore = (await page.$$('.ProseMirror figure:has(img)')).length;

  try {
    const menuBtn = page.locator('button[aria-label="メニューを開く"]').first();
    const menuVisible = await menuBtn.isVisible().catch(() => false);
    if (menuVisible) {
      await menuBtn.click();
      await page.waitForTimeout(800);
    }

    const imgBtn = page.locator('button').filter({ hasText: /^画像$/ }).first();
    const imgVisible = await imgBtn.isVisible().catch(() => false);
    console.log(`[image] 「画像」ボタン表示: ${imgVisible}`);

    if (!imgVisible) {
      console.log('[image] フローティングメニューを試行...');
      const floatBtn = page.locator('button').filter({ hasText: /^画像$/ }).first();
      const [fc] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8000 }),
        floatBtn.click(),
      ]);
      await fc.setFiles(absPath);
    } else {
      const [fc] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8000 }),
        imgBtn.click(),
      ]);
      await fc.setFiles(absPath);
    }
    console.log('[image] ファイル選択完了');

    await page.waitForTimeout(6000);
    const countAfter = (await page.$$('.ProseMirror figure:has(img)')).length;
    if (countAfter <= countBefore) {
      console.log(`[image] 警告: 画像数変化なし (${countBefore} → ${countAfter})`);
    } else {
      console.log(`[image] 画像追加確認: ${countBefore} → ${countAfter}`);
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
    return countAfter > countBefore;
  } catch (err) {
    console.error('[image] アップロード失敗:', err.message);
    return false;
  }
}

(async () => {
  console.log('=== 「AIにテストコードを書かせるな」画像3枚挿入スクリプト開始 ===');

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
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_tests_editor_error.png' });
    await ctx.close();
    process.exit(1);
  }

  console.log('[OK] エディタページ確認:', url);
  const initialFigs = await page.$$('.ProseMirror figure:has(img)');
  console.log(`初期画像数: ${initialFigs.length}`);

  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_tests_initial.png' });

  // Insert images one by one
  const insertedImages = [];
  for (const imageInfo of IMAGES) {
    console.log(`\n--- ${imageInfo.label} 挿入開始 ---`);

    // Reload page before each image to ensure fresh DOM state
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const found = await findAndClickAfterText(page, imageInfo.afterText);
    if (!found) {
      console.log(`[SKIP] テキストが見つからないためスキップ: ${imageInfo.label}`);
      continue;
    }

    const success = await uploadImageAtCursor(page, imageInfo.file, imageInfo.caption);
    if (success) {
      insertedImages.push(imageInfo.label);
      console.log(`[OK] ${imageInfo.label} 挿入成功`);
      await page.waitForTimeout(1000);
    } else {
      console.log(`[FAIL] ${imageInfo.label} 挿入失敗`);
    }
  }

  // Final screenshots
  await page.waitForTimeout(2000);
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_tests_final_top.png' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_tests_final_mid.png' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/note_tests_final_bottom.png' });

  const finalFigs = await page.$$('.ProseMirror figure:has(img)');
  console.log(`\n=== 完了 ===`);
  console.log(`初期画像数: ${initialFigs.length}`);
  console.log(`最終画像数: ${finalFigs.length}`);
  console.log(`挿入成功: ${insertedImages.join(', ')}`);

  await ctx.close();
})();
