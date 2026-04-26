#!/usr/bin/env python3
"""
gen_cover_1168_4.py — harness_engineering.md カバー画像
「AIの性能は、AIそのものでは決まらない」
"""
import os, sys
from pathlib import Path
from google import genai
from google.genai import types


client = genai.Client(vertexai=True, project="gen-lang-client-0119911773", location="global")
MODEL_ID = "gemini-3.1-flash-image-preview"
OUTPUT_PATH = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/harness_engineering_cover.png")

PROMPT = """
Create a clean, modern cover image for a Japanese tech blog post titled "AIの性能は、AIそのものでは決まらない" (AI performance is not determined by the AI itself — it's about harness engineering).

Design:
- Dark background (#111827 or very dark gray-blue)
- Center: Two identical AI brain icons side by side
  - Left brain: labeled "6.7%" in red/dim, looking weak/small, connected to a broken/simple harness
  - Right brain: labeled "68.3%" in bright green, looking powerful/glowing, connected to a sophisticated well-designed harness
- Between them: an arrow showing transformation, with "ハーネス改良" label
- The "harness" should look like engineering scaffolding, pipelines, or framework around each brain
- Japanese text prominently: "6.7% → 68.3%" in dramatic size contrast
- Sub-text: "AIそのものは変えてない" in white
- Accent colors: red (#ef4444) for weak, bright green (#22c55e) for strong
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: surprising, data-driven, engineering insight
"""

print(f"Gemini画像生成開始... model={MODEL_ID}")
try:
    response = client.models.generate_content(
        model=MODEL_ID, contents=PROMPT,
        config=types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"])
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            OUTPUT_PATH.write_bytes(part.inline_data.data)
            print(f"画像保存完了: {OUTPUT_PATH} ({len(part.inline_data.data)} bytes)")
            sys.exit(0)
        elif hasattr(part, 'text') and part.text:
            print(f"テキスト応答: {part.text[:200]}")
    print("ERROR: 画像パートが見つかりません"); sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}"); traceback.print_exc(); sys.exit(1)
