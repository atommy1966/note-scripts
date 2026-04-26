const { chromium } = require('@playwright/test');
(async () => {
  const ctx = await chromium.launchPersistentContext(
    '/home/murakami/.cache/ms-playwright/note-cli-profile',
    { headless: false, locale: 'ja-JP', viewport: { width: 1280, height: 800 } }
  );
  const page = await ctx.newPage();
  await page.goto('https://editor.note.com/notes/ncef792faac1f/edit/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  const results = {};

  // ====================================================================
  // FIX MEDIUM-5: Caption fix via Selection API + execCommand
  // ====================================================================
  console.log('--- MEDIUM-5: Fix caption ---');
  try {
    const capFixed = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (const el of ch) {
        const fc = el.querySelector('figcaption');
        if (fc && fc.textContent.includes('AI生成結果') && fc.textContent.includes('対応できるメール')) {
          // Scroll into view
          fc.scrollIntoView({ block: 'center' });
          // Select all content in figcaption
          const range = document.createRange();
          range.selectNodeContents(fc);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          return 'selected';
        }
      }
      return 'not_found';
    });
    console.log('  Selection:', capFixed);

    if (capFixed === 'selected') {
      await page.waitForTimeout(500);
      // Use execCommand to replace (this triggers ProseMirror's input handler)
      await page.evaluate(() => {
        document.execCommand('insertText', false, 'AI生成結果：メール返信案が自動で作成された状態');
      });
      await page.waitForTimeout(1500);

      // Verify
      const check = await page.evaluate(() => {
        const ch = Array.from(document.querySelector('.ProseMirror').children);
        for (const el of ch) {
          const fc = el.querySelector('figcaption');
          if (fc && fc.textContent.includes('AI生成結果')) return fc.textContent;
        }
        return '';
      });
      console.log('  Caption now:', check);
      results.MEDIUM5 = check.includes('対応できるメール') ? 'FAILED' : 'OK';
    } else {
      results.MEDIUM5 = 'FAILED (caption not found)';
    }
  } catch (e) { results.MEDIUM5 = 'ERROR: ' + e.message; }
  console.log('MEDIUM-5:', results.MEDIUM5);
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX HIGH-3: Upload image via note API + insert into editor
  // ====================================================================
  console.log('--- HIGH-3: Upload and insert 02_menu_open ---');
  try {
    const imgCount = await page.evaluate(() => document.querySelectorAll('.ProseMirror figure img').length);
    if (imgCount >= 7) {
      results.HIGH3 = 'OK (7 images)';
    } else {
      // Step 1: Upload image to note.com
      const uploadResult = await page.evaluate(async () => {
        try {
          // Get CSRF token
          const meResp = await fetch('/api/v2/me', { headers: { 'Accept': 'application/json' } });
          const me = await meResp.json();
          const token = me?.data?.csrf_token || '';
          if (!token) return { error: 'no_csrf' };

          // Download original image
          const imgResp = await fetch('https://assets.st-note.com/img/1772766352-91V2wcjKIfUO8MDPSqEy7uGp.png');
          const blob = await imgResp.blob();

          // Try different upload endpoints
          const endpoints = ['/api/v1/image_files', '/api/v3/image_files', '/api/v2/image_files'];
          for (const ep of endpoints) {
            const formData = new FormData();
            formData.append('image', blob, 'menu_open.png');
            try {
              const resp = await fetch(ep, {
                method: 'POST',
                headers: { 'X-CSRF-Token': token },
                body: formData
              });
              const json = await resp.json();
              if (resp.ok) return { endpoint: ep, status: resp.status, data: json };
            } catch (e) {}
          }

          // Also try with 'file' key
          const formData = new FormData();
          formData.append('file', blob, 'menu_open.png');
          const resp = await fetch('/api/v1/image_files', {
            method: 'POST',
            headers: { 'X-CSRF-Token': token },
            body: formData
          });
          return { endpoint: '/api/v1/image_files (file key)', status: resp.status, body: await resp.text() };
        } catch (e) {
          return { error: e.message };
        }
      });
      console.log('  Upload result:', JSON.stringify(uploadResult).substring(0, 200));

      // If upload succeeded and returned a URL, insert it
      if (uploadResult.data?.data?.key || uploadResult.data?.data?.url) {
        const imageUrl = uploadResult.data.data.url || `https://assets.st-note.com/img/${uploadResult.data.data.key}`;
        console.log('  Uploaded image URL:', imageUrl);

        // Position cursor between workflow image and "30分が5分" heading
        const positioned = await page.evaluate(() => {
          const ch = Array.from(document.querySelector('.ProseMirror').children);
          for (let i = 0; i < ch.length; i++) {
            if (ch[i].textContent.includes('30分が5分になりました')) {
              for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
                if (ch[j].tagName === 'P' && ch[j].textContent.trim() === '') {
                  ch[j].scrollIntoView({ block: 'center' });
                  const sel = window.getSelection();
                  sel.collapse(ch[j], 0);
                  return true;
                }
              }
            }
          }
          return false;
        });

        if (positioned) {
          // Insert image via execCommand or direct insertion
          await page.evaluate((url) => {
            document.execCommand('insertHTML', false, `<figure><img src="${url}" /></figure>`);
          }, imageUrl);
          await page.waitForTimeout(3000);
        }

        const newCount = await page.evaluate(() => document.querySelectorAll('.ProseMirror figure img').length);
        results.HIGH3 = newCount >= 7 ? 'OK' : 'PARTIAL (' + newCount + ')';
      } else {
        // Upload failed - report for manual intervention
        results.HIGH3 = 'MANUAL_REQUIRED (upload failed)';
      }
    }
  } catch (e) { results.HIGH3 = 'ERROR: ' + e.message; }
  console.log('HIGH-3:', results.HIGH3);

  await page.waitForTimeout(5000);

  // ====================================================================
  // FINAL COMPREHENSIVE CHECK
  // ====================================================================
  console.log('\n=== FINAL STATE ===');
  const state = await page.evaluate(() => {
    const ch = Array.from(document.querySelector('.ProseMirror').children);
    let imgN = 0;
    return ch.filter(el => el.textContent.trim() || el.querySelector('img')).map(el => {
      const img = el.querySelector('img');
      const fc = el.querySelector('figcaption');
      if (img) imgN++;
      return {
        tag: el.tagName,
        hasImg: !!img,
        imgNum: img ? imgN : null,
        cap: fc ? fc.textContent.trim().substring(0, 60) : null,
        text: !img ? el.textContent.trim().substring(0, 100) : null,
      };
    });
  });
  state.forEach(el => {
    if (el.hasImg) console.log(`  IMG#${el.imgNum} ${el.cap || ''}`);
    else if (el.text) console.log(`  ${el.tag}: ${el.text}`);
  });

  console.log('\n=== RESULTS ===');
  Object.entries(results).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  await ctx.close();
})();
