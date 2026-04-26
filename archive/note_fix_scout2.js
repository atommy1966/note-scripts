const { chromium } = require('@playwright/test');
(async () => {
  const ctx = await chromium.launchPersistentContext(
    '/home/murakami/.cache/ms-playwright/note-cli-profile',
    { headless: false, locale: 'ja-JP', viewport: { width: 1280, height: 800 } }
  );
  const page = await ctx.newPage();
  await page.goto('https://editor.note.com/notes/ncef792faac1f/edit/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  const check = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    const desc = pm.pmViewDesc;
    const result = {
      descType: typeof desc,
      descKeys: desc ? Object.keys(desc).slice(0, 20) : [],
      hasView: desc ? !!desc.view : false,
    };

    // Try to traverse to find view
    if (desc) {
      let d = desc;
      while (d && !d.view && d.parent) d = d.parent;
      if (d && d.view) {
        result.foundView = true;
        result.viewMethod = 'parent traversal';
        const view = d.view;
        result.docSize = view.state.doc.content.size;
        result.childCount = view.state.doc.childCount;
      }
    }
    return result;
  });
  console.log('Check:', JSON.stringify(check, null, 2));

  if (check.foundView) {
    // Get full document structure with positions
    const docNodes = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      let d = pm.pmViewDesc;
      while (d && !d.view && d.parent) d = d.parent;
      const view = d.view;
      const doc = view.state.doc;
      const nodes = [];
      doc.forEach((node, offset) => {
        const info = {
          type: node.type.name,
          pos: offset,
          size: node.nodeSize,
          text: node.textContent?.substring(0, 100),
        };
        if (node.type.name === 'image' || (node.firstChild && node.firstChild.type.name === 'image')) {
          info.hasImage = true;
          // Try to get image src
          node.descendants((child) => {
            if (child.type.name === 'image') {
              info.imgSrc = child.attrs.src?.substring(0, 60);
            }
          });
        }
        if (node.type.name === 'figure') {
          info.isFigure = true;
          node.descendants((child) => {
            if (child.type.name === 'image') {
              info.imgSrc = child.attrs?.src?.substring(0, 60) || '';
            }
            if (child.type.name === 'figcaption') {
              info.caption = child.textContent?.substring(0, 80);
            }
          });
        }
        nodes.push(info);
      });
      return nodes;
    });
    console.log('\nDocument nodes:');
    docNodes.forEach((n, i) => {
      let line = `[${i}] ${n.type} pos=${n.pos} size=${n.size}`;
      if (n.imgSrc) line += ` img=${n.imgSrc}`;
      if (n.caption) line += ` cap="${n.caption}"`;
      if (n.text && !n.imgSrc) line += `: ${n.text}`;
      console.log(line);
    });
  }

  await ctx.close();
})();
