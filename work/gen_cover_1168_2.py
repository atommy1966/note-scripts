#!/usr/bin/env python3
"""
gen_cover_1168_2.py — embedding2_receipt.md カバー画像
「確定申告の領収書300枚、スマホで撮ったらAIが勝手に仕分けてくれた話」
"""
import os, sys
from pathlib import Path
from google import genai
from google.genai import types


client = genai.Client(vertexai=True, project="gen-lang-client-0119911773", location="global")
MODEL_ID = "gemini-3.1-flash-image-preview"
OUTPUT_PATH = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/embedding2_receipt_cover.png")

PROMPT = """
Create a clean, modern cover image for a Japanese tech blog post about AI automatically sorting 300 receipts for tax filing.

Design:
- Dark background (#0d1117 or very dark gray)
- Center: A smartphone camera scanning a pile of receipts, with AI sorting them into neat categorized stacks
- Receipts floating and being auto-sorted into labeled boxes: "交通費", "消耗品", "通信費", "交際費"
- A bright AI brain icon or sparkle effect between the phone and the sorted piles
- Japanese text prominently: "300枚の領収書" in large bold white
- Sub-text: "AIが勝手に仕分け" in bright green (#4ade80)
- Accent color: bright green (#4ade80) for AI effects
- Numbers: "300" should be very large and dramatic
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: impressive, time-saving, modern AI magic
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
