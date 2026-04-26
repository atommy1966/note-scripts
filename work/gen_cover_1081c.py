#!/usr/bin/env python3
"""
gen_cover_1081c.py
subtask_1081c: note記事カバー画像生成
YouTube subtitle scene search article cover (NO Japanese text)

Output: /home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/youtube_comment_scene_search_cover.png
Size: 1280x670px
"""

import os, sys, io
from pathlib import Path
from google import genai
from google.genai import types
from PIL import Image

import google.auth
import google.auth.transport.requests

# Use Application Default Credentials (gcloud auth application-default login)
credentials, project = google.auth.default()
request = google.auth.transport.requests.Request()
credentials.refresh(request)

client = genai.Client(
    vertexai=True,
    credentials=credentials,
    project=project,
    location='us-central1',
)
MODEL_ID = "gemini-3.1-flash-image-preview"

OUTPUT_PATH = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/youtube_comment_scene_search_cover.png")

PROMPT = """
Create a striking cover image for a tech blog post about searching for specific scenes in YouTube videos using AI semantic search.

Design:
- Very dark background (#0a0a1a, deep dark navy-black)
- Main visual: A large, glowing magnifying glass centered or slightly off-center
- Inside the magnifying glass lens: show multiple lines of subtitle text (small, like closed-captions/subtitles), with ONE highlighted line glowing brightly in cyan/electric blue — the "found" scene
- The magnifying glass handle points toward bottom-right
- The lens has a soft cyan glow/halo effect suggesting digital search
- Background: show a mosaic or grid of faint YouTube-like video thumbnails (very dark, barely visible) — suggesting 10,000+ videos
- Add subtle data visualization elements: small dots, connecting lines, or wave patterns suggesting embedding vectors
- Color palette:
  - Background: #0a0a1a (almost black)
  - Magnifying glass: metallic silver or dark steel
  - Highlighted text line in lens: bright cyan #00e5ff
  - Accent glow: electric blue #0066ff
  - Faint video grid: #1a1a2e
- Mood: technological, precise, like finding a needle in a haystack
- NO text of any kind — no labels, no words, no numbers, no Japanese characters
- Clean, professional, modern aesthetic
- Aspect ratio: 1280x670 (landscape / horizontal)
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
            # Resize to exact 1280x670
            img = Image.open(io.BytesIO(img_bytes))
            print(f"生成サイズ: {img.size}")
            img = img.resize((1280, 670), Image.LANCZOS)
            img.save(OUTPUT_PATH, "PNG")
            print(f"画像保存完了: {OUTPUT_PATH}")
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
