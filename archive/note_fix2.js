const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext(
    process.env.HOME + '/.cache/ms-playwright/note-profile',
    { headless: true, viewport: { width: 1280, height: 900 } }
  );
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://editor.note.com/notes/nf94d345c9775/edit/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Fix: remove broken elements [66]-[80] and replace with clean text
  // Then fix empty UL [83] (will shift after deletions)
  await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror') || document.querySelector('[contenteditable]');
    if (!editor) throw new Error('NO EDITOR');

    // Elements 66-80 need to be removed (the broken blockquote section)
    // Replace with a clean paragraph version
    const toRemove = [];
    for (let i = 66; i <= 80; i++) {
      toRemove.push(editor.children[i]);
    }

    // Create replacement content: clean warning paragraphs
    const warningP = document.createElement('p');
    warningP.innerHTML = '<br>';
    
    const noteP1 = document.createElement('p');
    noteP1.innerHTML = '⚠️ <strong>※ 重要：本モデルはPublic Preview（GA未到達）です</strong>';
    
    const noteP2 = document.createElement('p');
    noteP2.innerHTML = 'Gemini Embedding 2は2026年3月10日にPublic Previewとして公開されました。<strong>まだ正式リリース（General Availability）には到達していません。</strong> モデルIDにも <code>gemini-embedding-2-preview</code> と <strong>-preview</strong> が付いています。';
    
    const noteP3 = document.createElement('p');
    noteP3.innerHTML = 'Public Previewとは、誰でも試せる状態ですが、仕様変更・モデル更新・廃止の可能性があります。本番システムへの採用は正式リリース後を推奨します。';
    
    const noteP4 = document.createElement('p');
    noteP4.innerHTML = '最新情報は公式ドキュメントをご確認ください。';

    const noteP5 = document.createElement('p');
    noteP5.innerHTML = '<br>';

    // Insert replacements before element 66
    const insertBefore = editor.children[66];
    editor.insertBefore(warningP, insertBefore);
    editor.insertBefore(noteP1, insertBefore);
    editor.insertBefore(noteP2, insertBefore);
    editor.insertBefore(noteP3, insertBefore);
    editor.insertBefore(noteP4, insertBefore);
    editor.insertBefore(noteP5, insertBefore);

    // Now remove the old broken elements (they've shifted by 6)
    for (let i = 0; i < 15; i++) {
      const el = editor.children[66 + 6]; // always remove the element right after our insertions
      if (el) el.remove();
    }
    
    // Now fix the empty UL for references
    // After our modifications, find the UL after "参考リンク"
    let refUL = null;
    for (let i = 0; i < editor.children.length; i++) {
      if (editor.children[i].tagName === 'H2' && editor.children[i].innerText.includes('参考リンク')) {
        // Find the next UL
        for (let j = i + 1; j < editor.children.length; j++) {
          if (editor.children[j].tagName === 'UL') {
            refUL = editor.children[j];
            break;
          }
        }
        break;
      }
    }
    
    if (refUL) {
      refUL.innerHTML = 
        '<li><p><a href="https://blog.google/technology/google-deepmind/gemini-embedding-model/" target="_blank">Google公式ブログ: Gemini Embedding 2発表</a></p></li>' +
        '<li><p><a href="https://ai.google.dev/gemini-api/docs/embeddings" target="_blank">Google AI for Developers: Embeddingガイド</a></p></li>';
    }

    // Trigger input event so editor registers changes
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await page.waitForTimeout(2000);
  
  // Click save button
  const saveBtn = await page.$('button:has-text("下書き保存")');
  if (saveBtn) {
    await saveBtn.click();
    console.log('Clicked save button');
    await page.waitForTimeout(3000);
  } else {
    console.log('Save button not found');
  }

  // Take verification screenshot
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.75));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/note_fixed_bottom.png' });
  
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/note_fixed_end.png' });

  console.log('Done');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
