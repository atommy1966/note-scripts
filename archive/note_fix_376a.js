const { chromium } = require('@playwright/test');
const path = require('path');

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

  const title = await page.title();
  console.log(`Page title: ${title}`);

  const editorExists = await page.evaluate(() => !!document.querySelector('.ProseMirror'));
  if (!editorExists) {
    console.log('ERROR: ProseMirror editor not found!');
    await page.screenshot({ path: REPORT_DIR + 'note_c2_debug_376a.png' });
    await ctx.close();
    process.exit(1);
  }

  await page.screenshot({ path: REPORT_DIR + 'note_c2_before_376a.png', fullPage: true });
  console.log('Before screenshot saved');

  // ====================================================================
  // FIX 1: Replace 「殿」 with appropriate terms
  // ====================================================================
  console.log('\n--- FIX 1: Replace 殿 ---');

  const replacements = [
    // 殿が撮ったスクショ → 私が以前撮ったスクショ
    ['殿が撮ったスクショがある', '私が以前撮ったスクショがある'],
    // acceptance_criteria内の殿 → 自分
    ['殿が提供したスクショのコピーは使用禁止', '自分が提供したスクショのコピーは使用禁止'],
  ];

  let totalReplaced = 0;

  for (const [oldStr, newStr] of replacements) {
    let count = 0;
    let maxAttempts = 20;
    while (maxAttempts-- > 0) {
      const found = await page.evaluate((searchStr) => {
        return window.find(searchStr, true, false, false, false, false, false);
      }, oldStr);
      if (!found) break;

      const replaced = await page.evaluate((replacement) => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        if (!range || range.collapsed) return false;
        const pm = document.querySelector('.ProseMirror');
        if (!pm || !pm.contains(range.commonAncestorContainer)) return false;
        return document.execCommand('insertText', false, replacement);
      }, newStr);

      if (!replaced) {
        console.log(`  WARNING: Could not replace "${oldStr}" (execCommand failed)`);
        break;
      }
      count++;
    }
    if (count > 0) {
      console.log(`  Replaced "${oldStr}" → "${newStr}" (${count}x)`);
      totalReplaced += count;
    } else {
      console.log(`  NOT FOUND: "${oldStr}"`);
    }
  }

  // Verify 殿 is gone
  await page.waitForTimeout(2000);
  const textAfterFix1 = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return pm ? pm.innerText : '';
  });
  const tonoRemaining = (textAfterFix1.match(/殿/g) || []).length;
  console.log(`  殿 remaining: ${tonoRemaining} (should be 0)`);

  // ====================================================================
  // FIX 2: Upload comparison images at placeholder positions
  // ====================================================================
  console.log('\n--- FIX 2: Upload comparison images ---');

  // The placeholders are text paragraphs:
  // [17]: （画像1: Step1 比較）→ fake_vs_real_step1.png
  // [18]: （画像2: Step2 比較）→ fake_vs_real_step2.png
  // [19]: （画像3: Step3 比較）→ fake_vs_real_step3.png

  const imageTasks = [
    { placeholder: '（画像1: Step1 比較）', file: ASSETS_DIR + 'fake_vs_real_step1.png', name: 'step1' },
    { placeholder: '（画像2: Step2 比較）', file: ASSETS_DIR + 'fake_vs_real_step2.png', name: 'step2' },
    { placeholder: '（画像3: Step3 比較）', file: ASSETS_DIR + 'fake_vs_real_step3.png', name: 'step3' },
  ];

  const imageResults = {};

  for (const task of imageTasks) {
    console.log(`\n  Processing ${task.name}: ${task.placeholder}`);
    try {
      // Step A: Find and click the placeholder paragraph
      const positioned = await page.evaluate((searchText) => {
        const pm = document.querySelector('.ProseMirror');
        const children = Array.from(pm.children);
        for (let i = 0; i < children.length; i++) {
          if (children[i].innerText && children[i].innerText.trim() === searchText.trim()) {
            children[i].scrollIntoView({ block: 'center' });
            const r = children[i].getBoundingClientRect();
            return { found: true, idx: i, x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        return { found: false };
      }, task.placeholder);

      if (!positioned.found) {
        console.log(`  ERROR: Placeholder not found: "${task.placeholder}"`);
        imageResults[task.name] = 'fail: placeholder not found';
        continue;
      }
      console.log(`  Found at index ${positioned.idx}`);

      // Step B: Click on the paragraph
      await page.mouse.click(positioned.x, positioned.y);
      await page.waitForTimeout(1000);

      // Step C: Select all text in the paragraph and delete it
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(500);
      // More precise: select line
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);
      await page.keyboard.press('Shift+End');
      await page.waitForTimeout(300);
      await page.keyboard.press('Delete');
      await page.waitForTimeout(1000);

      // Verify paragraph is now empty
      const isEmpty = await page.evaluate((idx) => {
        const pm = document.querySelector('.ProseMirror');
        const children = Array.from(pm.children);
        // Check nearby paragraphs since index may have shifted
        for (let i = Math.max(0, idx - 2); i < Math.min(children.length, idx + 2); i++) {
          const text = children[i].innerText?.trim();
          if (text === '' && children[i].tagName === 'P') {
            children[i].scrollIntoView({ block: 'center' });
            const r = children[i].getBoundingClientRect();
            return { empty: true, idx: i, x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        return { empty: false };
      }, positioned.idx);

      if (!isEmpty.empty) {
        // Try clicking the paragraph again and select all
        await page.mouse.click(positioned.x, positioned.y);
        await page.waitForTimeout(500);
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(300);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(1000);
      }

      // Step D: Re-click on the now-empty paragraph
      await page.mouse.click(positioned.x, positioned.y);
      await page.waitForTimeout(1500);

      // Step E: Look for the + button (メニューを開く)
      const plusBtn = page.locator('button[aria-label="メニューを開く"]');
      const plusVisible = await plusBtn.isVisible().catch(() => false);
      console.log(`  Plus button visible: ${plusVisible}`);

      if (!plusVisible) {
        // Try scrolling and clicking the empty area
        await page.evaluate((idx) => {
          const pm = document.querySelector('.ProseMirror');
          const children = Array.from(pm.children);
          if (children[idx]) {
            children[idx].scrollIntoView({ block: 'center' });
          }
        }, positioned.idx);
        await page.waitForTimeout(500);
        await page.mouse.click(positioned.x, positioned.y);
        await page.waitForTimeout(1500);
      }

      // Check again
      const plusVisible2 = await plusBtn.isVisible().catch(() => false);
      if (plusVisible2) {
        await plusBtn.click();
        await page.waitForTimeout(1000);
      } else {
        // Try clicking at x=30 (where the + usually appears)
        await page.mouse.click(30, positioned.y);
        await page.waitForTimeout(1000);
        const plusVisible3 = await plusBtn.isVisible().catch(() => false);
        if (plusVisible3) {
          await plusBtn.click();
          await page.waitForTimeout(1000);
        } else {
          console.log(`  ERROR: Plus button not found for ${task.name}`);
          imageResults[task.name] = 'fail: plus button not found';
          continue;
        }
      }

      // Step F: Click 画像 button in the popup menu
      const imageBtn = page.locator('button:has-text("画像")').first();
      const imageBtnVisible = await imageBtn.isVisible().catch(() => false);
      console.log(`  Image button visible: ${imageBtnVisible}`);

      if (!imageBtnVisible) {
        console.log(`  ERROR: Image button not found for ${task.name}`);
        imageResults[task.name] = 'fail: image button not found';
        continue;
      }

      // Step G: Handle file chooser
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 15000 }),
        imageBtn.click()
      ]);

      console.log(`  File chooser triggered, setting file: ${task.file}`);
      await fileChooser.setFiles(task.file);
      console.log(`  File set, waiting for upload...`);
      await page.waitForTimeout(15000);

      // Verify image was added
      const imgCount = await page.evaluate(() => {
        return document.querySelectorAll('.ProseMirror figure img').length;
      });
      console.log(`  Image count after upload: ${imgCount}`);
      imageResults[task.name] = `success (total imgs: ${imgCount})`;

      await page.screenshot({ path: REPORT_DIR + `note_c2_after_${task.name}_376a.png` });

    } catch (e) {
      console.log(`  Error for ${task.name}: ${e.message}`);
      imageResults[task.name] = 'error: ' + e.message;
    }

    await page.waitForTimeout(3000);
  }

  // ====================================================================
  // FINAL VERIFICATION
  // ====================================================================
  console.log('\n=== FINAL VERIFICATION ===');
  await page.waitForTimeout(3000);

  const finalText = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return pm ? pm.innerText : '';
  });

  const finalTonoCount = (finalText.match(/殿/g) || []).length;
  const placeholdersRemaining = ['（画像1: Step1 比較）', '（画像2: Step2 比較）', '（画像3: Step3 比較）']
    .filter(p => finalText.includes(p));

  const finalImgCount = await page.evaluate(() => {
    return document.querySelectorAll('.ProseMirror figure img, .ProseMirror img').length;
  });

  console.log(`殿 remaining: ${finalTonoCount}`);
  console.log(`Placeholder texts remaining: ${placeholdersRemaining.join(', ') || 'none'}`);
  console.log(`Total images: ${finalImgCount}`);

  // Save autosave
  console.log('\nWaiting for autosave...');
  await page.waitForTimeout(5000);
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: REPORT_DIR + 'note_c2_final_376a.png', fullPage: true });
  console.log('Final screenshot saved');

  // ====================================================================
  // SUMMARY
  // ====================================================================
  console.log('\n=== SUMMARY ===');
  console.log(`Fix 1 (殿 removal): ${finalTonoCount === 0 ? 'SUCCESS' : 'PARTIAL (remaining: ' + finalTonoCount + ')'}`);
  console.log(`Fix 2 (image upload):`);
  Object.entries(imageResults).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`Placeholder texts remaining: ${placeholdersRemaining.length === 0 ? 'none (good)' : placeholdersRemaining.join(', ')}`);

  const allOk = finalTonoCount === 0 && placeholdersRemaining.length === 0;
  console.log(`\nOverall: ${allOk ? 'SUCCESS' : 'PARTIAL'}`);

  await ctx.close();
  process.exit(allOk ? 0 : 1);
})();
