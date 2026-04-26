const { chromium } = require('@playwright/test');
(async () => {
  const ctx = await chromium.launchPersistentContext(
    '/home/murakami/.cache/ms-playwright/note-cli-profile',
    { headless: false, locale: 'ja-JP', viewport: { width: 1280, height: 900 } }
  );
  const page = await ctx.newPage();

  // note記事C2の編集URL
  // 公開URL: https://note.com/n/n4fa831163f4e
  // 編集URL: https://editor.note.com/notes/n4fa831163f4e/edit/
  const EDIT_URL = 'https://editor.note.com/notes/n4fa831163f4e/edit/';
  const SCREENSHOT_DIR = '/home/murakami/multi-agent-shogun/queue/reports/';

  console.log(`Opening: ${EDIT_URL}`);
  await page.goto(EDIT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  const title = await page.title();
  console.log(`Page title: ${title}`);

  // Before screenshot
  await page.screenshot({ path: SCREENSHOT_DIR + 'note_c2_before_375a.png', fullPage: true });
  console.log('Before screenshot saved');

  // エディタの存在確認
  const editorExists = await page.evaluate(() => {
    return !!document.querySelector('.ProseMirror');
  });
  if (!editorExists) {
    console.log('ERROR: ProseMirror editor not found!');
    await page.screenshot({ path: SCREENSHOT_DIR + 'note_c2_debug_375a.png', fullPage: true });
    await ctx.close();
    process.exit(1);
  }

  // 現在のテキスト内容を確認
  const currentText = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return pm ? pm.innerText : '';
  });
  console.log(`\nCurrent text (first 1000 chars):\n${currentText.substring(0, 1000)}`);

  // ====================================================================
  // 置換リスト（長い文字列→短い文字列の順）
  // ====================================================================
  const replacements = [
    // パス置換（最も具体的なものから）
    ['/home/murakami/multi-agent-shogun/', '/home/naginata/マルチエージェントシステム/'],
    ['/home/murakami/', '/home/naginata/'],
    ['home/murakami/multi-agent-shogun', 'home/naginata/マルチエージェントシステム'],
    ['home/murakami/', 'home/naginata/'],
    // システム名
    ['multi-agent-shogun', 'マルチエージェントシステム'],
    ['multi_agent_shogun', 'マルチエージェントシステム'],
    // 個人名（大文字小文字）
    ['Murakami', 'naginata'],
    ['murakami', 'naginata'],
    // 戦国モチーフ置換（役職名・英語含む）
    ['将軍（Shogun）', 'トップエージェント'],
    ['将軍(Shogun)', 'トップエージェント'],
    ['Shogun（将軍）', 'トップエージェント'],
    ['Shogun(将軍)', 'トップエージェント'],
    ['将軍', 'トップエージェント'],
    ['家老（Karo）', 'マネージャーエージェント'],
    ['家老(Karo)', 'マネージャーエージェント'],
    ['Karo（家老）', 'マネージャーエージェント'],
    ['Karo(家老)', 'マネージャーエージェント'],
    ['家老', 'マネージャーエージェント'],
    ['足軽（Ashigaru）', '実行エージェント'],
    ['足軽(Ashigaru)', '実行エージェント'],
    ['Ashigaru（足軽）', '実行エージェント'],
    ['Ashigaru(足軽)', '実行エージェント'],
    ['足軽', '実行エージェント'],
    ['軍師（Gunshi）', '品質チェックエージェント'],
    ['軍師(Gunshi)', '品質チェックエージェント'],
    ['Gunshi（軍師）', '品質チェックエージェント'],
    ['Gunshi(軍師)', '品質チェックエージェント'],
    ['軍師', '品質チェックエージェント'],
    ['切腹', 'セッションリセット'],
    // 英語だけの役職名（文章中に単独で使われている場合）
    ['Shogun', 'トップエージェント'],
    ['Karo', 'マネージャーエージェント'],
    ['Ashigaru', '実行エージェント'],
    ['ashigaru', '実行エージェント'],
    ['Gunshi', '品質チェックエージェント'],
    ['gunshi', '品質チェックエージェント'],
  ];

  // window.find() + execCommand を使った置換
  // (ProseMirrorのinputイベントを正しくトリガーする方法)
  let totalReplaced = 0;

  for (const [oldStr, newStr] of replacements) {
    let count = 0;
    let maxAttempts = 50; // 無限ループ防止
    while (maxAttempts-- > 0) {
      const found = await page.evaluate((searchStr) => {
        // window.findで文字列を検索・選択
        // case sensitive, wrap around, not backward, not whole word, not multi-line
        return window.find(searchStr, true, false, false, false, false, false);
      }, oldStr);

      if (!found) break;

      // 選択されたテキストをexecCommandで置換
      const replaced = await page.evaluate((replacement) => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        if (!range || range.collapsed) return false;

        // ProseMirrorエディタ内かチェック
        const pm = document.querySelector('.ProseMirror');
        if (!pm || !pm.contains(range.commonAncestorContainer)) return false;

        // execCommandで置換（ProseMirrorのinputイベントをトリガー）
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
    }
  }

  console.log(`\nTotal replacements: ${totalReplaced}`);

  // 置換後の検証
  await page.waitForTimeout(2000);
  const afterText = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    return pm ? pm.innerText : '';
  });

  const checkPatterns = [
    'murakami', 'Murakami',
    'multi-agent-shogun',
    '将軍', '家老', '足軽', '軍師', '切腹',
    'Shogun', 'Karo', 'Ashigaru', 'Gunshi',
  ];

  const remaining = [];
  for (const p of checkPatterns) {
    if (afterText.includes(p)) {
      remaining.push(p);
      console.log(`  WARNING: Still found "${p}"`);
    }
  }

  if (remaining.length === 0) {
    console.log('\n✓ All sensitive patterns removed!');
  } else {
    console.log(`\n⚠ Remaining issues: ${remaining.join(', ')}`);
  }

  // After screenshot
  await page.screenshot({ path: SCREENSHOT_DIR + 'note_c2_after_375a.png', fullPage: true });
  console.log('After screenshot saved');

  // 保存（autosaveを待つ or Ctrl+S）
  console.log('\nWaiting for autosave...');
  await page.waitForTimeout(5000);

  // Ctrl+Sで保存を試みる
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(3000);

  // 保存確認
  const saveStatus = await page.evaluate(() => {
    // "保存しました" or similar toast/indicator
    const texts = Array.from(document.querySelectorAll('*'))
      .filter(el => el.children.length === 0 && el.textContent.trim())
      .map(el => el.textContent.trim())
      .filter(t => t.includes('保存') || t.includes('saved') || t.includes('draft'));
    return texts.slice(0, 5);
  });
  console.log('Save status indicators:', saveStatus);

  await page.screenshot({ path: SCREENSHOT_DIR + 'note_c2_saved_375a.png', fullPage: true });
  console.log('Final screenshot saved');

  console.log('\n=== SUMMARY ===');
  console.log(`Total replacements made: ${totalReplaced}`);
  console.log(`Remaining issues: ${remaining.length === 0 ? 'None (SUCCESS)' : remaining.join(', ')}`);
  console.log('Draft status maintained (not published)');

  await ctx.close();
  process.exit(remaining.length > 0 ? 1 : 0);
})();
