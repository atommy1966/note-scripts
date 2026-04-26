#!/usr/bin/env python3
"""Opus 4.7 記事用の図を3枚生成する。"""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager, rcParams

JP_FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
if Path(JP_FONT).exists():
    font_manager.fontManager.addfont(JP_FONT)
    rcParams["font.family"] = "Noto Sans CJK JP"
rcParams["axes.unicode_minus"] = False

OUT = Path(__file__).parent

# ── 図1: ベンチマーク棒グラフ（4.6 vs 4.7、差分で並び替え） ────────────
def fig_benchmark_bars() -> None:
    items = [
        ("MCP-Atlas", 62.7, 77.3),
        ("CharXiv-R", 77.4, 91.0),
        ("CursorBench", 58.0, 70.0),
        ("SWE-bench Pro", 53.4, 64.3),
        ("SWE-bench Verified", 80.8, 87.6),
        ("OSWorld-Verified", 72.7, 78.0),
        ("Terminal-Bench 2.0", 65.4, 69.4),
        ("Finance Agent", 60.7, 64.4),
        ("GPQA Diamond", 91.3, 94.2),
        ("HLE (tools)", 53.1, 54.7),
        ("CyberGym", 73.8, 73.1),
        ("BrowseComp", 83.7, 79.3),
    ]
    items.sort(key=lambda r: (r[2] - r[1]), reverse=True)
    labels = [r[0] for r in items]
    v46 = [r[1] for r in items]
    v47 = [r[2] for r in items]
    y = range(len(labels))

    fig, ax = plt.subplots(figsize=(10, 7))
    bar_h = 0.38
    ax.barh([i + bar_h/2 for i in y], v46, height=bar_h, color="#9ca3af", label="Opus 4.6")
    ax.barh([i - bar_h/2 for i in y], v47, height=bar_h, color="#2563eb", label="Opus 4.7")
    ax.set_yticks(list(y))
    ax.set_yticklabels(labels)
    ax.invert_yaxis()
    ax.set_xlabel("スコア (%)")
    ax.set_title("Opus 4.6 vs 4.7 公式ベンチ（改善幅で降順）")
    ax.grid(axis="x", alpha=0.3)

    ax.set_xlim(0, 110)
    for i, (_, a, b) in enumerate(items):
        diff = b - a
        color = "#16a34a" if diff > 0 else "#dc2626"
        sign = "+" if diff > 0 else ""
        ax.annotate(f"{sign}{diff:.1f}pt",
                    xy=(max(a, b) + 1, i), va="center",
                    fontsize=9, color=color, fontweight="bold")
    ax.legend(loc="lower right", framealpha=1.0).set_zorder(10)

    fig.tight_layout()
    fig.savefig(OUT / "benchmark_bars.png", dpi=150)
    plt.close(fig)
    print("✅ benchmark_bars.png")


# ── 図2: 品質×速度 散布図（5構成） ─────────────────────────────────
def fig_quality_vs_speed() -> None:
    # (label, seconds Q1->Q5, score, color)
    data = [
        ("Opus 4.7 [1m]",      470, 4.93, "#2563eb"),
        ("Opus 4.6 [1m]",      266, 4.67, "#60a5fa"),
        ("GLM+Advisor 4.7",    289, 4.40, "#f59e0b"),
        ("GLM+Advisor 4.6",    342, 4.33, "#fbbf24"),
        ("Sonnet 4.6",         154, 4.27, "#10b981"),
    ]

    fig, ax = plt.subplots(figsize=(9, 6.5))
    for label, t, s, c in data:
        ax.scatter(t, s, s=280, color=c, edgecolors="black", linewidths=1.2, zorder=3)
        # annotate 配置調整
        offset = {
            "Opus 4.7 [1m]":   (-10, 0.03),
            "Opus 4.6 [1m]":   (10, 0.02),
            "GLM+Advisor 4.7": (-115, 0.00),
            "GLM+Advisor 4.6": (12, -0.02),
            "Sonnet 4.6":      (10, 0.02),
        }[label]
        ax.annotate(f"{label}\n{t}s / {s:.2f}",
                    xy=(t, s),
                    xytext=(t + offset[0], s + offset[1]),
                    fontsize=10)

    ax.set_xlabel("Q1→Q5 経過時間（秒、短いほど速い）")
    ax.set_ylabel("ルーブリック平均スコア（1〜5）")
    ax.set_title("品質 ↔ 速度 トレードオフ（原初5問・同一ルーブリック）")
    ax.set_xlim(100, 550)
    ax.set_ylim(4.15, 5.05)
    ax.grid(alpha=0.3)

    # 右上＝理想、左下＝最悪 の矢印ガイド
    ax.annotate("", xy=(160, 5.0), xytext=(500, 4.2),
                arrowprops=dict(arrowstyle="->", color="#6b7280", lw=1.5, alpha=0.5))
    ax.text(180, 4.95, "理想\n(速い・高品質)", fontsize=9, color="#6b7280")
    ax.text(470, 4.22, "回避\n(遅い・低品質)", fontsize=9, color="#6b7280", ha="right")

    fig.tight_layout()
    fig.savefig(OUT / "quality_vs_speed.png", dpi=150)
    plt.close(fig)
    print("✅ quality_vs_speed.png")


# ── 図3: 移行判断 4象限 ──────────────────────────────────────────
def fig_migration_matrix() -> None:
    fig, ax = plt.subplots(figsize=(10, 7))

    # 象限の枠
    ax.axhline(0, color="black", lw=1)
    ax.axvline(0, color="black", lw=1)
    ax.set_xlim(-1, 1)
    ax.set_ylim(-1, 1)
    ax.set_xticks([])
    ax.set_yticks([])

    # ラベル
    ax.text(0, 1.12, "コーディング / エージェント比重 高", ha="center", fontsize=11, fontweight="bold")
    ax.text(0, -1.15, "コーディング / エージェント比重 低", ha="center", fontsize=11, fontweight="bold")
    ax.text(-1.05, 0, "プロンプト\n投資 少", ha="right", va="center", fontsize=11, fontweight="bold")
    ax.text(1.05, 0, "プロンプト\n投資 多", ha="left", va="center", fontsize=11, fontweight="bold")

    # 象限の背景色
    ax.fill_between([-1, 0], 0, 1, color="#dcfce7", alpha=0.6)   # 左上
    ax.fill_between([0, 1], 0, 1, color="#fef3c7", alpha=0.6)    # 右上
    ax.fill_between([-1, 0], -1, 0, color="#e0f2fe", alpha=0.6)  # 左下
    ax.fill_between([0, 1], -1, 0, color="#fee2e2", alpha=0.6)   # 右下

    # 各象限の推奨
    ax.text(-0.5, 0.75, "【積極的に移行】", ha="center", fontsize=13, fontweight="bold", color="#14532d")
    ax.text(-0.5, 0.60, "• 本番コーディングエージェント\n• Vision/Computer Use 重視",
            ha="center", fontsize=9.5)

    ax.text(0.5, 0.75, "【段階的移行】", ha="center", fontsize=13, fontweight="bold", color="#713f12")
    ax.text(0.5, 0.60, "• プロンプトライブラリ投資済\n• 安定運用重視の本番",
            ha="center", fontsize=9.5)

    ax.text(-0.5, -0.25, "【要検証】", ha="center", fontsize=13, fontweight="bold", color="#0c4a6e")
    ax.text(-0.5, -0.40, "• Web リサーチ系（BrowseComp −4.4pt）\n• 多言語 Q&A",
            ha="center", fontsize=9.5)

    ax.text(0.5, -0.25, "【現状維持】", ha="center", fontsize=13, fontweight="bold", color="#7f1d1d")
    ax.text(0.5, -0.40, "• Sonnet で足りているコスト制約系\n• トークナイザー +40% を吸収不可",
            ha="center", fontsize=9.5)

    ax.set_title("Opus 4.7 移行判断マトリクス", fontsize=14, pad=40)
    for s in ax.spines.values():
        s.set_visible(False)

    fig.tight_layout()
    fig.savefig(OUT / "migration_matrix.png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    print("✅ migration_matrix.png")


if __name__ == "__main__":
    fig_benchmark_bars()
    fig_quality_vs_speed()
    fig_migration_matrix()
    print(f"\n出力先: {OUT}")
