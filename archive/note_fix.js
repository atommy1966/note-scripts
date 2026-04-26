const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext(
    process.env.HOME + '/.cache/ms-playwright/note-profile',
    { headless: true, viewport: { width: 1280, height: 900 } }
  );
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://editor.note.com/notes/nf94d345c9775/edit/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Get all elements with their indices for surgical editing
  const structure = await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror') || document.querySelector('[contenteditable]');
    if (!editor) return 'NO EDITOR';
    const result = [];
    for (let i = 0; i < editor.children.length; i++) {
      const el = editor.children[i];
      const tag = el.tagName;
      const text = (el.innerText || '').substring(0, 100);
      const html = (el.outerHTML || '').substring(0, 200);
      result.push({ i, tag, text, html });
    }
    return result;
  });

  // Find problematic elements
  console.log('Total elements:', structure.length);
  
  // Show elements from "まとめ" section onwards
  let found = false;
  for (const el of structure) {
    if (el.text.includes('まとめ') || found) {
      found = true;
      console.log(`[${el.i}] ${el.tag}: ${el.text}`);
    }
  }
  
  // Also show the UL with empty links
  for (const el of structure) {
    if (el.tag === 'UL') {
      console.log(`\nUL at [${el.i}]: html=${el.html}`);
    }
  }

  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
