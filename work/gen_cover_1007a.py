#!/usr/bin/env python3
"""
gen_cover_1007a.py
subtask_1007a: note記事カバー画像生成
「AIに漫画を描かせすぎて、Googleから2万7千円の請求が来た話」カバー画像

出力: /home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/gemini_22000yen_cover.png
サイズ: 1280x670px
"""

import os, sys
from pathlib import Path
from google import genai
from google.genai import types


client = genai.Client(vertexai=True, project="gen-lang-client-0119911773", location="global")
MODEL_ID = "gemini-3.1-flash-image-preview"

OUTPUT_PATH = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/gemini_22000yen_cover.png")

PROMPT = """
Create a striking cover image for a Japanese blog post about accidentally generating thousands of AI images and receiving a ¥27,000 bill from Google.

Design:
- Very dark background (#0a0a0a or dark navy)
- Large, bold red warning/alert icon in the center-top area (like a billing alert notification)
- A receipt or billing document visual element — showing big numbers
- Main Japanese text (large, bold, bright white): 「¥27,100」 (the bill amount, huge and prominent)
- Sub Japanese text in red/orange: 「AIに漫画を描かせすぎた」
- Small Japanese text below: 「Googleからの請求」
- Show manga-style comic panel fragments in the background (faded, dark) — suggesting the AI-generated comics that caused the bill
- Google colors (blue/red/yellow/green) subtly referenced in some element
- A "🤖" or robot icon near one corner suggesting AI generation
- Overall mood: shocking, cautionary, slightly humorous — like a financial disaster story
- Accent color: warning red (#FF4444) for the price/amount
- Clean, modern Japanese typography
- Aspect ratio: 1280x670 (landscape)

Text to include (Japanese):
- 「¥27,100」(very large, center, red or bright white)
- 「AIに漫画を描かせすぎた」(large, bold)
- 「Googleからの請求が来た話」(medium)
"""

print(f"Gemini画像生成開始... model={MODEL_ID}")

try:
    response = client.models.generate_content(
        model=MODEL_ID,
        contents=PROMPT,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        )
    )

    image_saved = False
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            img_bytes = part.inline_data.data
            OUTPUT_PATH.write_bytes(img_bytes)
            print(f"画像保存完了: {OUTPUT_PATH}")
            print(f"サイズ: {len(img_bytes)} bytes")
            image_saved = True
            break
        elif hasattr(part, 'text') and part.text:
            print(f"テキスト応答: {part.text[:200]}")

    if not image_saved:
        print("ERROR: 画像パートが見つかりません")
        print("Response:", response)
        sys.exit(1)

except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("完了")
