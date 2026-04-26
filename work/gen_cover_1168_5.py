#!/usr/bin/env python3
"""
gen_cover_1168_5.py — youtube_comment_scene_search.md カバー画像
「YouTubeコメント欄で視聴者からシーン検索リクエストが来た話」
"""
import os, sys
from pathlib import Path
from google import genai
from google.genai import types


client = genai.Client(vertexai=True, project="gen-lang-client-0119911773", location="global")
MODEL_ID = "gemini-3.1-flash-image-preview"
OUTPUT_PATH = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/youtube_comment_scene_search_cover.png")

PROMPT = """
Create a clean, modern cover image for a Japanese tech blog post about receiving YouTube comment requests to search for specific video scenes, and using AI (Embedding) to find them.

Design:
- Dark background (#0f0f0f YouTube dark mode)
- Center: A YouTube-style comment section with a viewer's comment asking about a specific scene
- Below the comment: an AI search interface finding the exact timestamp in the video
- A video thumbnail with a highlighted/scrubbed timestamp marker
- Search results showing: "27:15 〇〇のシーン" found instantly
- Japanese text prominently: "視聴者からのリクエスト" in white
- Sub-text: "AIで即座にシーン検索" in YouTube red (#FF0000)
- Accent color: YouTube red (#FF0000)
- A magnifying glass or search icon with AI sparkle
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: exciting, community-driven, AI-powered content creation
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
