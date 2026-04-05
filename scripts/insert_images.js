#!/usr/bin/env node
'use strict';

/**
 * insert_images.js — 汎用note記事画像挿入スクリプト
 *
 * Usage:
 *   node scripts/insert_images.js \
 *     --url "https://editor.note.com/notes/XXXXX/edit/" \
 *     --images-json "/path/to/images.json" \
 *     [--paid-before "テキスト"] \
 *     [--price 100]
 *
 * images.json format:
 *   [
 *     { "file": "/abs/path/to/image.png", "afterText": "...", "caption": "" }
 *   ]
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// --- CLI argument parsing ---
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[key] = argv[i + 1];
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (!args.url || !args['images-json']) {
  console.error('Usage: node insert_images.js --url <editor-url> --images-json <json-file> [--paid-before <text>] [--price <yen>]');
  process.exit(1);
}

const NOTE_EDITOR_URL = args.url;
const IMAGES_JSON_PATH = path.resolve(args['images-json']);
const PAID_DIVIDER_BEFORE_TEXT = args['paid-before'] || null;
const PRICE_YEN = args.price ? parseInt(args.price, 10) : null;

if (!fs.existsSync(IMAGES_JSON_PATH)) {
  console.error(`Error: images JSON not found: ${IMAGES_JSON_PATH}`);
  process.exit(1);
}

const IMAGES = JSON.parse(fs.readFileSync(IMAGES_JSON_PATH, 'utf-8'));

// Validate images
for (const img of IMAGES) {
  if (!img.file || !img.afterText) {
    console.error(`Error: each image must have "file" and "afterText" fields. Got: ${JSON.stringify(img)}`);
    process.exit(1);
  }
  const absPath = path.resolve(img.file);
  if (!fs.existsSync(absPath)) {
    console.warn(`Warning: image file not found: ${absPath}`);
  }
}

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-profile';

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

  // Insert paid content divider via + menu
  const menuBtn = page.locator('button[aria-label="メニューを開く"]').first();
  const menuVisible = await menuBtn.isVisible().catch(() => false);
  if (menuVisible) {
    await menuBtn.click();
    await page.waitForTimeout(500);
  }

  const paidBtn = page.locator('button').filter({ hasText: /有料コンテンツ/ }).first();
  const paidBtnVisible = await paidBtn.isVisible().catch(() => false);
  console.log(`[paid] 有料コンテンツボタン表示: ${paidBtnVisible}`);

  if (paidBtnVisible) {
    await paidBtn.click();
    await page.waitForTimeout(2000);
    console.log('[paid] 有料コンテンツライン挿入完了');

    const saveBtn = await page.$('button:has-text("下書き保存")');
    if (saveBtn) {
      await saveBtn.click({ force: true });
      await page.waitForTimeout(2000);
      console.log('[paid] 下書き保存完了');
    }
    return true;
  } else {
    console.log('[paid] 有料コンテンツボタンが見つかりません。');
    return false;
  }
}

async function setPriceInPublishSettings(page, priceYen) {
  console.log(`\n--- 価格設定（${priceYen}円）---`);

  const publishBtn = page.locator('button').filter({ hasText: /公開に進む/ }).first();
  const publishBtnVisible = await publishBtn.isVisible().catch(() => false);
  if (!publishBtnVisible) {
    console.log('[price] 「公開に進む」ボタンが見つかりません');
    return false;
  }

  await publishBtn.click();
  await page.waitForTimeout(3000);
  console.log('[price] 公開設定ページへ遷移:', page.url());

  if (!page.url().includes('publish')) {
    console.log('[price] 公開設定ページではありません:', page.url());
    await page.goBack();
    await page.waitForTimeout(2000);
    return false;
  }

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
    console.log('[price] 価格入力フィールドが見つかりません。');
    await page.goBack();
    await page.waitForTimeout(2000);
    return false;
  }

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
  console.log('=== insert_images.js 汎用画像挿入スクリプト開始 ===');
  console.log(`URL: ${NOTE_EDITOR_URL}`);
  console.log(`画像数: ${IMAGES.length}`);
  if (PAID_DIVIDER_BEFORE_TEXT) console.log(`有料ライン: "${PAID_DIVIDER_BEFORE_TEXT}"`);
  if (PRICE_YEN) console.log(`価格: ${PRICE_YEN}円`);

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
    await ctx.close();
    process.exit(1);
  }

  console.log('[OK] エディタページ確認:', url);
  const initialFigs = await page.$$('.ProseMirror figure:has(img)');
  console.log(`初期画像数: ${initialFigs.length}`);

  // Insert images one by one
  const insertedImages = [];
  for (let idx = 0; idx < IMAGES.length; idx++) {
    const imageInfo = IMAGES[idx];
    const label = path.basename(imageInfo.file);
    console.log(`\n--- [${idx + 1}/${IMAGES.length}] ${label} 挿入開始 ---`);

    const found = await findAndClickAfterText(page, imageInfo.afterText);
    if (!found) {
      console.log(`[SKIP] テキストが見つからないためスキップ: ${label}`);
      continue;
    }

    const success = await uploadImageAtCursor(page, imageInfo.file, imageInfo.caption || '');
    if (success) {
      insertedImages.push(label);
      console.log(`[OK] ${label} 挿入成功`);
      await page.waitForTimeout(1000);
    } else {
      console.log(`[FAIL] ${label} 挿入失敗`);
    }
  }

  // Insert paid content divider (optional)
  let paidSuccess = false;
  if (PAID_DIVIDER_BEFORE_TEXT) {
    paidSuccess = await insertPaidDivider(page, PAID_DIVIDER_BEFORE_TEXT);
    if (paidSuccess) {
      console.log('[OK] 有料コンテンツライン挿入成功');
    } else {
      console.log('[WARN] 有料コンテンツライン挿入失敗 — 手動設定が必要');
    }
  }

  // Set price (optional)
  let priceSuccess = false;
  if (PRICE_YEN) {
    priceSuccess = await setPriceInPublishSettings(page, PRICE_YEN);
    if (priceSuccess) {
      console.log(`[OK] 価格設定成功: ${PRICE_YEN}円`);
    } else {
      console.log('[WARN] 価格設定失敗 — 手動設定が必要');
    }
  }

  // Final state
  const finalFigs = await page.$$('.ProseMirror figure:has(img)');
  console.log(`\n=== 完了 ===`);
  console.log(`初期画像数: ${initialFigs.length}`);
  console.log(`最終画像数: ${finalFigs.length}`);
  console.log(`挿入成功: ${insertedImages.join(', ')}`);
  if (PAID_DIVIDER_BEFORE_TEXT) console.log(`有料ライン: ${paidSuccess ? 'OK' : 'MANUAL REQUIRED'}`);
  if (PRICE_YEN) console.log(`価格設定: ${priceSuccess ? `${PRICE_YEN}円 OK` : 'MANUAL REQUIRED'}`);

  await ctx.close();
})();
