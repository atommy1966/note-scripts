#!/usr/bin/env python3
"""Generate PNG images from tables in the GLM-5.1 comparison article."""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np
import os

# Font setup
font_path = None
for fp in fm.findSystemFonts():
    if 'NotoSansCJK' in fp and 'Bold' in fp:
        font_path = fp
        break
if not font_path:
    for fp in fm.findSystemFonts():
        if 'NotoSansCJK-Black' in fp:
            font_path = fp
            break

font_prop = fm.FontProperties(fname=font_path, size=14)
font_prop_title = fm.FontProperties(fname=font_path, size=18)
font_prop_small = fm.FontProperties(fname=font_path, size=12)
font_prop_header = fm.FontProperties(fname=font_path, size=13)

# Colors - dark theme
BG_COLOR = '#1a1a2e'
CELL_BG = '#16213e'
HEADER_BG = '#0f3460'
ACCENT = '#e94560'
TEXT_COLOR = '#eaeaea'
HIGHLIGHT_COLOR = '#53d769'

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def draw_table(data, col_labels, row_labels, title, filename,
               highlight_cells=None, col_widths=None):
    """Draw a styled table as PNG."""
    n_rows = len(data)
    n_cols = len(col_labels)

    fig_width = max(10, n_cols * 2.8)
    fig_height = max(3, (n_rows + 1.5) * 0.7 + 1.2)
    fig, ax = plt.subplots(figsize=(fig_width, fig_height))
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(BG_COLOR)
    ax.axis('off')

    # Title
    ax.text(0.5, 0.97, title, transform=ax.transAxes,
            fontproperties=font_prop_title, color=TEXT_COLOR,
            ha='center', va='top', fontweight='bold')

    # Table
    cell_text = []
    cell_colors = []
    for i, row in enumerate(data):
        text_row = []
        color_row = []
        for j, val in enumerate(row):
            text_row.append(str(val))
            if highlight_cells and (i, j) in highlight_cells:
                color_row.append(HIGHLIGHT_COLOR + '33')  # semi-transparent green
            else:
                color_row.append(CELL_BG)
        cell_text.append(text_row)
        cell_colors.append(color_row)

    table = ax.table(
        cellText=cell_text,
        colLabels=col_labels,
        rowLabels=row_labels,
        cellColours=cell_colors,
        colColours=[HEADER_BG] * n_cols,
        rowColours=[HEADER_BG] * n_rows,
        loc='center',
        cellLoc='center'
    )

    table.auto_set_font_size(False)

    # Style cells
    for (row, col), cell in table.get_celld().items():
        cell.set_edgecolor('#2a2a4a')
        cell.set_linewidth(1.2)
        if row == 0:  # header row (colLabels)
            cell.set_text_props(fontproperties=font_prop_header, color=TEXT_COLOR,
                               fontweight='bold')
            cell.set_facecolor(HEADER_BG)
            cell.set_height(0.12)
        elif col == -1:  # rowLabels
            cell.set_text_props(fontproperties=font_prop_small, color=ACCENT,
                               fontweight='bold')
            cell.set_facecolor(HEADER_BG)
            cell.set_height(0.10)
        else:
            fp = font_prop_small
            tc = TEXT_COLOR
            if highlight_cells and (row - 1, col) in highlight_cells:
                tc = HIGHLIGHT_COLOR
                fp = fm.FontProperties(fname=font_path, size=13, weight='bold')
            cell.set_text_props(fontproperties=fp, color=tc)
            cell.set_height(0.10)

    if col_widths:
        for (row, col), cell in table.get_celld().items():
            if col >= 0 and col < len(col_widths):
                cell.set_width(col_widths[col])

    plt.tight_layout()
    filepath = os.path.join(OUT_DIR, filename)
    fig.savefig(filepath, dpi=150, bbox_inches='tight',
                facecolor=fig.get_facecolor(), pad_inches=0.3)
    plt.close(fig)
    print(f"Saved: {filepath}")


def draw_cover():
    """Create cover image 1280x670."""
    fig, ax = plt.subplots(figsize=(12.8, 6.7))
    fig.patch.set_facecolor('#0a0a1a')
    ax.set_facecolor('#0a0a1a')
    ax.axis('off')
    ax.set_xlim(0, 12.8)
    ax.set_ylim(0, 6.7)

    # Gradient-like accent bars
    from matplotlib.patches import FancyBboxPatch, Rectangle
    ax.add_patch(Rectangle((0, 0), 12.8, 0.15, facecolor=ACCENT, alpha=0.8))
    ax.add_patch(Rectangle((0, 6.55), 12.8, 0.15, facecolor=ACCENT, alpha=0.8))

    # Decorative side accents
    ax.add_patch(Rectangle((0.3, 1.5), 0.08, 3.5, facecolor=ACCENT, alpha=0.6))
    ax.add_patch(Rectangle((12.42, 1.5), 0.08, 3.5, facecolor=ACCENT, alpha=0.6))

    # Title
    fp_title = fm.FontProperties(fname=font_path, size=36, weight='bold')
    fp_sub = fm.FontProperties(fname=font_path, size=18)
    fp_models = fm.FontProperties(fname=font_path, size=24, weight='bold')
    fp_tag = fm.FontProperties(fname=font_path, size=16)

    ax.text(6.4, 4.8, 'GLM-5.1 vs Claude Opus vs Sonnet',
            fontproperties=fp_title, color='#ffffff',
            ha='center', va='center', fontweight='bold')
    ax.text(6.4, 3.8, '実戦比較レポート',
            fontproperties=fp_sub, color=TEXT_COLOR,
            ha='center', va='center')

    # Model names
    ax.text(3.0, 2.6, 'GLM-5.1', fontproperties=fp_models,
            color='#4fc3f7', ha='center', va='center')
    ax.text(6.4, 2.6, 'Opus 4.6', fontproperties=fp_models,
            color='#e94560', ha='center', va='center')
    ax.text(9.8, 2.6, 'Sonnet 4.6', fontproperties=fp_models,
            color='#ffd54f', ha='center', va='center')

    # Tagline
    ax.text(6.4, 1.4, '基礎問はほぼ互角 ｜ 難問で差が開いた ｜ 年間18万円の節約',
            fontproperties=fp_tag, color='#aaaaaa',
            ha='center', va='center')

    # Bottom tag
    ax.text(6.4, 0.7, '同一プロンプト × 10問 × 5点満点評価',
            fontproperties=fp_tag, color='#666666',
            ha='center', va='center')

    filepath = os.path.join(OUT_DIR, 'cover.png')
    fig.savefig(filepath, dpi=100,
                facecolor=fig.get_facecolor(), pad_inches=0)
    plt.close(fig)
    # Resize to exact 1280x670
    from PIL import Image
    img = Image.open(filepath)
    img = img.resize((1280, 670), Image.LANCZOS)
    img.save(filepath)
    print(f"Saved: {filepath}")


if __name__ == '__main__':
    # Table 1: 基礎問（第1ラウンド）
    draw_table(
        data=[
            ['4.8', '4.6', '4.8'],
            ['4.8', '4.8', '4.6'],
            ['<1秒', '4.3秒', '16秒'],
        ],
        col_labels=['Opus 4.6', 'Sonnet 4.6', 'GLM-5.1'],
        row_labels=['正確性平均', '品質平均', '応答速度'],
        title='基礎問（第1ラウンド）',
        filename='table_1.png',
        highlight_cells=[(0, 0), (0, 2), (1, 0), (1, 1)],
        col_widths=[0.25, 0.25, 0.25]
    )

    # Table 2: 難問（第2ラウンド）
    draw_table(
        data=[
            ['5.0', '4.2', '3.8'],
            ['4.8', '3.8', '4.0'],
            ['5.0', '3.8', '3.6'],
            ['<1秒', '15.4秒', '43.3秒'],
        ],
        col_labels=['Opus 4.6', 'Sonnet 4.6', 'GLM-5.1'],
        row_labels=['正確性平均', '深さ平均', '実用性平均', '応答速度'],
        title='難問（第2ラウンド）',
        filename='table_2.png',
        highlight_cells=[(0, 0), (1, 0), (2, 0)],
        col_widths=[0.25, 0.25, 0.25]
    )

    # Table 3: 各モデル固有の弱点
    draw_table(
        data=[
            ['Markdownリンク構文が壊れる（2箇所）'],
            ['架空の情報を捏造（存在しない「UIライブラリ」を記事に書いた）'],
            ['特になし'],
        ],
        col_labels=['固有の弱点'],
        row_labels=['GLM-5.1', 'Sonnet', 'Opus'],
        title='各モデル固有の弱点',
        filename='table_3.png',
        highlight_cells=[(2, 0)],
        col_widths=[0.7]
    )

    # Table 4: 最終構成
    draw_table(
        data=[
            ['Opus 4.6', '1体'],
            ['Opus 4.6', '1体'],
            ['Opus 4.6', '1体'],
            ['GLM-5.1', '複数体'],
        ],
        col_labels=['モデル', '台数'],
        row_labels=['指揮官（判断・意思決定）', '管理者（タスク分解・品質管理）',
                    '参謀（分析・QC）', '作業者（実装・変換・検索）'],
        title='最終構成',
        filename='table_4.png',
    )

    # Table 5: Before/After コスト比較
    draw_table(
        data=[
            ['Max $220/月', 'Max $100/月（予定）'],
            ['なし', 'Pro $252/年'],
            ['約40万円', '約22万円'],
            ['—', '▲約18万円/年'],
        ],
        col_labels=['Before', 'After'],
        row_labels=['Claude', 'GLM', '年間', '節約'],
        title='コスト比較',
        filename='table_5.png',
        highlight_cells=[(3, 1)],
    )

    # Table 6: 3モデルの性格まとめ
    draw_table(
        data=[
            ['◎', '○（ffmpegで音声バグ）', '◎'],
            ['◎', '○', '○'],
            ['できる', 'できない', 'できない'],
            ['なし', 'あり', 'なし'],
            ['完璧', '完璧', 'たまに壊れる'],
            ['最速', '中速', '最遅'],
            ['最高', '中', '最安'],
        ],
        col_labels=['Opus 4.6', 'Sonnet 4.6', 'GLM-5.1'],
        row_labels=['基礎問', '難問', '批判的思考', 'ハルシネーション',
                    'フォーマット', '速度', 'コスト'],
        title='3モデルの性格まとめ',
        filename='table_6.png',
        highlight_cells=[
            (0, 0), (0, 2), (1, 0), (2, 0), (3, 2), (6, 2)
        ],
    )

    # Cover image
    draw_cover()
    print("\nAll done!")
