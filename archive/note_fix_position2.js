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

  // Step 1: Get CDN URL of misplaced 02_menu_open and identify elements
  const info = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    const imgs = [];
    for (let i = 0; i < ch.length; i++) {
      const img = ch[i].querySelector('img');
      if (img) {
        imgs.push({ idx: i, src: img.src, shortSrc: img.src.split('/').pop().substring(0, 30) });
      }
    }
    return imgs;
  });
  console.log('All images:');
  info.forEach(i => console.log(`  [${i.idx}] ${i.shortSrc}`));

  // The misplaced images are at [1] and [2] (both 02_menu_open uploads)
  // Keep one CDN URL for reinsertion
  const cdnUrl = info[0].src; // IMG at [1] = newest upload
  console.log('\nCDN URL to reuse:', cdnUrl.substring(0, 80) + '...');

  // Step 2: Delete BOTH misplaced images at top (positions [1] and [2])
  // Delete from bottom up to avoid index shift
  for (let round = 0; round < 2; round++) {
    const deleted = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      // Find the first figure that is NOT the cover image (cover has src containing 1772766339)
      // and NOT a content image (those are after index 10)
      for (let i = 0; i < Math.min(ch.length, 5); i++) {
        const img = ch[i].querySelector('img');
        if (img && !img.src.includes('1772766339')) {
          // This is a misplaced 02_menu_open
          img.scrollIntoView({ block: 'center' });
          const r = img.getBoundingClientRect();
          return { idx: i, x: r.x + r.width / 2, y: r.y + r.height / 2, src: img.src.split('/').pop().substring(0, 30) };
        }
      }
      return null;
    });

    if (deleted) {
      console.log(`\nDeleting misplaced image round ${round + 1}:`, deleted.shortSrc || deleted.src);
      await page.mouse.click(deleted.x, deleted.y);
      await page.waitForTimeout(500);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(1000);
      // Delete empty paragraph left behind
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
    } else {
      console.log(`Round ${round + 1}: No more misplaced images found`);
      break;
    }
  }

  const countAfterDelete = await page.evaluate(() => document.querySelectorAll('.ProseMirror figure img').length);
  console.log('Images after deleting misplaced:', countAfterDelete);

  await page.waitForTimeout(2000);

  // Step 3: Insert image at correct position using execCommand('insertHTML')
  // Position cursor between workflow image (1772766346) and "30分が5分になりました" heading
  const positioned = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    for (let i = 0; i < ch.length; i++) {
      if (ch[i].textContent.includes('30分が5分になりました') && ch[i].tagName === 'H2') {
        // Look for empty P before this heading
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          if (ch[j].tagName === 'P' && ch[j].textContent.trim() === '') {
            ch[j].scrollIntoView({ block: 'center' });
            // Place cursor inside this empty paragraph
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(ch[j], 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            const r = ch[j].getBoundingClientRect();
            return { method: 'emptyP', idx: j, x: r.x + 10, y: r.y + r.height / 2 };
          }
        }
        // No empty P found, try clicking just before the heading
        ch[i].scrollIntoView({ block: 'center' });
        const r = ch[i].getBoundingClientRect();
        return { method: 'beforeH2', idx: i, x: r.x + 5, y: r.y - 2 };
      }
    }
    return null;
  });
  console.log('\nTarget position:', JSON.stringify(positioned));

  if (positioned) {
    // Click to ensure focus
    await page.mouse.click(positioned.x, positioned.y);
    await page.waitForTimeout(500);

    // Try execCommand('insertHTML') with figure+img
    const insertResult = await page.evaluate((url) => {
      // Re-position cursor
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (let i = 0; i < ch.length; i++) {
        if (ch[i].textContent.includes('30分が5分になりました') && ch[i].tagName === 'H2') {
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            if (ch[j].tagName === 'P' && ch[j].textContent.trim() === '') {
              const sel = window.getSelection();
              const range = document.createRange();
              range.setStart(ch[j], 0);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);

              // Try insertHTML
              const html = '<figure><img src="' + url + '" alt="02_menu_open"><figcaption></figcaption></figure>';
              const ok = document.execCommand('insertHTML', false, html);
              return { ok, method: 'insertHTML' };
            }
          }
          // If no empty P, try before heading
          const sel = window.getSelection();
          const range = document.createRange();
          range.setStart(ch[i], 0);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          const html = '<figure><img src="' + url + '" alt="02_menu_open"><figcaption></figcaption></figure>';
          const ok = document.execCommand('insertHTML', false, html);
          return { ok, method: 'insertHTML_beforeH2' };
        }
      }
      return { ok: false, method: 'not_found' };
    }, cdnUrl);
    console.log('Insert result:', JSON.stringify(insertResult));
    await page.waitForTimeout(3000);
  }

  // Step 4: Verify
  const finalImgs = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    let imgN = 0;
    const result = [];
    for (let i = 0; i < ch.length; i++) {
      const img = ch[i].querySelector('img');
      const fc = ch[i].querySelector('figcaption');
      if (img) {
        imgN++;
        const prev = ch[i-1]?.textContent?.trim()?.substring(0, 50) || '';
        const next = ch[i+1]?.textContent?.trim()?.substring(0, 50) || '';
        result.push(`IMG#${imgN} [${i}] src=${img.src.split('/').pop().substring(0, 30)} prev=[${prev}] next=[${next}] cap=[${fc?.textContent?.trim()?.substring(0, 40) || ''}]`);
      }
    }
    result.push('Total: ' + imgN);
    return result;
  });
  console.log('\n=== AFTER INSERT ===');
  finalImgs.forEach(l => console.log('  ' + l));

  // If insertHTML didn't work, try alternative: upload via + menu then check position
  const totalAfterInsert = parseInt(finalImgs[finalImgs.length - 1].replace('Total: ', ''));
  if (totalAfterInsert < 7) {
    console.log('\ninsertHTML did not add image. Trying file upload approach...');
    // Navigate to target position
    const target = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (let i = 0; i < ch.length; i++) {
        if (ch[i].textContent.includes('30分が5分になりました') && ch[i].tagName === 'H2') {
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            if (ch[j].tagName === 'P' && ch[j].textContent.trim() === '') {
              ch[j].scrollIntoView({ block: 'center' });
              const r = ch[j].getBoundingClientRect();
              return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
        }
      }
      return null;
    });

    if (target) {
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(1500);

      const plusBtn = page.locator('button[aria-label="メニューを開く"]');
      await plusBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
      if (await plusBtn.isVisible().catch(() => false)) {
        await plusBtn.click();
        await page.waitForTimeout(1000);
        const imageBtn = page.locator('button:has-text("画像")').first();
        if (await imageBtn.isVisible().catch(() => false)) {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 10000 }),
            imageBtn.click()
          ]);
          await fileChooser.setFiles('/home/murakami/multi-agent-shogun/projects/email_reply_tool/screenshots/02_menu_open.png');
          console.log('File uploaded via + menu');
          await page.waitForTimeout(10000);
        }
      }
    }
  }

  await page.waitForTimeout(5000);

  // Final state
  console.log('\n=== FINAL STATE ===');
  const finalState = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    let imgN = 0;
    const result = [];
    for (let i = 0; i < ch.length; i++) {
      const img = ch[i].querySelector('img');
      const fc = ch[i].querySelector('figcaption');
      if (img) {
        imgN++;
        const prev = ch[i-1]?.textContent?.trim()?.substring(0, 60) || '';
        const next = ch[i+1]?.textContent?.trim()?.substring(0, 60) || '';
        result.push(`IMG#${imgN} [${i}] src=${img.src.split('/').pop().substring(0, 35)} cap=[${fc?.textContent?.trim()?.substring(0,50)||''}] prev=[${prev}] next=[${next}]`);
      }
    }
    result.push('Total images: ' + imgN);
    return result;
  });
  finalState.forEach(l => console.log('  ' + l));

  await ctx.close();
})();
