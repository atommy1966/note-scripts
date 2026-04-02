#!/usr/bin/env python3
"""Generate 3 radar charts comparing Opus 4.6, Sonnet 4.6, GLM-5.1"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager

# Japanese font setup
font_path = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
font_prop = font_manager.FontProperties(fname=font_path)
font_prop_bold = font_manager.FontProperties(fname=font_path, weight='bold')

plt.rcParams['font.family'] = font_prop.get_name()
plt.rcParams['axes.unicode_minus'] = False

# --- Speed normalization (log-based inverse) ---
def speed_score(t, t_min=0.5, t_max=50.0):
    """Log-scale inverse: fastest=5, slowest→~1"""
    return max(1.0, 5.0 * np.log10(t_max / t) / np.log10(t_max / t_min))

# --- Chart 1: Basic test radar ---
# Axes: 正確性, 品質, 日本語, 速度
# Data from sonnet_basic_test.md averages
basic_labels = ['正確性', '品質', '日本語', '速度']
basic_opus   = [4.8, 4.8, 4.8, speed_score(0.5)]
basic_sonnet = [4.6, 4.8, 5.0, speed_score(4.3)]
basic_glm    = [4.8, 4.6, 4.8, speed_score(16.0)]

# --- Chart 2: Hard test radar ---
# Axes: 正確性, 深さ, 実用性, 速度
# Data from glm51_vs_opus_hard.md + sonnet_vs_glm51_hard.md averages
hard_labels = ['正確性', '深さ', '実用性', '速度']
hard_opus   = [5.0, 4.8, 5.0, speed_score(0.5)]
hard_sonnet = [4.2, 3.8, 3.8, speed_score(15.4)]
hard_glm    = [3.8, 4.0, 3.6, speed_score(43.3)]

# --- Chart 3: Overall radar ---
# Axes: 基礎問, 難問, 速度, コスト, 指示遵守
overall_labels = ['基礎問', '難問', '速度', 'コスト', '指示遵守']
overall_opus   = [4.8, 5.0, speed_score(0.5),  1.5, 5.0]
overall_sonnet = [4.6, 4.2, speed_score(9.9),  3.5, 3.5]
overall_glm    = [4.8, 3.8, speed_score(29.7), 5.0, 3.0]

# --- Colors ---
COLORS = {
    'opus':   '#9b59b6',  # purple
    'sonnet': '#3498db',  # blue
    'glm':    '#2ecc71',  # green
}
BG_COLOR = '#1a1a2e'
AXES_BG = '#16213e'
GRID_COLOR = '#444466'
TEXT_COLOR = '#e0e0e0'

def make_radar(labels, opus_vals, sonnet_vals, glm_vals, title, filename):
    N = len(labels)
    angles = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
    # Close the polygon
    angles += angles[:1]
    opus_vals_c   = opus_vals + opus_vals[:1]
    sonnet_vals_c = sonnet_vals + sonnet_vals[:1]
    glm_vals_c    = glm_vals + glm_vals[:1]

    fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(AXES_BG)

    # Draw grid
    ax.set_ylim(0, 5.5)
    ax.set_yticks([1, 2, 3, 4, 5])
    ax.set_yticklabels(['1', '2', '3', '4', '5'], fontsize=9, color='#999999',
                       fontproperties=font_prop)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, fontsize=13, color=TEXT_COLOR, fontproperties=font_prop_bold)

    # Grid styling
    ax.spines['polar'].set_color(GRID_COLOR)
    ax.grid(color=GRID_COLOR, linewidth=0.5)

    # Plot each model
    for name, vals, color in [
        ('Opus 4.6',   opus_vals_c,   COLORS['opus']),
        ('Sonnet 4.6', sonnet_vals_c, COLORS['sonnet']),
        ('GLM-5.1',    glm_vals_c,    COLORS['glm']),
    ]:
        ax.plot(angles, vals, 'o-', linewidth=2, label=name, color=color, markersize=5)
        ax.fill(angles, vals, alpha=0.1, color=color)

    # Legend
    leg = ax.legend(loc='upper right', bbox_to_anchor=(1.25, 1.1), fontsize=11,
                    prop=font_prop, framealpha=0.9, facecolor='#1a1a2e', edgecolor='#444466')
    for text in leg.get_texts():
        text.set_color('#e0e0e0')

    # Title
    ax.set_title(title, fontsize=16, color=TEXT_COLOR, fontproperties=font_prop_bold,
                 pad=20)

    plt.tight_layout()
    plt.savefig(filename, dpi=150, bbox_inches='tight', facecolor=BG_COLOR)
    plt.close()
    print(f"Saved: {filename}")

# Generate all 3 charts
out_dir = '/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/glm51_tables'

make_radar(basic_labels, basic_opus, basic_sonnet, basic_glm,
           '基礎問レーダー（5問平均）', f'{out_dir}/radar_basic.png')

make_radar(hard_labels, hard_opus, hard_sonnet, hard_glm,
           '難問レーダー（5問平均）', f'{out_dir}/radar_hard.png')

make_radar(overall_labels, overall_opus, overall_sonnet, overall_glm,
           '総合レーダー（全10問統合）', f'{out_dir}/radar_overall.png')

print("All 3 radar charts generated.")
