const { chromium } = require('@playwright/test');
(async () => {
  const ctx = await chromium.launchPersistentContext(
    '/home/murakami/.cache/ms-playwright/note-cli-profile',
    { headless: false, locale: 'ja-JP', viewport: { width: 1280, height: 800 } }
  );
  const page = await ctx.newPage();
  await page.goto('https://editor.note.com/notes/ncef792faac1f/edit/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  console.log('URL:', page.url());

  const results = {};

  // ====================================================================
  // FIX MEDIUM-4: Use Selection API to position cursor precisely
  // ====================================================================
  console.log('--- MEDIUM-4: Fix sentence split ---');
  try {
    // Step 1: Position cursor at end of "使い続け" text node and type "られます。"
    const positioned = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      const ch = Array.from(pm.children);
      for (let i = 0; i < ch.length; i++) {
        if (ch[i].tagName === 'P' && ch[i].textContent.includes('使い続け') && !ch[i].textContent.includes('使い続けられます')) {
          ch[i].scrollIntoView({ block: 'center' });
          const walker = document.createTreeWalker(ch[i], NodeFilter.SHOW_TEXT);
          let textNode;
          while (textNode = walker.nextNode()) {
            if (textNode.textContent.endsWith('使い続け') || textNode.textContent.includes('使い続け')) {
              const idx = textNode.textContent.lastIndexOf('使い続け');
              const offset = idx + 4; // after "使い続け"
              const sel = window.getSelection();
              sel.collapse(textNode, offset);
              return { idx: i, textLen: textNode.textContent.length, offset };
            }
          }
        }
      }
      return null;
    });
    console.log('  Positioned cursor:', JSON.stringify(positioned));

    if (positioned) {
      await page.waitForTimeout(300);
      // Focus the editor first
      await page.click('.ProseMirror', { position: { x: 1, y: 1 }, force: true });
      await page.waitForTimeout(100);
      // Re-position cursor
      await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        for (let i = 0; i < ch.length; i++) {
          if (ch[i].tagName === 'P' && ch[i].textContent.includes('使い続け') && !ch[i].textContent.includes('使い続けられます')) {
            const walker = document.createTreeWalker(ch[i], NodeFilter.SHOW_TEXT);
            let textNode;
            while (textNode = walker.nextNode()) {
              if (textNode.textContent.includes('使い続け')) {
                const offset = textNode.textContent.lastIndexOf('使い続け') + 4;
                window.getSelection().collapse(textNode, Math.min(offset, textNode.textContent.length));
                return;
              }
            }
          }
        }
      });
      await page.waitForTimeout(300);
      await page.keyboard.type('られます。', { delay: 30 });
      await page.waitForTimeout(1500);

      // Step 2: Delete standalone "られます。" paragraph
      const deleted = await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        for (let i = 0; i < ch.length; i++) {
          if (ch[i].tagName === 'P' && ch[i].textContent.trim() === 'られます。') {
            ch[i].scrollIntoView({ block: 'center' });
            // Select this paragraph
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(ch[i]);
            sel.removeAllRanges();
            sel.addRange(range);
            return i;
          }
        }
        return -1;
      });

      if (deleted >= 0) {
        await page.waitForTimeout(300);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(500);
        // Delete empty paragraph left behind
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(500);
        console.log('  Deleted standalone "られます。" at', deleted);
      }

      // Verify
      const check = await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        return {
          hasMerged: ch.some(c => c.textContent.includes('使い続けられます')),
          hasStandalone: ch.some(c => c.textContent.trim() === 'られます。'),
        };
      });
      console.log('  Merge check:', JSON.stringify(check));
      results.MEDIUM4 = check.hasMerged && !check.hasStandalone ? 'OK' : 'FAILED';
    } else {
      // Maybe already merged?
      const alreadyMerged = await page.evaluate(() => {
        return Array.from(document.querySelector('.ProseMirror').children).some(c => c.textContent.includes('使い続けられます'));
      });
      results.MEDIUM4 = alreadyMerged ? 'OK (already merged)' : 'FAILED (cursor not positioned)';
    }
  } catch (e) { results.MEDIUM4 = 'ERROR: ' + e.message; }
  console.log('MEDIUM-4:', results.MEDIUM4);
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX HIGH-2: Add missing paragraph with Selection API
  // ====================================================================
  console.log('--- HIGH-2: Add missing paragraph ---');
  try {
    const exists = await page.evaluate(() => {
      return Array.from(document.querySelector('.ProseMirror').children)
        .some(c => c.textContent.includes('メール返信に30分使っていたのが5分になる'));
    });
    if (exists) {
      results.HIGH2 = 'OK (already present)';
    } else {
      // Position cursor at end of "使っていただけると嬉しいです。"
      await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        for (let i = 0; i < ch.length; i++) {
          if (ch[i].textContent.includes('使っていただけると嬉しいです')) {
            ch[i].scrollIntoView({ block: 'center' });
            const walker = document.createTreeWalker(ch[i], NodeFilter.SHOW_TEXT);
            let textNode, lastNode;
            while (textNode = walker.nextNode()) { lastNode = textNode; }
            if (lastNode) {
              window.getSelection().collapse(lastNode, lastNode.textContent.length);
            }
            return;
          }
        }
      });
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      await page.keyboard.type('メール返信に30分使っていたのが5分になる。それだけで、副業に使える時間が大きく増えます。', { delay: 15 });
      await page.waitForTimeout(1500);

      // Verify it's a separate paragraph
      const check = await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        for (let i = 0; i < ch.length; i++) {
          if (ch[i].textContent.includes('メール返信に30分使っていたのが5分になる')) {
            // Check it's NOT in the same paragraph as "嬉しいです"
            return !ch[i].textContent.includes('嬉しいです');
          }
        }
        return false;
      });
      results.HIGH2 = check ? 'OK' : 'FAILED';
    }
  } catch (e) { results.HIGH2 = 'ERROR: ' + e.message; }
  console.log('HIGH-2:', results.HIGH2);
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX HIGH-3: Check and fix 02_menu_open image
  // ====================================================================
  console.log('--- HIGH-3: Check 02_menu_open ---');
  try {
    const imgCheck = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      const images = [];
      for (let i = 0; i < ch.length; i++) {
        const img = ch[i].querySelector('img');
        if (img) images.push({ idx: i, src: img.src.split('/').pop() });
        // Also check for empty figures
        if (ch[i].tagName === 'FIGURE' && !ch[i].querySelector('img')) {
          images.push({ idx: i, src: 'EMPTY_FIGURE' });
        }
      }
      return { total: images.filter(i => i.src !== 'EMPTY_FIGURE').length, all: images };
    });
    console.log('  Images:', imgCheck.total, '/ Empty figures:', imgCheck.all.filter(i => i.src === 'EMPTY_FIGURE').length);
    imgCheck.all.forEach(i => console.log(`    [${i.idx}] ${i.src}`));

    if (imgCheck.total < 7) {
      // Need to re-upload. Try file drop approach
      console.log('  Attempting image upload via drop event...');

      // First position cursor between workflow image and "30分が5分" heading
      const targetPos = await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        for (let i = 0; i < ch.length; i++) {
          if (ch[i].textContent.includes('30分が5分になりました')) {
            // Find the empty P just before this heading
            for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
              if (ch[j].tagName === 'P' && ch[j].textContent.trim() === '') {
                ch[j].scrollIntoView({ block: 'center' });
                const r = ch[j].getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
              }
            }
            // Just use the heading itself
            ch[i].scrollIntoView({ block: 'center' });
            const r = ch[i].getBoundingClientRect();
            return { x: r.x + 5, y: r.y - 5 };
          }
        }
        return null;
      });

      if (targetPos) {
        await page.mouse.click(targetPos.x, targetPos.y);
        await page.waitForTimeout(500);

        // Try to upload image by creating a file input and uploading
        // Download image first
        const imgUrl = 'https://assets.st-note.com/img/1772766352-91V2wcjKIfUO8MDPSqEy7uGp.png';

        // Use drop event with proper File and DataTransfer
        const dropResult = await page.evaluate(async (url) => {
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            const file = new File([blob], 'menu_open.png', { type: 'image/png' });

            const dt = new DataTransfer();
            dt.items.add(file);

            const pm = document.querySelector('.ProseMirror');
            const dropEvent = new DragEvent('drop', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dt
            });
            pm.dispatchEvent(dropEvent);
            return 'drop_dispatched';
          } catch (e) {
            return 'error: ' + e.message;
          }
        }, imgUrl);
        console.log('  Drop result:', dropResult);
        await page.waitForTimeout(8000); // wait for upload

        // Check again
        const newCount = await page.evaluate(() => {
          return document.querySelectorAll('.ProseMirror figure img').length;
        });
        console.log('  Images after drop:', newCount);
        results.HIGH3 = newCount >= 7 ? 'OK' : 'PARTIAL (' + newCount + ')';
      } else {
        results.HIGH3 = 'FAILED (target not found)';
      }
    } else {
      results.HIGH3 = 'OK (' + imgCheck.total + ' images)';
    }

    // Clean up any empty figures
    const cleanedEmpty = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      let count = 0;
      for (let i = ch.length - 1; i >= 0; i--) {
        if (ch[i].tagName === 'FIGURE' && !ch[i].querySelector('img') && ch[i].textContent.trim() === '') {
          count++;
        }
      }
      return count;
    });
    if (cleanedEmpty > 0) {
      console.log('  Found', cleanedEmpty, 'empty figures to clean');
      for (let j = 0; j < cleanedEmpty; j++) {
        const emptyIdx = await page.evaluate(() => {
          const ch = Array.from(document.querySelector('.ProseMirror').children);
          for (let i = 0; i < ch.length; i++) {
            if (ch[i].tagName === 'FIGURE' && !ch[i].querySelector('img') && ch[i].textContent.trim() === '') return i;
          }
          return -1;
        });
        if (emptyIdx >= 0) {
          await page.evaluate((idx) => {
            document.querySelector('.ProseMirror').children[idx]?.scrollIntoView({ block: 'center' });
          }, emptyIdx);
          const r = await page.evaluate((idx) => {
            const el = document.querySelector('.ProseMirror').children[idx];
            const rect = el.getBoundingClientRect();
            return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
          }, emptyIdx);
          await page.mouse.click(r.x, r.y);
          await page.waitForTimeout(300);
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(500);
        }
      }
    }
  } catch (e) { results.HIGH3 = 'ERROR: ' + e.message; }
  console.log('HIGH-3:', results.HIGH3);

  // Wait for autosave
  await page.waitForTimeout(5000);

  // Final count
  const finalImgCount = await page.evaluate(() => {
    return document.querySelectorAll('.ProseMirror figure img').length;
  });
  console.log('\nFinal image count:', finalImgCount);

  console.log('\n=== RESULTS ===');
  Object.entries(results).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  await ctx.close();
})();
