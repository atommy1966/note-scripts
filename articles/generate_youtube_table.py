#!/usr/bin/env python3
"""Generate table image for YouTube subtitle search article."""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from PIL import Image

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

font_header = fm.FontProperties(fname=font_path, size=14)
font_cell = fm.FontProperties(fname=font_path, size=13)
font_title = fm.FontProperties(fname=font_path, size=16)

OUT = '/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles'

# Table data
col_labels = ['コンポーネント', '技術']
data = [
    ['対象', '10,000本以上（うち字幕インデックス済み822本）、45,000チャンク'],
    ['ベクトル化', 'Gemini Embedding 2（3072次元）'],
    ['検索基盤', 'BigQuery Vector Search'],
    ['コスト', '月$0.03（ほぼ無料）'],
    ['キーワード検索', 'grep（全字幕JSONファイル）'],
]

HEADER_BG = '#1a1a2e'
CELL_BG = '#16213e'
ACCENT = '#00d4ff'
TEXT_WHITE = '#e0e0e0'
TEXT_CYAN = '#00d4ff'

fig, ax = plt.subplots(figsize=(10, 3.5))
fig.patch.set_facecolor('#0f3460')
ax.set_facecolor('#0f3460')
ax.axis('off')

# Title
ax.text(0.5, 0.95, '技術構成', transform=ax.transAxes,
        fontproperties=font_title, color=ACCENT,
        ha='center', va='top', fontweight='bold')

table = ax.table(
    cellText=[[r[1]] for r in data],
    rowLabels=[r[0] for r in data],
    colLabels=['技術'],
    loc='center',
    cellLoc='center',
)
table.auto_set_font_size(False)

for (row, col), cell in table.get_celld().items():
    cell.set_edgecolor('#333366')
    cell.set_linewidth(1.0)
    if row == 0:  # header
        cell.set_text_props(fontproperties=font_header, color='white', fontweight='bold')
        cell.set_facecolor(HEADER_BG)
        cell.set_height(0.10)
    elif col == -1:  # row labels
        cell.set_text_props(fontproperties=font_header, color=TEXT_CYAN, fontweight='bold')
        cell.set_facecolor('#0a1628')
        cell.set_height(0.13)
    else:
        cell.set_text_props(fontproperties=font_cell, color=TEXT_WHITE)
        cell.set_facecolor(CELL_BG)
        cell.set_height(0.13)

# Column widths
for (row, col), cell in table.get_celld().items():
    if col == -1:
        cell.set_width(0.25)
    else:
        cell.set_width(0.65)

import os
filepath = os.path.join(OUT, 'youtube_search_table.png')
fig.savefig(filepath, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor(), pad_inches=0.3)
plt.close(fig)

# Verify
img = Image.open(filepath)
print(f"Saved: {filepath} ({img.size[0]}x{img.size[1]})")
