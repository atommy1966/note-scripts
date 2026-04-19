const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext(
    process.env.HOME + '/.cache/ms-playwright/note-cli-profile',
    { headless: true, viewport: { width: 1280, height: 900 } }
  );
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://editor.note.com/notes/nf94d345c9775/edit/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  const content = await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror') || document.querySelector('[contenteditable]');
    if (!editor) return 'NO EDITOR FOUND';
    
    const elements = [];
    for (const child of editor.children) {
      const tag = child.tagName;
      const text = (child.innerText || '').substring(0, 300);
      elements.push(tag + ': ' + text);
    }
    return elements.join('\n---\n');
  });
  
  console.log(content);
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
