#!/usr/bin/env node
'use strict';

/**
 * finalize_paid_gemini.js
 * 1. 「この記事を書いた甲斐があります」の後に「有料エリア指定」ブロックを挿入
 * 2. publishページで「有料」選択 + 価格100円入力
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

  // ===== Phase 1: 有料エリア指定ブロック挿入 =====
  console.log('=== Phase 1: 有料エリア指定挿入 ===');
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // まず有料エリア指定ブロックがすでに存在するかチェック
  const existingPaidArea = await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return false;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes('有料エリア') || node.textContent.includes('ここから有料')) {
        return node.textContent.substring(0, 30);
      }
    }
    // Also check for data-type attributes
    const paid = editor.querySelector('[data-type*="paid"], [class*="paid"], [data-name*="paid"]');
    return paid ? paid.outerHTML.substring(0, 80) : false;
  });
  console.log('[paid] 既存の有料エリアブロック:', existingPaidArea || 'なし');

  if (!existingPaidArea) {
    // Find anchor: "この記事を書いた甲斐があります"
    const ANCHOR = 'この記事を書いた甲斐があります';

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
    }, ANCHOR);

    if (!found) {
      console.log('[paid] アンカーテキストが見つかりません:', ANCHOR);
      await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/finalize_anchor_notfound.png' });
    } else {
      console.log('[paid] アンカー発見:', found);
      await page.waitForTimeout(1000);

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
      }, ANCHOR);

      const elHandle = el.asElement();
      const box = await elHandle?.boundingBox();
      if (!box) {
        console.log('[paid] バウンディングボックス取得失敗');
      } else {
        // Click at end of the paragraph
        await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2);
        await page.waitForTimeout(500);
        await page.keyboard.press('End');
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(800);
        await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/finalize_cursor.png' });

        // Open floating menu
        const menuBtn = page.locator('button[aria-label="メニューを開く"]').first();
        if (await menuBtn.isVisible().catch(() => false)) {
          await menuBtn.click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/finalize_menu_open.png' });

          // Click 有料エリア指定
          const paidAreaBtn = page.locator('button').filter({ hasText: '有料エリア指定' }).first();
          if (await paidAreaBtn.isVisible().catch(() => false)) {
            await paidAreaBtn.click();
            await page.waitForTimeout(2000);
            console.log('[paid] 有料エリア指定ブロック挿入完了');
            await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/finalize_paid_inserted.png' });

            // Save draft
            const saveBtn = await page.$('button:has-text("下書き保存")');
            if (saveBtn) {
              await saveBtn.click({ force: true });
              await page.waitForTimeout(2000);
              console.log('[paid] 下書き保存完了');
            }
          } else {
            console.log('[paid] 有料エリア指定ボタンが見つかりません');
            const btns = await page.$$eval('button', els =>
              els.filter(e => e.offsetParent !== null).map(e => e.textContent.trim()).filter(t => t)
            );
            console.log('[paid] 可視ボタン:', btns.slice(0, 20));
            await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/finalize_menu_btns.png' });
          }
        } else {
          console.log('[paid] メニューボタンが見つかりません');
          await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/finalize_no_menu.png' });
        }
      }
    }
  } else {
    console.log('[paid] 有料エリアブロックはすでに存在します。スキップ。');
  }

  // ===== Phase 2: 価格100円設定 =====
  console.log('\n=== Phase 2: 価格100円設定 ===');
  await page.goto(NOTE_PUBLISH_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/finalize_publish_initial.png' });

  // Click 有料 radio
  const paidLabel = page.locator('label[for="paid"]');
  const paidRadio = page.locator('input[name="is_paid"][value="paid"]');

  if (await paidLabel.isVisible().catch(() => false)) {
    await paidLabel.click();
    await page.waitForTimeout(2000);
    console.log('[price] 有料ラベルクリック');
  } else if (await paidRadio.isVisible().catch(() => false)) {
    await paidRadio.click();
    await page.waitForTimeout(2000);
    console.log('[price] 有料ラジオクリック');
  } else {
    // Try force click by JS
    await page.evaluate(() => {
      const radio = document.querySelector('input[name="is_paid"][value="paid"]');
      if (radio) {
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(2000);
    console.log('[price] JS経由で有料クリック');
  }

  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/finalize_paid_radio.png' });

  // Find price input (placeholder="300" type="text")
  const priceInput = page.locator('input[placeholder="300"]').first();
  if (await priceInput.isVisible().catch(() => false)) {
    await priceInput.click({ clickCount: 3 });
    await page.waitForTimeout(300);
    await priceInput.fill('100');
    await page.waitForTimeout(500);
    console.log('[price] 価格100円入力完了');
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/finalize_price_set.png' });
  } else {
    // Try other approaches
    const allPriceInputs = await page.$$('input[type="text"]');
    console.log('[price] テキストinput数:', allPriceInputs.length);
    for (const inp of allPriceInputs) {
      const ph = await inp.getAttribute('placeholder');
      const val = await inp.inputValue();
      console.log(`  placeholder="${ph}" value="${val}"`);
      if (ph === '300' || val === '300') {
        await inp.click({ clickCount: 3 });
        await page.waitForTimeout(300);
        await inp.fill('100');
        await page.waitForTimeout(500);
        console.log('[price] 価格100円入力完了（代替）');
        break;
      }
    }
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/finalize_price_alt.png' });
  }

  // Verify the settings and navigate to editor (saves settings)
  await page.waitForTimeout(1000);

  // Look for "保存" button on publish page to save without publishing
  const saveDraftBtn = page.locator('button').filter({ hasText: /下書き保存|保存して戻る/ }).first();
  if (await saveDraftBtn.isVisible().catch(() => false)) {
    await saveDraftBtn.click();
    await page.waitForTimeout(2000);
    console.log('[price] 保存して戻る完了');
  } else {
    // Just navigate back - publish page settings may auto-save
    await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log('[price] エディタに戻りました（設定はURLセッションに保存）');
  }

  // Final verification screenshot
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/finalize_complete.png' });
  console.log('\n=== 完了 ===');
  console.log('スクリーンショット: queue/reports/finalize_*.png');
  await ctx.close();
})();
