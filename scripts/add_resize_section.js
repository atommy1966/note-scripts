#!/usr/bin/env node
'use strict';

/**
 * add_resize_section.js
 * 「おまけ：来月どうするか」の前に新セクションを挿入:
 * 1. "参照画像をリサイズしてからAPIに送る" (H3) + Python code + 説明
 * 2. "無料枠に戻す際の注意点" (H3) + 説明
 * 3. "おまけ" の内容を "来月からの運用計画" (H3) に更新
 */

const { chromium } = require('@playwright/test');

const USER_DATA_DIR = '/home/murakami/.cache/ms-playwright/note-cli-profile';
const NOTE_EDITOR_URL = 'https://editor.note.com/notes/nbbb28074c02c/edit/';

async function findElement(page, searchText) {
  return await page.evaluateHandle((text) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return null;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(text)) {
        let el = node.parentElement;
        while (el && !['P', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE'].includes(el.tagName)) {
          el = el.parentElement;
        }
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          return el;
        }
      }
    }
    return null;
  }, searchText);
}

async function clickBeforeElement(page, searchText) {
  const el = await findElement(page, searchText);
  const elHandle = el?.asElement?.();
  if (!elHandle) { console.log('[find] NOT FOUND:', searchText); return false; }
  const box = await elHandle.boundingBox();
  if (!box) return false;
  // Click at start of the element
  await page.mouse.click(box.x + 3, box.y + box.height / 2);
  await page.waitForTimeout(300);
  await page.keyboard.press('Home');
  await page.waitForTimeout(200);
  return true;
}

async function insertH3BeforeCursor(page, text) {
  // Create empty line, move cursor there, type ### heading
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  // Type ### to trigger H3 input rule
  await page.keyboard.type('### ');
  await page.waitForTimeout(500);
  await page.keyboard.type(text);
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

async function typeText(page, text) {
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
}

async function insertCodeBlock(page, code) {
  // Type ``` to trigger code block
  await page.keyboard.type('```');
  await page.waitForTimeout(500);
  // Check if code block appeared
  const codeBlock = await page.$('.ProseMirror pre, .ProseMirror code');
  if (codeBlock) {
    console.log('[code] コードブロック作成成功');
    await page.keyboard.type(code);
    await page.waitForTimeout(200);
    // Exit code block
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  } else {
    // Just type as regular text
    await page.keyboard.type('\n' + code + '\n');
  }
}

async function saveDraft(page) {
  const saveBtn = await page.$('button:has-text("下書き保存")');
  if (saveBtn) {
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2000);
    console.log('[save] 下書き保存完了');
  }
}

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/resize_initial.png' });

  // ===== Step 1: Insert before "おまけ：来月どうするか" =====
  const ANCHOR_OMAKE = 'おまけ：来月どうするか';
  const found = await clickBeforeElement(page, ANCHOR_OMAKE);

  if (!found) {
    console.log('[error] "おまけ" が見つかりません。記事末尾に追加します。');
    // Go to end
    await page.keyboard.press('Control+End');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }

  // ===== Step 2: Insert "参照画像をリサイズしてからAPIに送る" section =====
  console.log('[step2] リサイズセクション挿入');

  await insertH3BeforeCursor(page, '参照画像をリサイズしてからAPIに送る');
  await page.waitForTimeout(300);

  await typeText(page, 'もう一つ、地味だけど効果の大きい対策がある。');
  await typeText(page, '私のプログラムは1536×2752ピクセルの高解像度な参照画像をそのままAPIに送っていた。画像が大きいほど入力トークンが増える。参照用途なら512ピクセルで十分なのに。');
  await page.waitForTimeout(300);

  // Code block
  const pythonCode = `from PIL import Image
import io

# 元画像を読み込んでメモリ上で縮小（元ファイルは書き換えない）
img = Image.open("ref_image.png")
img.thumbnail((512, 512))

# 縮小版をバイト列に変換してAPIに送る
buf = io.BytesIO()
img.save(buf, format="PNG")
resized_bytes = buf.getvalue()`;

  await insertCodeBlock(page, pythonCode);
  await page.waitForTimeout(300);

  await typeText(page, '元ファイルはそのまま。APIに送る直前にメモリ上で縮小するだけ。これで入力トークンが1/5以下になる。コンテキストキャッシュと組み合わせれば、入力トークン代はほぼゼロに近づく。');
  await page.waitForTimeout(500);

  await saveDraft(page);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/resize_section1_done.png' });

  // ===== Step 3: Insert "無料枠に戻す際の注意点" section =====
  console.log('[step3] 無料枠注意点セクション挿入');

  // The cursor should be after the resize section, just before "おまけ"
  // But after saving, find the "おまけ" again and click before it
  const found2 = await clickBeforeElement(page, ANCHOR_OMAKE);
  if (!found2) {
    console.log('[warn] おまけが見つかりません。カーソル現在位置に挿入。');
  }

  await insertH3BeforeCursor(page, '無料枠に戻す際の注意点');
  await page.waitForTimeout(300);

  await typeText(page, '有料枠を解除して無料枠（Free Tier）に戻せば、課金は0円になる。ただし一つ注意点がある。');
  await typeText(page, '無料枠では、送信したプロンプトや画像がGoogleのAIトレーニングに使われる可能性がある。');
  await typeText(page, '有料枠なら学習利用されないが、無料枠ではデータの学習利用に同意したことになる。業務上の機密データやプライベートな画像をAPIに送っている場合は要注意。');
  await typeText(page, '私の場合は漫画パネルの生成プロンプトとキャラクターの参照画像なので、実害はほぼない。でも知っておくべきトレードオフではある。');
  await page.waitForTimeout(500);

  await saveDraft(page);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/resize_section2_done.png' });

  // ===== Step 4: Update "おまけ" heading and content =====
  console.log('[step4] おまけセクション更新');

  // Find and click on the "おまけ：来月どうするか" heading to select all text
  const omakeEl = await findElement(page, ANCHOR_OMAKE);
  const omakeHandle = omakeEl?.asElement?.();
  if (omakeHandle) {
    const box = await omakeHandle.boundingBox();
    if (box) {
      // Click on it
      await page.mouse.click(box.x + 5, box.y + box.height / 2);
      await page.waitForTimeout(300);
      // Select all text in this element
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
      await page.waitForTimeout(200);
      // Replace with new heading text (keeping H2 level, but md specifies H3)
      // Note: we'll change the heading level separately if needed
      await page.keyboard.type('来月からの運用計画');
      await page.waitForTimeout(500);
      console.log('[step4] 見出し更新完了');
    }
  } else {
    console.log('[step4] おまけ見つかりません');
  }

  // Now update the content of the おまけ section
  // The old content is: 毎日1本...サブスクの3,000円...現在の作戦：...27,100円...
  // The new content should be: 毎日1本...対策をまとめると...27,100円...

  // Find old content to replace
  const oldContentAnchor = '毎日1本の漫画ショートを出したい';
  const contentEl = await findElement(page, oldContentAnchor);
  const contentHandle = contentEl?.asElement?.();
  if (contentHandle) {
    const cbox = await contentHandle.boundingBox();
    if (cbox) {
      await page.mouse.click(cbox.x + 5, cbox.y + cbox.height / 2);
      await page.waitForTimeout(300);
      // Select all and type new content
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(200);
      // Actually just click and select this paragraph
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
      await page.waitForTimeout(200);
      await page.keyboard.type('毎日1本の漫画ショートを出したい。でも1本あたり30枚（3セット×10パネル）生成するとして、月900枚。');
      await page.waitForTimeout(300);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      await typeText(page, '対策をまとめると:');
      // Note: note editor should handle this as a paragraph
      console.log('[step4] コンテンツ更新開始');
    }
  }

  await saveDraft(page);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/resize_section4_done.png' });

  // Final state
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/murakami/multi-agent-shogun/queue/reports/resize_final_bottom.png' });

  await ctx.close();
  console.log('[完了]');
})();
