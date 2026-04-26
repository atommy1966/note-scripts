#!/usr/bin/env python3
"""
gen_table_1081c.py
subtask_1081c: 記事内テーブルを白背景画像化
YouTube subtitle search article - system configuration table

Output: /home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/youtube_search_table.png
"""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from PIL import Image
import os

# Font setup - find Japanese font
font_path = None
for fp in fm.findSystemFonts():
    if 'NotoSansCJK' in fp and ('Bold' in fp or 'bold' in fp):
        font_path = fp
        break
if not font_path:
    for fp in fm.findSystemFonts():
        if 'NotoSansCJK' in fp:
            font_path = fp
            break

if font_path:
    font_header = fm.FontProperties(fname=font_path, size=13)
    font_cell = fm.FontProperties(fname=font_path, size=12)
    font_title = fm.FontProperties(fname=font_path, size=15)
else:
    print("WARNING: NotoSansCJK not found, using default font")
    font_header = fm.FontProperties(size=13)
    font_cell = fm.FontProperties(size=12)
    font_title = fm.FontProperties(size=15)

OUT = '/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles'

# Table data
data = [
    ['対象', '約560本の動画、45,000チャンク'],
    ['AI', 'Gemini Embedding 2（3072次元）'],
    ['検索基盤', 'BigQuery Vector Search（クラウド）'],
    ['月額コスト', '$0.03（約5円）'],
    ['検索速度', '1回約6秒'],
    ['ローカルのメモリ消費', 'ゼロ'],
]

# White background design
HEADER_BG = '#e8f4f8'
CELL_BG = '#ffffff'
BORDER_COLOR = '#cccccc'
HEADER_TEXT = '#333333'
CELL_TEXT = '#555555'
LABEL_TEXT = '#1a6b9a'  # blue for row labels
TITLE_BG = '#f0f7fc'

fig, ax = plt.subplots(figsize=(10, 3.2))
fig.patch.set_facecolor('white')
ax.set_facecolor('white')
ax.axis('off')

# Title
ax.text(0.5, 0.97, '技術構成', transform=ax.transAxes,
        fontproperties=font_title, color='#1a6b9a',
        ha='center', va='top', fontweight='bold')

table = ax.table(
    cellText=[[row[1]] for row in data],
    rowLabels=[row[0] for row in data],
    colLabels=['技術・仕様'],
    loc='center',
    cellLoc='left',
)
table.auto_set_font_size(False)

for (row, col), cell in table.get_celld().items():
    cell.set_edgecolor(BORDER_COLOR)
    cell.set_linewidth(0.8)
    if row == 0:  # header
        cell.set_text_props(fontproperties=font_header, color=HEADER_TEXT, fontweight='bold')
        cell.set_facecolor(HEADER_BG)
        cell.set_height(0.12)
    elif col == -1:  # row labels
        cell.set_text_props(fontproperties=font_header, color=LABEL_TEXT, fontweight='bold')
        cell.set_facecolor(HEADER_BG)
        cell.set_height(0.12)
    else:
        cell.set_text_props(fontproperties=font_cell, color=CELL_TEXT)
        cell.set_facecolor(CELL_BG)
        cell.set_height(0.12)

# Column widths
for (row, col), cell in table.get_celld().items():
    if col == -1:
        cell.set_width(0.28)
    else:
        cell.set_width(0.65)

filepath = os.path.join(OUT, 'youtube_search_table.png')
fig.savefig(filepath, dpi=150, bbox_inches='tight', facecolor='white', pad_inches=0.3)
plt.close(fig)

# Verify
img = Image.open(filepath)
print(f"Saved: {filepath} ({img.size[0]}x{img.size[1]})")
print("完了")
