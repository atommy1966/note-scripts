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

  // Check if ProseMirror view is accessible
  const viewCheck = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    if (!pm) return 'no ProseMirror';

    // Method 1: pmViewDesc
    if (pm.pmViewDesc && pm.pmViewDesc.view) {
      const view = pm.pmViewDesc.view;
      return {
        method: 'pmViewDesc',
        docSize: view.state.doc.content.size,
        childCount: view.state.doc.childCount,
        firstChildType: view.state.doc.firstChild?.type?.name,
      };
    }

    // Method 2: Check React fiber
    const reactKey = Object.keys(pm).find(k => k.startsWith('__react'));

    return { method: 'none', reactKey: reactKey || 'none', keys: Object.keys(pm).slice(0, 10) };
  });
  console.log('View access:', JSON.stringify(viewCheck, null, 2));

  // If we have view access, try to get document structure
  if (viewCheck.method === 'pmViewDesc') {
    const docStructure = await page.evaluate(() => {
      const view = document.querySelector('.ProseMirror').pmViewDesc.view;
      const doc = view.state.doc;
      const nodes = [];
      doc.forEach((node, offset, index) => {
        nodes.push({
          index,
          type: node.type.name,
          textContent: node.textContent?.substring(0, 80),
          childCount: node.childCount,
          pos: offset,
          size: node.nodeSize,
        });
      });
      return nodes;
    });
    console.log('\nDocument structure:');
    docStructure.forEach(n => {
      console.log(`  [${n.index}] ${n.type} pos=${n.pos} size=${n.size}: ${n.textContent || ''}`);
    });
  }

  await ctx.close();
})();
