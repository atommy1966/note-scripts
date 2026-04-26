#!/usr/bin/env python3
"""
gen_cover_1168_1.py — dictionary_file_dead.md カバー画像
「設定ファイルを作ったのに誰も読んでいなかった話」
"""
import os, sys
from pathlib import Path
from google import genai
from google.genai import types


client = genai.Client(vertexai=True, project="gen-lang-client-0119911773", location="global")
MODEL_ID = "gemini-3.1-flash-image-preview"
OUTPUT_PATH = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/dictionary_file_dead_cover.png")

PROMPT = """
Create a clean, modern cover image for a Japanese tech blog post titled "設定ファイルを作ったのに誰も読んでいなかった話" (I made a config file but nobody read it).

Design:
- Dark background (#1a1a2e or similar dark blue-gray)
- Center: A thick config/settings file icon (like a YAML or JSON document) with dust/cobwebs on it, glowing faintly
- A magnifying glass scanning the document but finding "404" or empty results
- Small scattered "config.yaml" text fragments floating around
- Japanese text prominently: "誰も読んでない" (nobody's reading it) in bold white
- Sub-text: "設定ファイルの孤独" in smaller gray text
- Accent color: dim orange/amber (#f0a500) for the file icon glow
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: ironic, slightly humorous, developer frustration
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
