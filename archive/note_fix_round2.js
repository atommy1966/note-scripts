const { chromium } = require('@playwright/test');
const fs = require('fs');
(async () => {
  const ctx = await chromium.launchPersistentContext(
    '/home/murakami/.cache/ms-playwright/note-cli-profile',
    { headless: false, locale: 'ja-JP', viewport: { width: 1280, height: 800 } }
  );
  const page = await ctx.newPage();
  await page.goto('https://editor.note.com/notes/ncef792faac1f/edit/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  const results = {};

  async function findEl(text) {
    return page.evaluate((t) => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (let i = 0; i < ch.length; i++) {
        if (ch[i].textContent.includes(t)) return i;
      }
      return -1;
    }, text);
  }

  async function scrollTo(idx) {
    await page.evaluate((i) => {
      document.querySelector('.ProseMirror').children[i]?.scrollIntoView({ block: 'center' });
    }, idx);
    await page.waitForTimeout(500);
  }

  async function getElRect(idx) {
    return page.evaluate((i) => {
      const el = document.querySelector('.ProseMirror').children[i];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width/2, cy: r.y + r.height/2, left: r.left, right: r.right };
    }, idx);
  }

  // ====================================================================
  // FIX MEDIUM-4: Fix sentence split by adding text (not moving image)
  // Current: [52] "...使い続け" → [53] IMG → [54] "られます。"
  // Strategy: Type "られます。" at end of [52], then delete [54]
  // ====================================================================
  console.log('--- MEDIUM-4: Fix sentence split ---');
  try {
    const textIdx = await findEl('使い続け');
    if (textIdx < 0) throw new Error('"使い続け" not found');

    // Step 1: Click at end of "使い続け" and type "られます。"
    await scrollTo(textIdx);
    const rect = await getElRect(textIdx);
    await page.mouse.click(rect.right - 10, rect.cy);
    await page.waitForTimeout(300);
    await page.keyboard.press('End');
    await page.waitForTimeout(200);
    await page.keyboard.type('られます。', { delay: 20 });
    await page.waitForTimeout(1000);

    // Step 2: Delete the standalone "られます。" paragraph
    const rareIdx = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (let i = 0; i < ch.length; i++) {
        if (ch[i].textContent.trim() === 'られます。') return i;
      }
      return -1;
    });
    if (rareIdx >= 0) {
      await scrollTo(rareIdx);
      const rareRect = await getElRect(rareIdx);
      await page.mouse.click(rareRect.cx, rareRect.cy, { clickCount: 3 });
      await page.waitForTimeout(300);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
      // Delete empty paragraph left behind
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
    }

    const check = await findEl('使い続けられます');
    results.MEDIUM4 = check >= 0 ? 'OK' : 'FAILED';
  } catch (e) { results.MEDIUM4 = 'ERROR: ' + e.message; }
  console.log('MEDIUM-4:', results.MEDIUM4);
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX MEDIUM-5: Fix caption via direct DOM + input event
  // ====================================================================
  console.log('--- MEDIUM-5: Fix caption ---');
  try {
    // Try direct DOM approach first
    const domResult = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      const figures = pm.querySelectorAll('figure');
      for (const fig of figures) {
        const fc = fig.querySelector('figcaption');
        if (fc && fc.textContent.includes('AI生成結果') && fc.textContent.includes('対応できるメール')) {
          // Find the text node(s) in the figcaption
          const walker = document.createTreeWalker(fc, NodeFilter.SHOW_TEXT);
          let node;
          while (node = walker.nextNode()) {
            if (node.textContent.includes('対応できるメール')) {
              const cutIdx = node.textContent.indexOf('対応できるメール');
              // If the text is in one node, just truncate
              if (node.textContent.includes('状態対応')) {
                const splitIdx = node.textContent.indexOf('状態') + 2;
                node.textContent = node.textContent.substring(0, splitIdx);
              } else {
                // Remove this text node entirely
                node.textContent = '';
              }
              pm.dispatchEvent(new Event('input', { bubbles: true }));
              return 'dom_modified';
            }
          }
          return 'text_node_not_found';
        }
      }
      return 'figure_not_found';
    });
    console.log('  DOM approach:', domResult);

    if (domResult !== 'dom_modified') {
      // Fallback: try keyboard approach with more precise clicking
      const capIdx = await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        for (let i = 0; i < ch.length; i++) {
          const fc = ch[i].querySelector('figcaption');
          if (fc && fc.textContent.includes('AI生成結果') && fc.textContent.includes('対応できるメール')) return i;
        }
        return -1;
      });

      if (capIdx >= 0) {
        await scrollTo(capIdx);
        // Double-click on "生成結果" to position cursor in caption
        const wordPos = await page.evaluate((idx) => {
          const fc = document.querySelector('.ProseMirror').children[idx].querySelector('figcaption');
          if (!fc) return null;
          // Get position of the caption text
          const range = document.createRange();
          const textNode = fc.firstChild;
          if (!textNode) return null;
          range.setStart(textNode, 0);
          range.setEnd(textNode, textNode.length);
          const r = range.getBoundingClientRect();
          return { x: r.x + 30, y: r.y + r.height / 2 };
        }, capIdx);

        if (wordPos) {
          await page.mouse.click(wordPos.x, wordPos.y);
          await page.waitForTimeout(500);
          // Ctrl+A to select all in caption
          await page.keyboard.press('Control+a');
          await page.waitForTimeout(200);
          await page.keyboard.type('AI生成結果：メール返信案が自動で作成された状態', { delay: 10 });
          await page.waitForTimeout(1000);
        }
      }
    }

    await page.waitForTimeout(1000);
    const capCheck = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (let i = 0; i < ch.length; i++) {
        const fc = ch[i].querySelector('figcaption');
        if (fc && fc.textContent.includes('AI生成結果')) return fc.textContent;
      }
      return '';
    });
    console.log('  Caption now:', capCheck);
    results.MEDIUM5 = capCheck.includes('対応できるメール') ? 'FAILED' : 'OK';
  } catch (e) { results.MEDIUM5 = 'ERROR: ' + e.message; }
  console.log('MEDIUM-5:', results.MEDIUM5);
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX HIGH-2: Add missing paragraph
  // ====================================================================
  console.log('--- HIGH-2: Add missing paragraph ---');
  try {
    // First check if it already exists
    const exists = await findEl('メール返信に30分使っていたのが5分になる');
    if (exists >= 0) {
      results.HIGH2 = 'OK (already present)';
    } else {
      const refIdx = await findEl('副業の効率を上げたい方に使っていただけると嬉しいです');
      if (refIdx < 0) throw new Error('reference not found');
      await scrollTo(refIdx);

      // Click at end of the paragraph
      const rect = await getElRect(refIdx);
      await page.mouse.click(rect.right - 20, rect.cy);
      await page.waitForTimeout(300);
      await page.keyboard.press('End');
      await page.waitForTimeout(200);

      // Create new paragraph and type
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      await page.keyboard.type('メール返信に30分使っていたのが5分になる。それだけで、副業に使える時間が大きく増えます。', { delay: 15 });
      await page.waitForTimeout(1500);

      const check = await findEl('メール返信に30分使っていたのが5分になる');
      results.HIGH2 = check >= 0 ? 'OK' : 'FAILED';
    }
  } catch (e) { results.HIGH2 = 'ERROR: ' + e.message; }
  console.log('HIGH-2:', results.HIGH2);
  await page.waitForTimeout(2000);

  // ====================================================================
  // CLEANUP: Delete empty figure at [60]
  // ====================================================================
  console.log('--- CLEANUP: Delete empty figure ---');
  try {
    const emptyFigIdx = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (let i = 0; i < ch.length; i++) {
        if (ch[i].tagName === 'FIGURE' && !ch[i].querySelector('img') && ch[i].textContent.trim() === '') return i;
      }
      return -1;
    });
    if (emptyFigIdx >= 0) {
      await scrollTo(emptyFigIdx);
      const figRect = await getElRect(emptyFigIdx);
      await page.mouse.click(figRect.cx, figRect.cy);
      await page.waitForTimeout(300);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
      console.log('  Deleted empty figure at', emptyFigIdx);
      results.CLEANUP = 'OK';
    } else {
      results.CLEANUP = 'NO_EMPTY_FIGURE';
    }
  } catch (e) { results.CLEANUP = 'ERROR: ' + e.message; }
  console.log('CLEANUP:', results.CLEANUP);
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX HIGH-3: Re-upload 02_menu_open image
  // The original image URL from note's CDN
  // ====================================================================
  console.log('--- HIGH-3: Re-upload 02_menu_open ---');
  try {
    // Position cursor after workflow image (IMG#2), before "30分が5分" heading
    const h2Idx = await findEl('30分が5分になりました');
    if (h2Idx < 0) throw new Error('target heading not found');

    // Find the empty paragraph just before the heading (between workflow img and heading)
    const targetIdx = h2Idx - 1; // should be empty P before H2
    await scrollTo(targetIdx);
    const tRect = await getElRect(targetIdx);
    await page.mouse.click(tRect.cx, tRect.cy);
    await page.waitForTimeout(300);

    // Try to paste image via clipboard API
    const pasteResult = await page.evaluate(async () => {
      try {
        // Fetch the original image from note's CDN
        const imgUrl = 'https://assets.st-note.com/img/1772766352-91V2wcjKIfUO8MDPSqEy7uGp.png';
        const response = await fetch(imgUrl);
        if (!response.ok) return 'fetch_failed: ' + response.status;
        const blob = await response.blob();

        const file = new File([blob], '02_menu_open.png', { type: 'image/png' });
        const dt = new DataTransfer();
        dt.items.add(file);

        const pm = document.querySelector('.ProseMirror');
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true
        });
        pm.dispatchEvent(pasteEvent);
        return 'paste_dispatched';
      } catch (e) {
        return 'error: ' + e.message;
      }
    });
    console.log('  Paste result:', pasteResult);

    // Wait for upload to process
    await page.waitForTimeout(5000);

    // Check if image was added
    const imgCount = await page.evaluate(() => {
      return document.querySelectorAll('.ProseMirror figure img').length;
    });
    console.log('  Image count after paste:', imgCount);
    results.HIGH3 = imgCount >= 7 ? 'OK' : 'PARTIAL (' + imgCount + ' images, need 7)';
  } catch (e) { results.HIGH3 = 'ERROR: ' + e.message; }
  console.log('HIGH-3:', results.HIGH3);
  await page.waitForTimeout(5000);

  // ====================================================================
  // FINAL VERIFICATION
  // ====================================================================
  const finalState = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    return ch.map((el, i) => {
      const img = el.querySelector('img');
      const fc = el.querySelector('figcaption');
      return {
        i, tag: el.tagName, text: el.textContent.trim().substring(0, 100),
        empty: el.textContent.trim().length === 0,
        hasImg: !!img, caption: fc ? fc.textContent.trim().substring(0, 80) : null,
      };
    });
  });

  console.log('\n=== FINAL STATE ===');
  let imgN = 0;
  finalState.forEach(el => {
    if (el.hasImg) { imgN++; console.log(`  [${el.i}] IMG#${imgN} cap="${el.caption || '(none)'}"`); }
    else if (!el.empty) console.log(`  [${el.i}] ${el.tag}: ${el.text}`);
  });
  console.log('  Total images:', imgN);

  console.log('\n=== RESULTS ===');
  Object.entries(results).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  await ctx.close();
})();
