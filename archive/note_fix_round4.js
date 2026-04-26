const { chromium } = require('@playwright/test');
(async () => {
  const ctx = await chromium.launchPersistentContext(
    '/home/murakami/.cache/ms-playwright/note-cli-profile',
    {
      headless: false, locale: 'ja-JP', viewport: { width: 1280, height: 800 },
      permissions: ['clipboard-read', 'clipboard-write']
    }
  );
  const page = await ctx.newPage();
  await page.goto('https://editor.note.com/notes/ncef792faac1f/edit/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  console.log('URL:', page.url());

  const results = {};

  // ====================================================================
  // FIX HIGH-2: Use precise text-end coordinates to click
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
      // Get exact pixel position of end of "嬉しいです。" text
      const endCoords = await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        for (let i = 0; i < ch.length; i++) {
          if (ch[i].textContent.includes('使っていただけると嬉しいです')) {
            ch[i].scrollIntoView({ block: 'center' });
            // Find the last text node
            const walker = document.createTreeWalker(ch[i], NodeFilter.SHOW_TEXT);
            let textNode, lastNode;
            while (textNode = walker.nextNode()) lastNode = textNode;
            if (lastNode) {
              // Create range at end of text
              const range = document.createRange();
              range.setStart(lastNode, lastNode.textContent.length);
              range.collapse(true);
              const rect = range.getBoundingClientRect();
              return { x: rect.x + 2, y: rect.y + rect.height / 2, idx: i };
            }
          }
        }
        return null;
      });
      console.log('  End coords:', JSON.stringify(endCoords));

      if (endCoords) {
        // Click at end of text
        await page.mouse.click(endCoords.x, endCoords.y);
        await page.waitForTimeout(500);

        // Verify cursor position by checking what's selected
        const cursorCheck = await page.evaluate(() => {
          const sel = window.getSelection();
          const node = sel.focusNode;
          const text = node?.textContent || '';
          return { offset: sel.focusOffset, textEnd: text.substring(Math.max(0, sel.focusOffset - 10), sel.focusOffset) };
        });
        console.log('  Cursor at:', JSON.stringify(cursorCheck));

        // Press Enter to create new paragraph
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        // Type the missing paragraph
        const missingText = 'メール返信に30分使っていたのが5分になる。それだけで、副業に使える時間が大きく増えます。';
        await page.keyboard.type(missingText, { delay: 15 });
        await page.waitForTimeout(2000);

        // Verify
        const check = await page.evaluate(() => {
          const ch = Array.from(document.querySelector('.ProseMirror').children);
          for (let i = 0; i < ch.length; i++) {
            if (ch[i].textContent.includes('メール返信に30分使っていたのが5分になる')) {
              return {
                found: true,
                separate: !ch[i].textContent.includes('嬉しいです'),
                text: ch[i].textContent.substring(0, 80),
              };
            }
          }
          return { found: false };
        });
        console.log('  Result:', JSON.stringify(check));
        results.HIGH2 = check.found && check.separate ? 'OK' : (check.found ? 'MERGED (not separate)' : 'FAILED');
      } else {
        results.HIGH2 = 'FAILED (coords not found)';
      }
    }
  } catch (e) { results.HIGH2 = 'ERROR: ' + e.message; }
  console.log('HIGH-2:', results.HIGH2);
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX HIGH-3: Re-upload 02_menu_open via clipboard API
  // ====================================================================
  console.log('--- HIGH-3: Re-upload 02_menu_open ---');
  try {
    const imgCount = await page.evaluate(() => document.querySelectorAll('.ProseMirror figure img').length);
    console.log('  Current image count:', imgCount);

    if (imgCount >= 7) {
      results.HIGH3 = 'OK (7 images)';
    } else {
      // Clean up empty figures first
      const cleaned = await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        let count = 0;
        for (let i = ch.length - 1; i >= 0; i--) {
          if (ch[i].tagName === 'FIGURE' && !ch[i].querySelector('img')) {
            ch[i].remove();
            count++;
          }
        }
        if (count > 0) {
          document.querySelector('.ProseMirror').dispatchEvent(new Event('input', { bubbles: true }));
        }
        return count;
      });
      console.log('  Cleaned', cleaned, 'empty figures');
      await page.waitForTimeout(1000);

      // Position between workflow image and "30分が5分" heading
      const positioned = await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        for (let i = 0; i < ch.length; i++) {
          if (ch[i].textContent.includes('30分が5分になりました')) {
            // Click on empty P before heading, or at start of heading
            for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
              if (ch[j].tagName === 'P' && ch[j].textContent.trim() === '') {
                ch[j].scrollIntoView({ block: 'center' });
                const sel = window.getSelection();
                sel.collapse(ch[j], 0);
                const r = ch[j].getBoundingClientRect();
                return { x: r.x + 10, y: r.y + r.height / 2, method: 'empty_p', j };
              }
            }
            ch[i].scrollIntoView({ block: 'center' });
            const r = ch[i].getBoundingClientRect();
            return { x: r.x + 5, y: r.y - 2, method: 'before_h2' };
          }
        }
        return null;
      });
      console.log('  Target position:', JSON.stringify(positioned));

      if (positioned) {
        await page.mouse.click(positioned.x, positioned.y);
        await page.waitForTimeout(500);

        // Try clipboard API approach
        const clipResult = await page.evaluate(async () => {
          try {
            const imgUrl = 'https://assets.st-note.com/img/1772766352-91V2wcjKIfUO8MDPSqEy7uGp.png';
            const response = await fetch(imgUrl);
            if (!response.ok) return 'fetch_failed';
            const blob = await response.blob();

            // Try ClipboardItem
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
            return 'clipboard_written';
          } catch (e) {
            return 'clipboard_error: ' + e.message;
          }
        });
        console.log('  Clipboard:', clipResult);

        if (clipResult === 'clipboard_written') {
          await page.keyboard.press('Control+v');
          await page.waitForTimeout(8000); // wait for upload

          const newCount = await page.evaluate(() => document.querySelectorAll('.ProseMirror figure img').length);
          console.log('  Images after Ctrl+V:', newCount);
          results.HIGH3 = newCount >= 7 ? 'OK' : 'PARTIAL (' + newCount + ')';
        } else {
          // Fallback: try note.com's internal API
          console.log('  Trying note API upload...');
          const apiResult = await page.evaluate(async () => {
            try {
              // Get CSRF token
              const meResp = await fetch('/api/v2/me', { headers: { 'Accept': 'application/json' } });
              const me = await meResp.json();
              const token = me?.data?.csrf_token || '';
              if (!token) return 'no_csrf';

              // Download image
              const imgResp = await fetch('https://assets.st-note.com/img/1772766352-91V2wcjKIfUO8MDPSqEy7uGp.png');
              const blob = await imgResp.blob();
              const formData = new FormData();
              formData.append('image', blob, 'menu_open.png');

              // Try uploading via note's API
              const uploadResp = await fetch('/api/v1/image_files', {
                method: 'POST',
                headers: { 'X-CSRF-Token': token },
                body: formData
              });
              const uploadResult = await uploadResp.json();
              return { status: uploadResp.status, data: uploadResult };
            } catch (e) {
              return { error: e.message };
            }
          });
          console.log('  API upload result:', JSON.stringify(apiResult));
          results.HIGH3 = 'PARTIAL (API attempt: ' + JSON.stringify(apiResult).substring(0, 60) + ')';
        }
      }
    }
  } catch (e) { results.HIGH3 = 'ERROR: ' + e.message; }
  console.log('HIGH-3:', results.HIGH3);

  await page.waitForTimeout(5000);

  // Final verification
  const finalCheck = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    return {
      imgCount: ch.filter(c => c.querySelector('img')).length,
      hasMerged: ch.some(c => c.textContent.includes('使い続けられます')),
      hasCapFixed: !ch.some(c => {
        const fc = c.querySelector('figcaption');
        return fc && fc.textContent.includes('対応できるメール');
      }),
      hasNoMdHeading: !ch.some(c => c.textContent.startsWith('# メール返信')),
      hasMissingPara: ch.some(c => c.textContent.includes('メール返信に30分使っていたのが5分になる')),
    };
  });
  console.log('\n=== FINAL CHECK ===');
  console.log('  Images:', finalCheck.imgCount, '/ 7');
  console.log('  HIGH-1 (heading deleted):', finalCheck.hasNoMdHeading ? '✓' : '✗');
  console.log('  HIGH-2 (missing para):', finalCheck.hasMissingPara ? '✓' : '✗');
  console.log('  MEDIUM-4 (merged):', finalCheck.hasMerged ? '✓' : '✗');
  console.log('  MEDIUM-5 (caption):', finalCheck.hasCapFixed ? '✓' : '✗');

  console.log('\n=== RESULTS ===');
  Object.entries(results).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  await ctx.close();
})();
