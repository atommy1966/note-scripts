#!/usr/bin/env python3
"""
gen_cover_1168_3.py — embedding2_techbook.md カバー画像
「技術書PDF 50冊をAIに食わせたら、図表もコード例も全部横断検索できるようになった」
"""
import os, sys
from pathlib import Path
from google import genai
from google.genai import types


client = genai.Client(vertexai=True, project="gen-lang-client-0119911773", location="global")
MODEL_ID = "gemini-3.1-flash-image-preview"
OUTPUT_PATH = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/embedding2_techbook_cover.png")

PROMPT = """
Create a clean, modern cover image for a Japanese tech blog post about feeding 50 tech PDF books to AI and enabling cross-search across all content.

Design:
- Dark background (#0f172a or dark navy)
- Center: A glowing AI brain absorbing multiple PDF book icons/thumbnails
- PDF books flying into the brain from left side (5-6 book spines visible)
- From the right side: search results emerging with highlighted code snippets, diagrams, and charts
- A search bar at the top with glowing cursor, showing cross-search across all books
- Japanese text prominently: "50冊の技術書" in large bold white
- Sub-text: "図表もコードも横断検索" in cyan (#22d3ee)
- Accent color: cyan (#22d3ee) for the AI/search glow effects
- Numbers: "50" should be prominent
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: powerful, knowledge-unleashed, developer productivity
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
