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
  // FIX 1: Upload 02_menu_open.png via file chooser
  // ====================================================================
  console.log('--- FIX 1: Upload 02_menu_open.png ---');
  try {
    // Step 1: Click on empty paragraph before "30分が5分になりました"
    const emptyP = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (let i = 0; i < ch.length; i++) {
        if (ch[i].textContent.includes('30分が5分になりました')) {
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            if (ch[j].tagName === 'P' && ch[j].textContent.trim() === '') {
              ch[j].scrollIntoView({ block: 'center' });
              const r = ch[j].getBoundingClientRect();
              return { idx: j, x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
        }
      }
      return null;
    });
    if (!emptyP) throw new Error('Empty paragraph before heading not found');
    console.log('  Clicking empty paragraph at', emptyP.idx);

    await page.mouse.click(emptyP.x, emptyP.y);
    await page.waitForTimeout(1500);

    // Step 2: Find and click the "メニューを開く" (+ button)
    const plusBtn = await page.locator('button[aria-label="メニューを開く"]');
    const plusVisible = await plusBtn.isVisible().catch(() => false);
    console.log('  Plus button visible:', plusVisible);

    if (plusVisible) {
      await plusBtn.click();
      await page.waitForTimeout(1000);
    } else {
      // Try clicking on the empty paragraph again to trigger the menu
      await page.mouse.click(emptyP.x, emptyP.y);
      await page.waitForTimeout(1500);
      // The + button might appear with a delay
      await plusBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
      if (await plusBtn.isVisible().catch(() => false)) {
        await plusBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Step 3: Click "画像" menu item and handle file chooser
    const imageBtn = page.locator('button:has-text("画像")').first();
    const imageVisible = await imageBtn.isVisible().catch(() => false);
    console.log('  Image button visible:', imageVisible);

    if (imageVisible) {
      // Set up file chooser listener before clicking
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        imageBtn.click()
      ]);

      console.log('  File chooser triggered, setting file...');
      await fileChooser.setFiles('/home/murakami/multi-agent-shogun/projects/email_reply_tool/screenshots/02_menu_open.png');
      console.log('  File set, waiting for upload...');
      await page.waitForTimeout(10000); // wait for upload to complete

      // Verify image was added
      const imgCount = await page.evaluate(() => document.querySelectorAll('.ProseMirror figure img').length);
      console.log('  Image count after upload:', imgCount);
      results.fix1 = imgCount >= 7 ? 'success' : 'partial (' + imgCount + ')';
    } else {
      throw new Error('画像 button not visible');
    }
  } catch (e) {
    console.log('  Error:', e.message);
    results.fix1 = 'fail: ' + e.message;
  }
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX 2: Split paragraph (嬉しいです + メール返信に30分)
  // ====================================================================
  console.log('\n--- FIX 2: Split paragraph ---');
  try {
    const needsSplit = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      return ch.some(c => c.textContent.includes('嬉しいです') && c.textContent.includes('メール返信に30分使っていたのが'));
    });

    if (!needsSplit) {
      results.fix2 = 'skip (already separate or not present)';
    } else {
      // Position cursor between the two sentences using Selection API
      const positioned = await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        for (let i = 0; i < ch.length; i++) {
          if (ch[i].textContent.includes('嬉しいです') && ch[i].textContent.includes('メール返信に30分使っていたのが')) {
            ch[i].scrollIntoView({ block: 'center' });
            // Find text node with the boundary
            const walker = document.createTreeWalker(ch[i], NodeFilter.SHOW_TEXT);
            let textNode;
            while (textNode = walker.nextNode()) {
              const idx = textNode.textContent.indexOf('メール返信に30分使っていたのが');
              if (idx >= 0) {
                // Position cursor right before "メール返信に30分"
                const sel = window.getSelection();
                sel.collapse(textNode, idx);
                return { found: true, idx: i, offset: idx };
              }
            }
          }
        }
        return { found: false };
      });
      console.log('  Positioned:', JSON.stringify(positioned));

      if (positioned.found) {
        await page.waitForTimeout(300);
        // Press Enter to split the paragraph
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);

        // Verify split
        const splitOk = await page.evaluate(() => {
          const ch = Array.from(document.querySelector('.ProseMirror').children);
          const hasSeparate = ch.some(c =>
            c.textContent.includes('メール返信に30分使っていたのが') && !c.textContent.includes('嬉しいです')
          );
          return hasSeparate;
        });
        results.fix2 = splitOk ? 'success' : 'fail';
      } else {
        results.fix2 = 'fail (cursor not positioned)';
      }
    }
  } catch (e) { results.fix2 = 'error: ' + e.message; }
  console.log('FIX 2:', results.fix2);
  await page.waitForTimeout(3000);

  // ====================================================================
  // FINAL VERIFICATION
  // ====================================================================
  console.log('\n=== FINAL VERIFICATION ===');
  const finalState = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    let imgCount = 0;
    const elements = [];
    for (let i = 0; i < ch.length; i++) {
      const img = ch[i].querySelector('img');
      const fc = ch[i].querySelector('figcaption');
      if (img) {
        imgCount++;
        const prevText = (i > 0) ? ch[i-1]?.textContent?.trim()?.substring(0, 50) : '';
        const nextText = (i < ch.length-1) ? ch[i+1]?.textContent?.trim()?.substring(0, 50) : '';
        elements.push({ type: 'IMG', num: imgCount, idx: i, cap: fc?.textContent?.trim()?.substring(0, 50) || '', before: prevText, after: nextText });
      } else if (ch[i].textContent.trim()) {
        elements.push({ type: ch[i].tagName, idx: i, text: ch[i].textContent.trim().substring(0, 100) });
      }
    }
    return { imgCount, elements };
  });

  console.log('Total images:', finalState.imgCount);
  finalState.elements.forEach(el => {
    if (el.type === 'IMG') {
      console.log(`  IMG#${el.num} [${el.idx}] ${el.cap || ''}`);
      console.log(`    before: ${el.before}`);
      console.log(`    after: ${el.after}`);
    } else {
      console.log(`  [${el.idx}] ${el.type}: ${el.text}`);
    }
  });

  console.log('\n=== RESULTS ===');
  console.log('  FIX 1 (image upload):', results.fix1);
  console.log('  FIX 2 (paragraph split):', results.fix2);

  await page.waitForTimeout(5000); // autosave
  await ctx.close();
})();
