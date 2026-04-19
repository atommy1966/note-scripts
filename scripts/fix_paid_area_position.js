#!/usr/bin/env node
'use strict';

/**
 * fix_paid_area_position.js
 * 有料エリア指定ブロックの位置を修正
 * 現在: 記事末尾（誤り）
 * 正解: 「やった対策」見出しの前
 *
 * 手順:
 * 1. 現在の有料エリアブロックを削除（末尾のもの）
 * 2. 「やった対策」見出しの前に挿入
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

  // Check current state
  const editorText = await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror');
    return editor ? editor.innerText : '';
  });

  console.log('[check] 記事末尾200文字:');
  console.log(editorText.substring(editorText.length - 200));

  // Find the paid area block in the DOM
  const paidAreaInfo = await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return null;
    // Look for elements with paid-related attributes or distinctive structure
    const allNodes = Array.from(editor.querySelectorAll('*'));
    const paidNodes = allNodes.filter(n =>
      n.getAttribute('data-type')?.includes('paid') ||
      n.className?.toString().includes('paid') ||
      n.getAttribute('data-name')?.includes('paid') ||
      n.getAttribute('data-node-type')?.includes('paid')
    );
    if (paidNodes.length > 0) {
      return paidNodes.map(n => ({
        tagName: n.tagName,
        dataType: n.getAttribute('data-type'),
        className: n.className?.toString().substring(0, 50),
        text: n.textContent.substring(0, 30),
        outerHTML: n.outerHTML.substring(0, 100),
      }));
    }
    // Also check for HR or special dividers at the end
    const children = Array.from(editor.children);
    return {
      childCount: children.length,
      lastChildren: children.slice(-3).map(c => ({
        tagName: c.tagName,
        dataType: c.getAttribute('data-type'),
        text: c.textContent.substring(0, 40),
        outerHTML: c.outerHTML.substring(0, 100),
      })),
    };
  });
  console.log('[check] エディタ構造:', JSON.stringify(paidAreaInfo, null, 2));

  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/fix_initial.png' });

  // Scroll to bottom to see the paid area
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/fix_bottom.png' });

  // Find "やった対策" in the editor
  const yakattaFound = await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return null;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const results = [];
    while ((node = walker.nextNode())) {
      if (node.textContent.includes('やった対策')) {
        let el = node.parentElement;
        results.push({
          text: el.textContent.substring(0, 50),
          tagName: el.tagName,
        });
      }
    }
    return results;
  });
  console.log('[check] やった対策要素:', JSON.stringify(yakattaFound));

  // Strategy: Click just before "やった対策" and insert paid area there
  // But first we need to delete the wrongly placed one at the end

  // Step 1: Find and click the paid area block at the bottom, then delete it
  // The paid area block is likely after the last text
  const lastChildInfo = await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror');
    const children = Array.from(editor.children);
    const last3 = children.slice(-3);
    return last3.map(c => ({
      tagName: c.tagName,
      dataType: c.getAttribute('data-type'),
      text: c.textContent.substring(0, 60),
      outerHTML: c.outerHTML.substring(0, 150),
    }));
  });
  console.log('[check] 最後3要素:', JSON.stringify(lastChildInfo, null, 2));

  // Find the paid area block and click on it to select
  const paidAreaEl = await page.evaluateHandle(() => {
    const editor = document.querySelector('.ProseMirror');
    const children = Array.from(editor.children);
    // Find the paid area block - typically a div/section with no text or special data-type
    for (let i = children.length - 1; i >= 0; i--) {
      const c = children[i];
      const dt = c.getAttribute('data-type');
      const cls = c.className?.toString() || '';
      if (dt?.includes('paid') || cls.includes('paid') ||
          // Also check if it's an empty-ish block after the last text paragraph
          (c.textContent.trim() === '' && i === children.length - 2)) {
        c.scrollIntoView({ behavior: 'instant', block: 'center' });
        return c;
      }
    }
    return null;
  });

  const paidEl = paidAreaEl.asElement();
  if (paidEl) {
    const box = await paidEl.boundingBox();
    if (box) {
      console.log('[fix] 有料エリアブロック発見、クリックして選択');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/fix_paid_clicked.png' });
    }
  } else {
    console.log('[fix] 有料エリアブロックが見つかりません（data-typeなし）');
    console.log('[fix] 記事末尾をスクロールしてスクリーンショット撮影');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/fix_bottom_detail.png' });
  }

  // Now insert paid area before "やった対策"
  // First, find and click before "やった対策" text
  const yakattaEl = await page.evaluateHandle(() => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return null;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() === 'やった対策' || node.textContent.includes('やった対策')) {
        let el = node.parentElement;
        while (el && !['P', 'H2', 'H3', 'H4', 'LI'].includes(el.tagName)) {
          el = el.parentElement;
        }
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          return el;
        }
      }
    }
    return null;
  });

  const yakEl = yakattaEl.asElement();
  if (yakEl) {
    const box2 = await yakEl.boundingBox();
    console.log('[fix] やった対策要素発見:', box2);
    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/fix_yakatta_area.png' });

    // Click at start of "やった対策" heading
    await page.mouse.click(box2.x + 5, box2.y + box2.height / 2);
    await page.waitForTimeout(500);
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    // Insert new line before
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(500);

    await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/fix_cursor_before_yakatta.png' });

    // Open menu and insert paid area
    const menuBtn = page.locator('button[aria-label="メニューを開く"]').first();
    if (await menuBtn.isVisible().catch(() => false)) {
      await menuBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/fix_menu_open.png' });

      const paidAreaBtn = page.locator('button').filter({ hasText: '有料エリア指定' }).first();
      if (await paidAreaBtn.isVisible().catch(() => false)) {
        await paidAreaBtn.click();
        await page.waitForTimeout(2000);
        console.log('[fix] 有料エリア指定ブロック挿入完了（正しい位置）');
        await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/fix_new_paid_inserted.png' });

        // Save draft
        const saveBtn = await page.$('button:has-text("下書き保存")');
        if (saveBtn) {
          await saveBtn.click({ force: true });
          await page.waitForTimeout(2000);
          console.log('[fix] 下書き保存完了');
        }
      } else {
        console.log('[fix] 有料エリア指定ボタンが見つかりません');
        await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/fix_no_paid_btn.png' });
      }
    }
  } else {
    console.log('[fix] やった対策要素が見つかりません');
  }

  await ctx.close();
  console.log('[fix] 完了');
})();
