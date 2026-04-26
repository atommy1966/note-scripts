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

  // ============================================================
  // PHASE 1: Delete both misplaced 02_menu_open images at top
  // ============================================================
  console.log('\n--- PHASE 1: Delete misplaced images ---');
  for (let round = 1; round <= 2; round++) {
    const target = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (let i = 0; i < Math.min(ch.length, 5); i++) {
        const img = ch[i].querySelector('img');
        if (img && !img.src.includes('1772766339')) {
          // Not the cover image = misplaced 02_menu_open
          img.scrollIntoView({ block: 'center' });
          const r = img.getBoundingClientRect();
          return { idx: i, x: r.x + r.width / 2, y: r.y + r.height / 2, src: img.src.split('/').pop().substring(0, 30) };
        }
      }
      return null;
    });

    if (!target) {
      console.log(`  Round ${round}: no misplaced image found`);
      break;
    }
    console.log(`  Round ${round}: clicking image at [${target.idx}] ${target.src}`);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(800);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1500);
    // Check if empty paragraph left
    const emptyLeft = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      return ch[0]?.tagName === 'P' && ch[0]?.textContent?.trim() === '';
    });
    if (emptyLeft) {
      // Click the empty paragraph and delete it too
      const ep = await page.evaluate(() => {
        const ch = document.querySelector('.ProseMirror').children[0];
        const r = ch.getBoundingClientRect();
        return { x: r.x + 10, y: r.y + r.height / 2 };
      });
      await page.mouse.click(ep.x, ep.y);
      await page.waitForTimeout(300);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
    }
  }

  let count1 = await page.evaluate(() => document.querySelectorAll('.ProseMirror figure img').length);
  console.log('  Images after delete:', count1);

  // ============================================================
  // PHASE 2: Split paragraph (嬉しいです + メール返信に30分)
  // ============================================================
  console.log('\n--- PHASE 2: Split paragraph ---');
  const needsSplit = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    return ch.some(c => c.textContent.includes('嬉しいです') && c.textContent.includes('メール返信に30分使っていたのが'));
  });

  if (needsSplit) {
    const splitDone = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (const c of ch) {
        if (c.textContent.includes('嬉しいです') && c.textContent.includes('メール返信に30分使っていたのが')) {
          c.scrollIntoView({ block: 'center' });
          const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
          let textNode;
          while (textNode = walker.nextNode()) {
            const idx = textNode.textContent.indexOf('メール返信に30分使っていたのが');
            if (idx >= 0) {
              const sel = window.getSelection();
              sel.collapse(textNode, idx);
              return true;
            }
          }
        }
      }
      return false;
    });

    if (splitDone) {
      await page.waitForTimeout(300);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      console.log('  Paragraph split: cursor positioned and Enter pressed');
    } else {
      console.log('  Could not position cursor for split');
    }
  } else {
    console.log('  Already split or not found');
  }

  // ============================================================
  // PHASE 3: Wait for autosave (note.com autosaves periodically)
  // ============================================================
  console.log('\n--- PHASE 3: Wait for autosave ---');
  // Type a space and delete it to trigger change detection
  await page.keyboard.press('End');
  await page.waitForTimeout(200);

  // Monitor network requests to detect save
  let saveDetected = false;
  page.on('response', res => {
    if (res.url().includes('/api/') && res.status() === 200) {
      console.log('  API response:', res.url().split('/').slice(-2).join('/'), res.status());
      saveDetected = true;
    }
  });

  console.log('  Waiting 45 seconds for autosave...');
  // Check every 5 seconds
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(5000);
    process.stdout.write('.');
  }
  console.log('\n  Save detected:', saveDetected);

  // Try pressing Ctrl+S to force save
  console.log('  Pressing Ctrl+S to force save...');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(5000);
  console.log('  Save detected after Ctrl+S:', saveDetected);

  // ============================================================
  // PHASE 4: Verify state before closing
  // ============================================================
  console.log('\n--- PHASE 4: Pre-close verification ---');
  const preClose = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    let imgN = 0;
    const imgs = [];
    const splitMerged = ch.some(c => c.textContent.includes('嬉しいです') && c.textContent.includes('メール返信に30分'));
    for (let i = 0; i < ch.length; i++) {
      const img = ch[i].querySelector('img');
      if (img) {
        imgN++;
        const prev = ch[i-1]?.textContent?.trim()?.substring(0, 50) || '';
        const next = ch[i+1]?.textContent?.trim()?.substring(0, 50) || '';
        imgs.push(`IMG#${imgN} [${i}] prev=[${prev}] next=[${next}]`);
      }
    }
    return { imgs, total: imgN, splitMerged };
  });
  preClose.imgs.forEach(l => console.log('  ' + l));
  console.log('  Total:', preClose.total, '| Split merged:', preClose.splitMerged);

  await ctx.close();
  console.log('\nBrowser closed. Re-opening to verify persistence...');

  // ============================================================
  // PHASE 5: Reopen and verify persistence
  // ============================================================
  await new Promise(r => setTimeout(r, 3000));
  const ctx2 = await chromium.launchPersistentContext(
    '/home/murakami/.cache/ms-playwright/note-cli-profile',
    { headless: false, locale: 'ja-JP', viewport: { width: 1280, height: 800 } }
  );
  const page2 = await ctx2.newPage();
  await page2.goto('https://editor.note.com/notes/ncef792faac1f/edit/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page2.waitForTimeout(8000);

  console.log('\n=== PERSISTENCE VERIFICATION ===');
  const postReload = await page2.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    let imgN = 0;
    const imgs = [];
    const splitMerged = ch.some(c => c.textContent.includes('嬉しいです') && c.textContent.includes('メール返信に30分'));
    for (let i = 0; i < ch.length; i++) {
      const img = ch[i].querySelector('img');
      const fc = ch[i].querySelector('figcaption');
      if (img) {
        imgN++;
        const prev = ch[i-1]?.textContent?.trim()?.substring(0, 50) || '';
        const next = ch[i+1]?.textContent?.trim()?.substring(0, 50) || '';
        const src = img.src.split('/').pop().substring(0, 35);
        imgs.push(`IMG#${imgN} [${i}] src=${src} cap=[${fc?.textContent?.trim()?.substring(0,50)||''}] prev=[${prev}] next=[${next}]`);
      }
    }
    return { imgs, total: imgN, splitMerged };
  });
  postReload.imgs.forEach(l => console.log('  ' + l));
  console.log('  Total:', postReload.total);
  console.log('  Split merged:', postReload.splitMerged);
  console.log('  DELETIONS PERSISTED:', postReload.total < 8);
  console.log('  SPLIT PERSISTED:', !postReload.splitMerged);

  await ctx2.close();
})();
