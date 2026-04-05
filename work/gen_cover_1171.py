#!/usr/bin/env python3
"""
gen_cover_1171.py — silent_bug_contradiction_detection.md カバー画像
「動くのに壊れている — AIが書いたコードの見えないバグ」
"""
import os, sys, traceback
from pathlib import Path
from google import genai
from google.genai import types

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("ERROR: GEMINI_API_KEY not set"); sys.exit(1)

client = genai.Client(api_key=API_KEY)
MODEL_ID = "gemini-3.1-flash-image-preview"
OUTPUT_PATH = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/articles/silent_bug_contradiction_detection_cover.png")

PROMPT = """
Create a clean, modern cover image for a Japanese tech blog post titled "動くのに壊れている — AIが書いたコードの見えないバグ" (Works but broken — Invisible bugs in AI-written code).

Design:
- Dark background (#0d1117 or similar deep dark)
- Center: A code editor window showing green "PASS" checkmarks on the surface, but underneath/cracked open revealing red error symbols (×), contradiction arrows (↔), and fractured code lines
- The code appears to "work" on top but is visually cracking apart underneath
- A magnifying glass revealing the hidden contradictions in the code
- Small scattered text fragments: "テスト通過", "実行OK", "矛盾" floating around
- Japanese text prominently: "見えないバグ" (invisible bug) in bold white with a subtle crack effect
- Sub-text: "動くのに壊れている" in smaller gray text
- Accent color: red (#ff4444) for the error symbols, green (#4caf50) for the passing tests
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: tension between apparent correctness and hidden flaws, developer vigilance
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
