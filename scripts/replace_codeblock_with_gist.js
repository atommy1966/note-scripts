#!/usr/bin/env node
'use strict';

/**
 * replace_codeblock_with_gist.js
 * noteエディタのコードブロックをGist URLに置換
 *
 * 対象: https://editor.note.com/notes/nbbb28074c02c/edit/
 *
 * 置換対象:
 *  1. コンテキストキャッシュセクションのコードブロック
 *     → https://gist.github.com/naginata63/be9c3ba3b4382cb64c8ec695268b66e8
 *  2. リサイズセクションのコードブロック
 *     → https://gist.github.com/naginata63/1c1da56c36c1c9d94790e2f44bfc35de
 */

const { chromium } = require('@playwright/test');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_EDITOR_URL = 'https://editor.note.com/notes/nbbb28074c02c/edit/';

const GIST_CACHE = 'https://gist.github.com/naginata63/be9c3ba3b4382cb64c8ec695268b66e8';
const GIST_RESIZE = 'https://gist.github.com/naginata63/1c1da56c36c1c9d94790e2f44bfc35de';

async function saveDraft(page) {
  const saveBtn = await page.$('button:has-text("下書き保存")');
  if (saveBtn) {
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2000);
    console.log('[save] 下書き保存完了');
  } else {
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(2000);
    console.log('[save] Ctrl+S で保存');
  }
}

async function countCodeBlocks(page) {
  return await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return 0;
    return editor.querySelectorAll('pre').length;
  });
}

async function getCodeBlockInfo(page) {
  return await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return [];
    const preElements = editor.querySelectorAll('pre');
    return Array.from(preElements).map((pre, idx) => {
      let prevText = '';
      let prev = pre.previousElementSibling;
      let count = 0;
      while (prev && count < 5) {
        prevText = prev.textContent + ' ' + prevText;
        prev = prev.previousElementSibling;
        count++;
      }
      return {
        idx,
        text: pre.textContent.substring(0, 150),
        prevText: prevText.substring(0, 300),
      };
    });
  });
}

/**
 * コードブロックを選択してGist URLに置換
 * @param {object} page - Playwright page
 * @param {number} domIdx - DOMでのインデックス（0-based）
 * @param {string} gistUrl - 置換するGist URL
 */
async function replaceBlock(page, domIdx, gistUrl) {
  const preEls = await page.$$('.ProseMirror pre');
  if (domIdx >= preEls.length) {
    console.log(`[error] コードブロック idx=${domIdx} が見つかりません（DOM数: ${preEls.length}）`);
    return false;
  }

  const preEl = preEls[domIdx];

  // コードブロックまでスクロール
  await preEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  const box = await preEl.boundingBox();
  if (!box) {
    console.log('[error] boundingBox取得失敗');
    return false;
  }

  // Step 1: コードブロック内をクリックしてフォーカス
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  await page.waitForTimeout(300);

  // Step 2: コードブロック内のテキストを全選択（Ctrl+A）
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(300);

  // Step 3: Backspaceで選択内容削除
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(500);

  // Step 4: コードブロックから抜け出す（Escape or ArrowDown）
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // コードブロックが空になったか確認
  const emptyCheck = await page.evaluate((idx) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return false;
    const pres = editor.querySelectorAll('pre');
    if (idx >= pres.length) return false;
    return pres[idx].textContent.trim() === '';
  }, domIdx);

  console.log(`[check] コードブロック空: ${emptyCheck}`);

  // Step 5: コードブロックノード自体を削除
  // コードブロックの前の段落の末尾にカーソルを移動してDeleteキー
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  await page.waitForTimeout(300);

  // コードブロック上の行に移動
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  await page.keyboard.press('End');
  await page.waitForTimeout(200);

  // Delete でコードブロックノードを削除
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);

  // コードブロック数が減ったか確認
  const newCount = await countCodeBlocks(page);
  console.log(`[check] コードブロック数変化後: ${newCount}`);

  // Step 6: Gist URLを入力
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.keyboard.type(gistUrl);
  await page.waitForTimeout(1000);

  // Enterで確定
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  console.log(`[done] Gist URL入力: ${gistUrl}`);
  return true;
}

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  console.log('[init] noteエディタを開く...');
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  // 初期スクリーンショット
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/gist_replace_initial.png' });

  // コードブロック情報を取得
  const blocks = await getCodeBlockInfo(page);
  console.log(`[check] コードブロック数: ${blocks.length}`);

  if (blocks.length === 0) {
    console.log('[info] コードブロックなし。既に置換済みか記事構造が異なります。');
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/gist_replace_no_blocks.png' });
    await ctx.close();
    return;
  }

  blocks.forEach((b) => {
    console.log(`  [${b.idx}] code: "${b.text.substring(0, 80)}"...`);
    console.log(`         prev: "${b.prevText.substring(0, 100)}"...`);
  });

  // コードブロックの種類を特定
  let cacheIdx = -1;
  let resizeIdx = -1;

  for (const b of blocks) {
    const codeText = b.text.toLowerCase();
    const prevText = b.prevText.toLowerCase();
    if (
      codeText.includes('cache_name') || codeText.includes('genai') || codeText.includes('cached_content') ||
      prevText.includes('コンテキストキャッシュ') || prevText.includes('context cach') || prevText.includes('仕組みはシンプル')
    ) {
      cacheIdx = b.idx;
      console.log(`[match] → キャッシュブロック idx=${b.idx}`);
    } else if (
      codeText.includes('pil') || codeText.includes('thumbnail') || codeText.includes('bytesio') ||
      prevText.includes('リサイズ') || prevText.includes('1536') || prevText.includes('512') ||
      prevText.includes('参照画像をリサイズ')
    ) {
      resizeIdx = b.idx;
      console.log(`[match] → リサイズブロック idx=${b.idx}`);
    }
  }

  // マッチしない場合は順番で割り当て
  if (cacheIdx === -1 && resizeIdx === -1) {
    if (blocks.length >= 1) cacheIdx = blocks[0].idx;
    if (blocks.length >= 2) resizeIdx = blocks[1].idx;
    console.log('[warn] 自動判定失敗。順番で割り当て: cache=0, resize=1');
  } else if (cacheIdx === -1 && resizeIdx >= 0) {
    // リサイズのみ判定できた場合、残りをキャッシュとする
    const remaining = blocks.filter(b => b.idx !== resizeIdx);
    if (remaining.length > 0) cacheIdx = remaining[0].idx;
  } else if (resizeIdx === -1 && cacheIdx >= 0) {
    // キャッシュのみ判定できた場合、残りをリサイズとする
    const remaining = blocks.filter(b => b.idx !== cacheIdx);
    if (remaining.length > 0) resizeIdx = remaining[0].idx;
  }

  // ===== キャッシュブロック置換（先に処理） =====
  // Note: cacheIdx < resizeIdx の順で処理（大きい方から処理するとインデックスがズレない）
  // ただし置換後にインデックスが変わるので、毎回DOMから再取得する

  // 大きい方のインデックスから処理（後ろから前へ）
  const processOrder = [];
  if (cacheIdx >= 0) processOrder.push({ idx: cacheIdx, url: GIST_CACHE, label: 'cache' });
  if (resizeIdx >= 0) processOrder.push({ idx: resizeIdx, url: GIST_RESIZE, label: 'resize' });

  // インデックスが大きい方から処理（前のブロックを処理してもインデックスがズレない）
  processOrder.sort((a, b) => b.idx - a.idx);

  for (const item of processOrder) {
    console.log(`\n[process] ${item.label} ブロック (idx=${item.idx}) を ${item.url} に置換...`);

    // 現在のコードブロック数を確認
    const currentBlocks = await getCodeBlockInfo(page);
    console.log(`[check] 現在のブロック数: ${currentBlocks.length}`);

    // 後ろから処理しているので現在のインデックスはそのまま使える
    const success = await replaceBlock(page, item.idx, item.url);

    if (!success) {
      console.log(`[error] ${item.label} ブロックの置換に失敗`);
    }

    // 中間スクリーンショット
    await page.screenshot({
      path: `/home/murakami/multi-agent-shogun/queue/reports/gist_replace_${item.label}.png`
    });

    // 保存
    await saveDraft(page);
    await page.waitForTimeout(1000);
  }

  // 最終確認
  const finalBlocks = await getCodeBlockInfo(page);
  console.log(`\n[result] 最終コードブロック数: ${finalBlocks.length}`);
  if (finalBlocks.length === 0) {
    console.log('[result] ✅ 全コードブロックをGist URLに置換完了');
  } else {
    console.log('[result] ⚠️ まだコードブロックが残っています:');
    finalBlocks.forEach(b => console.log(`  - "${b.text.substring(0, 80)}"`));
  }

  // 最終スクリーンショット
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/gist_replace_final.png' });

  await ctx.close();
  console.log('[done] 完了');
})();
