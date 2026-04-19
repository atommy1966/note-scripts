const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext(
    process.env.HOME + '/.cache/ms-playwright/note-cli-profile',
    { headless: true, viewport: { width: 1280, height: 900 } }
  );
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://editor.note.com/notes/nf94d345c9775/edit/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const editor = await page.$('.ProseMirror') || await page.$('[contenteditable]');
  if (!editor) { console.log('NO EDITOR'); await browser.close(); return; }

  // Step 1: Find the element with "⚠️" text (element [66]) and click on it
  const targetEl = await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror') || document.querySelector('[contenteditable]');
    for (let i = 0; i < ed.children.length; i++) {
      const text = ed.children[i].innerText || '';
      if (text.includes('⚠️')) {
        const rect = ed.children[i].getBoundingClientRect();
        return { i, top: rect.top, left: rect.left };
      }
    }
    return null;
  });
  
  if (!targetEl) { console.log('Target not found'); await browser.close(); return; }
  console.log('Found warning at element', targetEl.i);

  // Step 2: Click on the warning element to position cursor there
  await page.mouse.click(targetEl.left + 10, targetEl.top + 10);
  await page.waitForTimeout(500);

  // Step 3: Select from here to end of document (Ctrl+Shift+End)
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.keyboard.press('End');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);

  // Step 4: Delete the selection
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(500);

  // Step 5: Type clean replacement content
  const lines = [
    '⚠️ ※ 重要：本モデルはPublic Preview（GA未到達）です',
    '',
    'Gemini Embedding 2は2026年3月10日にPublic Previewとして公開されました。まだ正式リリース（General Availability）には到達していません。モデルIDにも gemini-embedding-2-preview と -preview が付いています。',
    '',
    'Public Previewとは、誰でも試せる状態ですが、仕様変更・モデル更新・廃止の可能性があります。本番システムへの採用は正式リリース後を推奨します。最新情報は公式ドキュメントをご確認ください。',
    '',
    '参考リンク',
    '',
    'Google公式ブログ: Gemini Embedding 2発表',
    'https://blog.google/technology/google-deepmind/gemini-embedding-model/',
    '',
    'Google AI for Developers: Embeddingガイド',
    'https://ai.google.dev/gemini-api/docs/embeddings',
    '',
    '#GeminiEmbedding2 #AI #マルチモーダル #GoogleAI #Embedding #RAG #ベクトル検索 #機械学習 #個人開発',
  ];

  for (const line of lines) {
    if (line === '') {
      await page.keyboard.press('Enter');
    } else {
      await page.keyboard.type(line, { delay: 5 });
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(100);
  }

  console.log('Content typed');
  await page.waitForTimeout(1000);

  // Make "参考リンク" a heading - select it and make it H2
  // First find it and triple-click to select the line
  const refHeading = await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror') || document.querySelector('[contenteditable]');
    for (let i = 0; i < ed.children.length; i++) {
      if ((ed.children[i].innerText || '').trim() === '参考リンク') {
        const rect = ed.children[i].getBoundingClientRect();
        return { top: rect.top + 5, left: rect.left + 5 };
      }
    }
    return null;
  });

  if (refHeading) {
    // Triple click to select the line
    await page.mouse.click(refHeading.left, refHeading.top, { clickCount: 3 });
    await page.waitForTimeout(300);
    // Note editor: Ctrl+Alt+2 or markdown # for H2 - try typing ## at start
    // Actually in note editor, we might need to use keyboard shortcut
    // Let's try Home key then type ##
    // Actually, just leave it as is - plain text is fine for note
  }

  await page.waitForTimeout(1000);

  // Save
  const saveBtn = await page.$('button:has-text("下書き保存")');
  if (saveBtn) {
    await saveBtn.click();
    console.log('Saved');
    await page.waitForTimeout(3000);
  }

  // Verify
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.7));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/note_rewrite_mid.png' });
  
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/note_rewrite_end.png' });

  console.log('Done');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
