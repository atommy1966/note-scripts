const { chromium } = require('@playwright/test');

(async () => {
  const ctx = await chromium.launchPersistentContext(
    '/home/murakami/.cache/ms-playwright/note-cli-profile',
    { headless: false, locale: 'ja-JP', viewport: { width: 1280, height: 900 } }
  );
  const page = await ctx.newPage();

  const EDIT_URL = 'https://editor.note.com/notes/n4fa831163f4e/edit/';
  const ASSETS_DIR = '/home/murakami/multi-agent-shogun/memory/note_c2_assets/';
  const REPORT_DIR = '/home/murakami/multi-agent-shogun/queue/reports/';

  console.log(`Opening: ${EDIT_URL}`);
  await page.goto(EDIT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  const editorExists = await page.evaluate(() => !!document.querySelector('.ProseMirror'));
  if (!editorExists) {
    console.log('ERROR: Editor not found!');
    await ctx.close();
    process.exit(1);
  }

  // ====================================================================
  // Verify 殿 is already 0 from previous fix
  // ====================================================================
  const currentText = await page.evaluate(() => document.querySelector('.ProseMirror').innerText);
  const tonoCount = (currentText.match(/殿/g) || []).length;
  console.log(`殿 count: ${tonoCount}`);

  // ====================================================================
  // FIX: Replace placeholder texts with uploaded images
  // Strategy: find placeholder text → select the whole paragraph →
  //           delete it → make it empty → use + button to upload image
  // ====================================================================

  const imageTasks = [
    { placeholder: '（画像1: Step1 比較）', file: ASSETS_DIR + 'fake_vs_real_step1.png', name: 'step1' },
    { placeholder: '（画像2: Step2 比較）', file: ASSETS_DIR + 'fake_vs_real_step2.png', name: 'step2' },
    { placeholder: '（画像3: Step3 比較）', file: ASSETS_DIR + 'fake_vs_real_step3.png', name: 'step3' },
  ];

  const results = {};

  for (const task of imageTasks) {
    console.log(`\n--- Processing ${task.name} ---`);
    try {
      // Step 1: Use window.find to locate and select the placeholder text
      const found = await page.evaluate((searchStr) => {
        // Scroll to it first by finding in DOM
        const pm = document.querySelector('.ProseMirror');
        const children = Array.from(pm.children);
        for (const ch of children) {
          if (ch.innerText && ch.innerText.trim() === searchStr.trim()) {
            ch.scrollIntoView({ block: 'center' });
            break;
          }
        }
        // Now find with window.find (case-sensitive, wrap, forward)
        return window.find(searchStr, true, false, true, false, false, false);
      }, task.placeholder);

      if (!found) {
        console.log(`  Not found: "${task.placeholder}"`);
        results[task.name] = 'skip: placeholder not found';
        continue;
      }
      console.log(`  Found: "${task.placeholder}"`);

      // Step 2: Delete the selected text (window.find selects it)
      // execCommand('delete') removes the selected text
      const deleted = await page.evaluate(() => {
        return document.execCommand('delete', false, null);
      });
      console.log(`  Deleted: ${deleted}`);
      await page.waitForTimeout(500);

      // Step 3: Now the cursor should be in an (almost) empty paragraph
      // Get the current cursor position info
      const cursorInfo = await page.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const pm = document.querySelector('.ProseMirror');
        // Find parent block element
        let el = container.nodeType === 3 ? container.parentElement : container;
        while (el && el.parentElement !== pm) {
          el = el.parentElement;
        }
        if (!el) return null;
        const children = Array.from(pm.children);
        const idx = children.indexOf(el);
        const r = el.getBoundingClientRect();
        return {
          idx,
          tag: el.tagName,
          text: el.innerText?.trim() || '',
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
        };
      });
      console.log(`  Cursor at:`, JSON.stringify(cursorInfo));

      if (!cursorInfo) {
        console.log(`  ERROR: Lost cursor after delete`);
        results[task.name] = 'fail: lost cursor';
        continue;
      }

      // Step 4: If paragraph has remaining text, delete it too
      if (cursorInfo.text.length > 0) {
        console.log(`  Paragraph not empty yet: "${cursorInfo.text}", cleaning up...`);
        // Select all in this paragraph
        await page.keyboard.press('Home');
        await page.waitForTimeout(200);
        await page.keyboard.press('Shift+End');
        await page.waitForTimeout(200);
        await page.keyboard.press('Delete');
        await page.waitForTimeout(500);
      }

      // Step 5: Click the paragraph to focus it
      await page.mouse.click(cursorInfo.x, cursorInfo.y);
      await page.waitForTimeout(1500);

      // Step 6: Look for + button
      let plusBtn = page.locator('button[aria-label="メニューを開く"]');
      let plusVisible = await plusBtn.isVisible().catch(() => false);
      console.log(`  Plus button visible: ${plusVisible}`);

      if (!plusVisible) {
        // Try clicking slightly to the left (where + button appears)
        await page.mouse.click(Math.max(10, cursorInfo.x - 200), cursorInfo.y);
        await page.waitForTimeout(1000);
        plusVisible = await plusBtn.isVisible().catch(() => false);
      }

      if (!plusVisible) {
        // Take debug screenshot
        await page.screenshot({ path: REPORT_DIR + `note_debug_${task.name}.png` });
        console.log(`  DEBUG screenshot saved`);
        results[task.name] = 'fail: plus button not visible';
        continue;
      }

      await plusBtn.click();
      await page.waitForTimeout(1000);

      // Step 7: Click 画像 in the popup
      const imageBtn = page.locator('button:has-text("画像")').first();
      const imageBtnVisible = await imageBtn.isVisible().catch(() => false);
      console.log(`  Image button visible: ${imageBtnVisible}`);

      if (!imageBtnVisible) {
        results[task.name] = 'fail: image button not visible';
        continue;
      }

      // Step 8: Upload file
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15000 }),
        imageBtn.click()
      ]);

      await fileChooser.setFiles(task.file);
      console.log(`  Uploading ${task.file}...`);
      await page.waitForTimeout(12000);

      const imgCount = await page.evaluate(() => {
        return document.querySelectorAll('.ProseMirror figure img').length;
      });
      console.log(`  Image count: ${imgCount}`);
      results[task.name] = `success (imgs: ${imgCount})`;

      await page.screenshot({ path: REPORT_DIR + `note_c2_${task.name}_376a_v2.png` });

    } catch (e) {
      console.log(`  Error: ${e.message}`);
      results[task.name] = 'error: ' + e.message;
    }

    await page.waitForTimeout(2000);
  }

  // ====================================================================
  // VERIFICATION
  // ====================================================================
  console.log('\n=== VERIFICATION ===');
  await page.waitForTimeout(3000);

  const finalText = await page.evaluate(() => document.querySelector('.ProseMirror').innerText);
  const finalTono = (finalText.match(/殿/g) || []).length;
  const placeholdersLeft = ['（画像1: Step1 比較）', '（画像2: Step2 比較）', '（画像3: Step3 比較）']
    .filter(p => finalText.includes(p));

  const finalImgCount = await page.evaluate(() => {
    return document.querySelectorAll('.ProseMirror figure img').length;
  });

  console.log(`殿 remaining: ${finalTono}`);
  console.log(`Placeholders remaining: ${placeholdersLeft.length} - ${placeholdersLeft.join(', ')}`);
  console.log(`Total images: ${finalImgCount}`);

  // Autosave
  await page.waitForTimeout(5000);
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: REPORT_DIR + 'note_c2_final_376a_v2.png', fullPage: true });
  console.log('Final screenshot saved');

  console.log('\n=== SUMMARY ===');
  console.log(`殿: ${finalTono === 0 ? 'OK (0)' : 'FAIL (' + finalTono + ')'}`);
  Object.entries(results).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`Placeholders remaining: ${placeholdersLeft.length}`);

  const allOk = finalTono === 0 && placeholdersLeft.length === 0;
  console.log(`Overall: ${allOk ? 'SUCCESS' : 'PARTIAL'}`);

  await ctx.close();
  process.exit(allOk ? 0 : 1);
})();
