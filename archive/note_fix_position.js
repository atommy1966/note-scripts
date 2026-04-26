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

  // Step 1: Verify the misplaced image at top
  const state = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    const imgs = [];
    for (let i = 0; i < Math.min(ch.length, 6); i++) {
      const img = ch[i].querySelector('img');
      imgs.push({ idx: i, tag: ch[i].tagName, hasImg: !!img, src: img?.src?.split('/').pop()?.substring(0, 30) || '', text: ch[i].textContent.trim().substring(0, 50) });
    }
    return imgs;
  });
  console.log('Top elements:');
  state.forEach(s => console.log(`  [${s.idx}] ${s.tag} ${s.hasImg ? 'IMG src=' + s.src : s.text}`));

  // Step 2: Delete the misplaced image (should be the second image at top, right after cover)
  // The cover image has src containing "1772766339" (from QC data)
  // The misplaced 02_menu_open would be at index [2] and NOT have src "1772766339"
  const imgToDelete = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    // Find the second figure (should be the misplaced 02_menu_open)
    let figCount = 0;
    for (let i = 0; i < ch.length; i++) {
      if (ch[i].tagName === 'FIGURE' && ch[i].querySelector('img')) {
        figCount++;
        if (figCount === 2) {
          // Check if this is NOT the workflow image (workflow has src containing "1772766346")
          const src = ch[i].querySelector('img').src;
          if (!src.includes('1772766346')) {
            // This is the misplaced 02_menu_open
            ch[i].scrollIntoView({ block: 'center' });
            const img = ch[i].querySelector('img');
            const r = img.getBoundingClientRect();
            return { idx: i, x: r.x + r.width / 2, y: r.y + r.height / 2, src: src.split('/').pop().substring(0, 30) };
          }
        }
      }
    }
    return null;
  });
  console.log('\nMisplaced image:', JSON.stringify(imgToDelete));

  if (imgToDelete) {
    // Click on the image to select it
    await page.mouse.click(imgToDelete.x, imgToDelete.y);
    await page.waitForTimeout(500);
    // Delete it
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1000);
    // Also delete empty paragraph left behind
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);
    console.log('Deleted misplaced image');

    const countAfterDelete = await page.evaluate(() => document.querySelectorAll('.ProseMirror figure img').length);
    console.log('Images after delete:', countAfterDelete);
  }

  await page.waitForTimeout(2000);

  // Step 3: Navigate to the correct position and re-upload
  // The correct position is between workflow image and "30分が5分になりました" heading
  // First, find the empty paragraph between them
  const target = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    for (let i = 0; i < ch.length; i++) {
      if (ch[i].textContent.includes('30分が5分になりました') && ch[i].tagName === 'H2') {
        // Look for empty P before this heading
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          if (ch[j].tagName === 'P' && ch[j].textContent.trim() === '') {
            ch[j].scrollIntoView({ block: 'center' });
            const r = ch[j].getBoundingClientRect();
            return { idx: j, x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        // No empty P, just return position before heading
        const r = ch[i].getBoundingClientRect();
        return { idx: i, x: r.x + 5, y: r.y - 5, isHeading: true };
      }
    }
    return null;
  });
  console.log('\nTarget position:', JSON.stringify(target));

  if (target) {
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(1500);

    // Wait for + menu button
    const plusBtn = page.locator('button[aria-label="メニューを開く"]');
    await plusBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
    const visible = await plusBtn.isVisible().catch(() => false);
    console.log('Plus button visible:', visible);

    if (visible) {
      await plusBtn.click();
      await page.waitForTimeout(1000);

      const imageBtn = page.locator('button:has-text("画像")').first();
      if (await imageBtn.isVisible().catch(() => false)) {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          imageBtn.click()
        ]);
        await fileChooser.setFiles('/home/murakami/multi-agent-shogun/projects/email_reply_tool/screenshots/02_menu_open.png');
        console.log('File uploaded, waiting...');
        await page.waitForTimeout(10000);
      }
    }
  }

  // Step 4: Also fix caption again (it may have reverted)
  console.log('\n--- Fixing caption ---');
  const capResult = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    for (const el of ch) {
      const fc = el.querySelector('figcaption');
      if (fc && fc.textContent.includes('AI生成結果') && fc.textContent.includes('対応できるメール')) {
        fc.scrollIntoView({ block: 'center' });
        const range = document.createRange();
        range.selectNodeContents(fc);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        return 'selected';
      }
    }
    return 'clean';
  });
  if (capResult === 'selected') {
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      document.execCommand('insertText', false, 'AI生成結果：メール返信案が自動で作成された状態');
    });
    await page.waitForTimeout(1000);
    console.log('Caption re-fixed');
  } else {
    console.log('Caption already clean');
  }

  await page.waitForTimeout(5000);

  // Final verification
  console.log('\n=== FINAL STATE ===');
  const final = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    let imgN = 0;
    return ch.filter(c => c.textContent.trim() || c.querySelector('img')).map(c => {
      const img = c.querySelector('img');
      const fc = c.querySelector('figcaption');
      if (img) {
        imgN++;
        const prev = c.previousElementSibling?.textContent?.trim()?.substring(0, 40) || '';
        const next = c.nextElementSibling?.textContent?.trim()?.substring(0, 40) || '';
        return `IMG#${imgN} [prev: ${prev}] [next: ${next}] cap=${fc?.textContent?.trim()?.substring(0, 50) || ''}`;
      }
      return `${c.tagName}: ${c.textContent.trim().substring(0, 80)}`;
    });
  });
  final.forEach(l => console.log('  ' + l));

  const imgTotal = await page.evaluate(() => document.querySelectorAll('.ProseMirror figure img').length);
  console.log('\nTotal images:', imgTotal);

  await ctx.close();
})();
