const { chromium } = require('@playwright/test');
(async () => {
  const ctx = await chromium.launchPersistentContext(
    '/home/murakami/.cache/ms-playwright/note-cli-profile',
    { headless: false, locale: 'ja-JP', viewport: { width: 1280, height: 900 } }
  );
  const page = await ctx.newPage();

  const EDIT_URL = 'https://editor.note.com/notes/n4fa831163f4e/edit/';
  console.log(`Opening: ${EDIT_URL}`);
  await page.goto(EDIT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  const title = await page.title();
  console.log(`Page title: ${title}`);

  // Check editor exists
  const editorExists = await page.evaluate(() => !!document.querySelector('.ProseMirror'));
  if (!editorExists) {
    console.log('ERROR: ProseMirror editor not found!');
    await page.screenshot({ path: '/tmp/note_376a_debug.png' });
    await ctx.close();
    process.exit(1);
  }

  // Get full article text
  const fullText = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return pm ? pm.innerText : '';
  });
  console.log('\n=== FULL ARTICLE TEXT ===');
  console.log(fullText);

  // Get structure (paragraphs and their indices)
  const structure = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    const ch = Array.from(pm.children);
    return ch.map((el, i) => {
      const img = el.querySelector('img');
      const text = el.innerText?.trim() || '';
      return {
        idx: i,
        tag: el.tagName,
        isImg: !!img,
        imgSrc: img ? (img.src || '').substring(0, 80) : null,
        text: text.substring(0, 100),
      };
    });
  });

  console.log('\n=== STRUCTURE ===');
  structure.forEach(el => {
    if (el.isImg) {
      console.log(`  [${el.idx}] IMG: ${el.imgSrc}`);
    } else {
      console.log(`  [${el.idx}] ${el.tag}: ${el.text}`);
    }
  });

  // Count occurrences of 殿
  const tonoCount = (fullText.match(/殿/g) || []).length;
  console.log(`\n=== 殿 count: ${tonoCount} ===`);

  // Find step keywords
  const stepKeywords = ['step1', 'step2', 'step3', 'Step1', 'Step2', 'Step3',
    'ステップ1', 'ステップ2', 'ステップ3', '警告', '詳細', '権限',
    'STEP 1', 'STEP 2', 'STEP 3'];
  console.log('\n=== Step-related elements ===');
  structure.forEach(el => {
    const lowerText = el.text.toLowerCase();
    if (stepKeywords.some(k => lowerText.includes(k.toLowerCase()) ||
        (el.text && el.text.includes(k)))) {
      console.log(`  [${el.idx}] ${el.tag}: ${el.text}`);
    }
  });

  await page.screenshot({ path: '/tmp/note_376a_scout.png', fullPage: true });
  console.log('\nScreenshot saved to /tmp/note_376a_scout.png');

  await ctx.close();
})();
