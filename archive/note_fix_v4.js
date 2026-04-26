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

  // Step 1: Get CDN URL of the misplaced 02_menu_open at [1]
  const cdnUrl = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    for (let i = 0; i < 5; i++) {
      const img = ch[i]?.querySelector('img');
      if (img && !img.src.includes('1772766339')) {
        return img.src;
      }
    }
    return null;
  });
  console.log('CDN URL:', cdnUrl ? cdnUrl.substring(0, 80) + '...' : 'NOT FOUND');

  if (!cdnUrl) {
    console.log('No misplaced image found, nothing to fix');
    await ctx.close();
    return;
  }

  // Step 2: Delete the misplaced image at top
  console.log('\n--- Deleting misplaced image ---');
  const imgPos = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    for (let i = 0; i < 5; i++) {
      const img = ch[i]?.querySelector('img');
      if (img && !img.src.includes('1772766339')) {
        img.scrollIntoView({ block: 'center' });
        const r = img.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });

  await page.mouse.click(imgPos.x, imgPos.y);
  await page.waitForTimeout(800);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(1500);

  let imgCount = await page.evaluate(() => document.querySelectorAll('.ProseMirror figure img').length);
  console.log('Images after delete:', imgCount);

  // Step 3: Insert at correct position via execCommand('insertHTML')
  console.log('\n--- Inserting at correct position ---');
  const insertOk = await page.evaluate((url) => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    for (let i = 0; i < ch.length; i++) {
      if (ch[i].textContent.includes('30分が5分になりました') && ch[i].tagName === 'H2') {
        // Find empty P before heading
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          if (ch[j].tagName === 'P' && ch[j].textContent.trim() === '') {
            ch[j].scrollIntoView({ block: 'center' });
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStart(ch[j], 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            const html = '<figure><img src="' + url + '"></figure>';
            return document.execCommand('insertHTML', false, html);
          }
        }
        // Fallback: insert before heading
        ch[i].scrollIntoView({ block: 'center' });
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(ch[i], 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        const html = '<figure><img src="' + url + '"></figure>';
        return document.execCommand('insertHTML', false, html);
      }
    }
    return false;
  }, cdnUrl);
  console.log('insertHTML result:', insertOk);

  await page.waitForTimeout(2000);

  imgCount = await page.evaluate(() => document.querySelectorAll('.ProseMirror figure img').length);
  console.log('Images after insert:', imgCount);

  // Step 4: Force save with Ctrl+S + wait
  console.log('\n--- Saving ---');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2000);

  // Monitor for API calls
  let saveApiCalled = false;
  page.on('response', res => {
    const url = res.url();
    if (url.includes('/api/') && res.status() === 200) {
      console.log('  API:', url.split('/').slice(-3).join('/'), res.status());
      saveApiCalled = true;
    }
  });

  console.log('Waiting 50 seconds...');
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(5000);
    process.stdout.write('.');
  }
  console.log('\nSave API called:', saveApiCalled);

  // Press Ctrl+S again
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(5000);

  // Step 5: Pre-close verification
  console.log('\n=== PRE-CLOSE STATE ===');
  const preClose = await page.evaluate(() => {
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
        result.push(`IMG#${imgN} [${i}] src=${img.src.split('/').pop().substring(0,30)} prev=[${prev}] next=[${next}] cap=[${fc?.textContent?.trim()?.substring(0,40)||''}]`);
      }
    }
    const splitOk = !ch.some(c => c.textContent.includes('嬉しいです') && c.textContent.includes('メール返信に30分'));
    return { result, total: imgN, splitOk };
  });
  preClose.result.forEach(l => console.log('  ' + l));
  console.log('  Total:', preClose.total, '| Split OK:', preClose.splitOk);

  await ctx.close();
  console.log('\nBrowser closed. Re-opening for persistence check...');

  // Step 6: Reopen and verify
  await new Promise(r => setTimeout(r, 3000));
  const ctx2 = await chromium.launchPersistentContext(
    '/home/murakami/.cache/ms-playwright/note-cli-profile',
    { headless: false, locale: 'ja-JP', viewport: { width: 1280, height: 800 } }
  );
  const page2 = await ctx2.newPage();
  await page2.goto('https://editor.note.com/notes/ncef792faac1f/edit/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page2.waitForTimeout(8000);

  console.log('\n=== PERSISTENCE VERIFICATION ===');
  const final = await page2.evaluate(() => {
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
        result.push(`IMG#${imgN} [${i}] src=${img.src.split('/').pop().substring(0,30)} prev=[${prev}] next=[${next}] cap=[${fc?.textContent?.trim()?.substring(0,40)||''}]`);
      }
    }
    const splitOk = !ch.some(c => c.textContent.includes('嬉しいです') && c.textContent.includes('メール返信に30分'));
    return { result, total: imgN, splitOk };
  });
  final.result.forEach(l => console.log('  ' + l));
  console.log('  Total:', final.total);
  console.log('  Split OK:', final.splitOk);

  // Check if 02_menu_open is at correct position
  const img3 = final.result.find(r => r.includes('1772771362'));
  if (img3) {
    const correctPos = img3.includes('next=[30分が5分になりました');
    console.log('  02_menu_open correct position:', correctPos);
  }

  await ctx2.close();
})();
