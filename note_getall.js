const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext(
    process.env.HOME + '/.cache/ms-playwright/note-cli-profile',
    { headless: true, viewport: { width: 1280, height: 900 } }
  );
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://editor.note.com/notes/nf94d345c9775/edit/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const structure = await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror') || document.querySelector('[contenteditable]');
    if (!editor) return 'NO EDITOR';
    const result = [];
    for (let i = 0; i < editor.children.length; i++) {
      const el = editor.children[i];
      const tag = el.tagName;
      const text = (el.innerText || '');
      const html = (el.outerHTML || '').substring(0, 500);
      result.push({ i, tag, text, html });
    }
    return result;
  });

  for (const el of structure) {
    console.log(`[${el.i}] ${el.tag}: ${el.text.substring(0, 150)}`);
  }

  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
