# Claude Codeのスキルが発動しない？置き場所1つで全部変わった

## はじめに

Claude Codeで20個以上のスキル（ワークフロー定義）を作った。漫画ショート制作、動画パイプライン、サムネイル生成、YouTube統計…どれも力作だ。

問題は、**AIが自発的に使ってくれない**こと。

「漫画パネル作って」と言っても、スキルを呼ばずに手動でコマンドを組み立て始める。「/manga-short」と明示的に呼べば動くが、文脈から判断して自動で使ってほしい。

解決策は驚くほど簡単だった。**ファイルの置き場所を変えるだけ。**

## 現象: skills/に置いたスキルは自発発動しない

うちのリポジトリ構成：

```
skills/
  manga-short/SKILL.md      ← 漫画ショート制作
  video-pipeline/SKILL.md   ← 動画パイプライン
  thumbnail/SKILL.md        ← サムネイル生成
  ...（20個以上）

.claude/commands/
  handoff.md                ← 引き継ぎ保存
  rehydrate.md              ← 引き継ぎ復帰
```

`skills/` に置いたスキルは「/manga-short」とスラッシュコマンドで呼べば動く。しかしAIが自発的に「ここは/manga-shortを使うべきだ」と判断して呼ぶことはほぼない。

一方、`.claude/commands/handoff.md` は違った。コンテキストが増えてくると、AIが自発的に「引き継ぎを保存しましょうか」と提案してくる。明示的に呼んでいないのに。

## 発見: .claude/commands/ に置くと自発発動する

不思議に思って調べた。`.claude/commands/handoff.md` には1行目にこう書いてある：

```
現在の作業状態を引き継ぎファイルに保存します。compactの代替としても使用可能。
```

この「compactの代替としても使用可能」がキモだった。Claude Codeはこの説明文を見て、「コンテキストが増えてきたら使うべきもの」と判断し、自発的に提案していた。

### 実験: 全スキルを .claude/commands/ にコピー

```bash
for skill_dir in skills/*/; do
  skill_name=$(basename "$skill_dir")
  cp "$skill_dir/SKILL.md" ".claude/commands/${skill_name}.md"
done
```

21ファイルをコピーした瞬間、system-reminderに全スキルが表示された：

```
Available skills:
- video-pipeline: ドズル社切り抜き動画の素材パイプラインを実行する...
- manga-short: ドズル社漫画ショート動画の制作ワークフローを実行する...
- thumbnail: サムネイルをmake_thumbnail_auto.pyで自動生成する...
- senkyou: 将軍が殿に戦況を報告するスキル...
（全21スキル表示）
```

**ファイルの置き場所を変えるだけで、AIの認知範囲に入った。**

## なぜ場所で動作が変わるのか

Claude Codeの仕組み（推測を含む）：

| 場所 | 認知 | 自発発動 |
|------|------|---------|
| `skills/SKILL.md` | スラッシュコマンドとして登録 | 明示呼び出しのみ |
| `.claude/commands/*.md` | system-reminderに表示 | **文脈判断で自発発動** |

`.claude/commands/` に置かれたファイルは、毎ターンのsystem-reminderで「利用可能なスキル」としてAIに提示される。AIはこのリストを見て、会話の文脈に合うスキルを自発的に使う。

`skills/` に置いたファイルはスラッシュコマンドとして登録されるが、system-reminderには表示されない（または目立たない形で表示される）。だから自発発動しない。

## 実用的な影響

### Before: 「/manga-short」と毎回言う必要があった

```
殿: 「パチンコの漫画作って」
将軍: 「承知。panels JSONを作成して...」（手動でコマンドを組み立て始める）
殿: 「/manga-short使え」
将軍: 「失礼。/manga-shortスキルを実行します」
```

### After: 文脈から自動判断

```
殿: 「パチンコの漫画作って」
将軍: 「/manga-shortスキルを実行します」（自発的に判断）
```

## 注意点

1. **ファイル数の増加**: `.claude/commands/` に25ファイル（元4 + スキル21）。system-reminderの表示量が増える
2. **元のskills/も残す**: スラッシュコマンドとしても使えるように。両方に置く
3. **1行目の説明文が重要**: AIが自発発動するかどうかは、1行目の説明文（description）の質に依存する。「いつ使うべきか」が明確な説明文を書く

## description設計のコツ

自発発動の確率を上げるdescriptionの書き方：

```
❌ 悪い例: 「漫画ショートを制作するスキル」
✅ 良い例: 「漫画ショート動画の制作ワークフローを実行する。
panels JSONからPNG生成→音声結合→縦型動画→YouTube非公開アップまで一貫して担当。
「漫画ショート制作」「manga-short」「パネルPNG生成」で起動。」
```

ポイント：
- **何をするか**を具体的に書く
- **トリガーワード**を明記する（AIがキーワードマッチしやすい）
- **何に使わないか**も書く（誤発動防止）

## まとめ

Claude Codeのスキルが自発発動しない場合、まず試すべきは：

```bash
cp skills/*/SKILL.md .claude/commands/
```

これだけ。コードの変更ゼロ。設定の変更ゼロ。ファイルの置き場所を変えるだけで、AIの動作が変わる。

ハーネスエンジニアリングとは、こういう「環境の微調整」の積み重ねだ。
