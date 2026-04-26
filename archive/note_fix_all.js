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

  // ======= Helpers =======
  async function findEl(text) {
    return page.evaluate((t) => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (let i = 0; i < ch.length; i++) {
        if (ch[i].textContent.includes(t)) return i;
      }
      return -1;
    }, text);
  }

  async function scrollTo(idx) {
    await page.evaluate((i) => {
      document.querySelector('.ProseMirror').children[i]?.scrollIntoView({ block: 'center' });
    }, idx);
    await page.waitForTimeout(500);
  }

  async function getImgCenter(idx) {
    return page.evaluate((i) => {
      const img = document.querySelector('.ProseMirror').children[i]?.querySelector('img');
      if (!img) return null;
      const r = img.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, idx);
  }

  async function getElRect(idx) {
    return page.evaluate((i) => {
      const el = document.querySelector('.ProseMirror').children[i];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }, idx);
  }

  async function printState(label) {
    const state = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      return ch.map((el, i) => ({
        i, tag: el.tagName, text: el.textContent.trim().substring(0, 80),
        hasImg: !!el.querySelector('img'),
        cap: el.querySelector('figcaption')?.textContent?.trim()?.substring(0, 60) || '',
      }));
    });
    console.log(`\n=== ${label} ===`);
    let imgN = 0;
    state.forEach(el => {
      if (el.hasImg) { imgN++; console.log(`  [${el.i}] IMG#${imgN} ${el.cap || ''}`); }
      else if (el.text) console.log(`  [${el.i}] ${el.tag}: ${el.text}`);
    });
  }

  await printState('INITIAL');

  // ====================================================================
  // FIX HIGH-1: Delete "# メール返信..." markdown heading
  // ====================================================================
  console.log('\n--- FIX HIGH-1: Delete markdown heading ---');
  try {
    const idx = await findEl('# メール返信に30分');
    if (idx < 0) throw new Error('not found');
    await scrollTo(idx);
    const rect = await getElRect(idx);
    await page.mouse.click(rect.cx, rect.cy, { clickCount: 3 });
    await page.waitForTimeout(300);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1000);
    // Also delete the empty line left behind
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);
    const check = await findEl('# メール返信に30分');
    results.HIGH1 = check < 0 ? 'OK' : 'FAILED';
  } catch (e) { results.HIGH1 = 'ERROR: ' + e.message; }
  console.log('HIGH-1:', results.HIGH1);
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX MEDIUM-5: Fix contaminated caption on 06_generate_result
  // ====================================================================
  console.log('\n--- FIX MEDIUM-5: Fix caption ---');
  try {
    const idx = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (let i = 0; i < ch.length; i++) {
        const fc = ch[i].querySelector('figcaption');
        if (fc && fc.textContent.includes('AI生成結果') && fc.textContent.includes('対応できるメール')) return i;
      }
      return -1;
    });
    if (idx < 0) throw new Error('contaminated caption not found');
    await scrollTo(idx);
    const capRect = await page.evaluate((i) => {
      const fc = document.querySelector('.ProseMirror').children[i].querySelector('figcaption');
      if (!fc) return null;
      const r = fc.getBoundingClientRect();
      return { x: r.x + 5, y: r.y + r.height / 2, right: r.right - 5 };
    }, idx);
    if (!capRect) throw new Error('figcaption rect not found');

    // Click on caption, select all, retype
    await page.mouse.click(capRect.x, capRect.y);
    await page.waitForTimeout(300);
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    await page.keyboard.down('Shift');
    await page.keyboard.press('End');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);
    await page.keyboard.type('AI生成結果：メール返信案が自動で作成された状態', { delay: 10 });
    await page.waitForTimeout(1000);

    const newCap = await page.evaluate((i) => {
      return document.querySelector('.ProseMirror').children[i]?.querySelector('figcaption')?.textContent || '';
    }, idx);
    results.MEDIUM5 = newCap.includes('対応できるメール') ? 'FAILED' : 'OK';
  } catch (e) { results.MEDIUM5 = 'ERROR: ' + e.message; }
  console.log('MEDIUM-5:', results.MEDIUM5);
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX MEDIUM-4: Fix sentence split (move 05_setup_complete image)
  // ====================================================================
  console.log('\n--- FIX MEDIUM-4: Fix sentence split ---');
  try {
    // Find the image that splits "使い続け" / "られます。"
    const splitInfo = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      for (let i = 0; i < ch.length; i++) {
        if (ch[i].textContent.trim().endsWith('使い続け')) {
          for (let j = i + 1; j < Math.min(i + 4, ch.length); j++) {
            if (ch[j].tagName === 'FIGURE' && ch[j].querySelector('img')) {
              return { textIdx: i, imgIdx: j };
            }
          }
        }
      }
      return null;
    });
    if (!splitInfo) throw new Error('split sentence pattern not found');
    console.log('  Found split: text at', splitInfo.textIdx, 'img at', splitInfo.imgIdx);

    // Step 1: Click on the splitting image and cut it
    await scrollTo(splitInfo.imgIdx);
    const imgC = await getImgCenter(splitInfo.imgIdx);
    if (!imgC) throw new Error('img center not found');
    await page.mouse.click(imgC.x, imgC.y);
    await page.waitForTimeout(500);
    // Verify image is selected (it should have a selection ring)
    await page.keyboard.press('Control+x');
    await page.waitForTimeout(1000);

    // Step 2: Now merge "使い続け" and "られます。"
    // Position cursor at end of "使い続け"
    const textIdx2 = await findEl('使い続け');
    if (textIdx2 < 0) throw new Error('"使い続け" gone');
    await scrollTo(textIdx2);
    const textRect = await getElRect(textIdx2);
    await page.mouse.click(textRect.right - 10, textRect.cy);
    await page.waitForTimeout(200);
    await page.keyboard.press('End');
    await page.waitForTimeout(200);

    // Delete forward until "られます" is merged (up to 6 times for empty paragraphs)
    for (let attempt = 0; attempt < 6; attempt++) {
      const currentParagraph = await page.evaluate(() => {
        const sel = window.getSelection();
        if (!sel.focusNode) return '';
        let node = sel.focusNode;
        while (node && node.nodeType !== 1) node = node.parentNode;
        return node?.textContent || '';
      });
      if (currentParagraph.includes('られます')) {
        console.log('  Merged after', attempt, 'deletes');
        break;
      }
      await page.keyboard.press('Delete');
      await page.waitForTimeout(300);
    }

    // Verify merge
    const mergeCheck = await findEl('使い続けられます');
    if (mergeCheck < 0) {
      results.MEDIUM4 = 'PARTIAL (cut ok, merge failed)';
    } else {
      // Step 3: Position cursor at end of merged text and paste image
      await scrollTo(mergeCheck);
      const mergedRect = await getElRect(mergeCheck);
      await page.mouse.click(mergedRect.right - 10, mergedRect.cy);
      await page.waitForTimeout(200);
      await page.keyboard.press('End');
      await page.waitForTimeout(200);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(1500);
      results.MEDIUM4 = 'OK';
    }
  } catch (e) { results.MEDIUM4 = 'ERROR: ' + e.message; }
  console.log('MEDIUM-4:', results.MEDIUM4);
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX HIGH-3: Move 02_menu_open from bottom to after workflow image
  // ====================================================================
  console.log('\n--- FIX HIGH-3: Move 02_menu_open ---');
  try {
    // Find the misplaced menu_open image near bottom (near "もし毎日メール対応")
    const menuImgIdx = await page.evaluate(() => {
      const ch = Array.from(document.querySelector('.ProseMirror').children);
      const lastTextIdx = ch.findIndex(c => c.textContent.includes('もし毎日メール対応'));
      if (lastTextIdx < 0) return -1;
      // Find figure above "もし毎日"
      for (let i = lastTextIdx - 1; i >= Math.max(0, lastTextIdx - 5); i--) {
        if (ch[i].tagName === 'FIGURE' && ch[i].querySelector('img')) return i;
      }
      return -1;
    });
    if (menuImgIdx < 0) throw new Error('02_menu_open not found near bottom');
    console.log('  Found menu_open image at index', menuImgIdx);

    // Cut it
    await scrollTo(menuImgIdx);
    const imgC = await getImgCenter(menuImgIdx);
    if (!imgC) throw new Error('img center not found');
    await page.mouse.click(imgC.x, imgC.y);
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+x');
    await page.waitForTimeout(1000);

    // Find target: just before "30分が5分になりました" heading
    // But actually, we want it AFTER the workflow image, which is before this heading.
    // Since the workflow image and H2 may have empty paragraphs between them,
    // let's click at the start of "30分が5分になりました"
    const targetIdx = await findEl('30分が5分になりました');
    if (targetIdx < 0) throw new Error('target heading not found');
    await scrollTo(targetIdx);
    const targetRect = await getElRect(targetIdx);
    // Click at the very start of the heading
    await page.mouse.click(targetRect.left + 5, targetRect.cy);
    await page.waitForTimeout(300);
    await page.keyboard.press('Home');
    await page.waitForTimeout(200);
    // Paste - image should appear before the heading
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(1500);

    results.HIGH3 = 'OK';
  } catch (e) { results.HIGH3 = 'ERROR: ' + e.message; }
  console.log('HIGH-3:', results.HIGH3);
  await page.waitForTimeout(2000);

  // ====================================================================
  // FIX HIGH-2: Add missing paragraph
  // ====================================================================
  console.log('\n--- FIX HIGH-2: Add missing paragraph ---');
  try {
    const refIdx = await findEl('副業の効率を上げたい方に使っていただけると嬉しいです');
    if (refIdx < 0) throw new Error('reference paragraph not found');
    await scrollTo(refIdx);
    const refRect = await getElRect(refIdx);
    await page.mouse.click(refRect.right - 10, refRect.cy);
    await page.waitForTimeout(200);
    await page.keyboard.press('End');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.keyboard.type('メール返信に30分使っていたのが5分になる。それだけで、副業に使える時間が大きく増えます。', { delay: 10 });
    await page.waitForTimeout(1000);

    const check = await findEl('メール返信に30分使っていたのが5分になる');
    results.HIGH2 = check >= 0 ? 'OK' : 'FAILED';
  } catch (e) { results.HIGH2 = 'ERROR: ' + e.message; }
  console.log('HIGH-2:', results.HIGH2);
  await page.waitForTimeout(3000);

  // ====================================================================
  // FINAL VERIFICATION
  // ====================================================================
  await printState('FINAL');

  console.log('\n=== RESULTS SUMMARY ===');
  Object.entries(results).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  const allOk = Object.values(results).every(v => v === 'OK');
  console.log('\nOverall:', allOk ? 'ALL FIXES APPLIED' : 'SOME ISSUES REMAIN');

  await page.waitForTimeout(5000); // final autosave wait
  await ctx.close();
})();
