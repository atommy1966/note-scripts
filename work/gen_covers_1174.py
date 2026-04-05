#!/usr/bin/env python3
"""gen_covers_1174.py — 6記事のカバー画像一括生成 (Vertex API)"""
import os, sys, traceback
from pathlib import Path
from google import genai
from google.genai import types

API_KEY = os.environ.get("VERTEX_API_KEY")
if not API_KEY:
    print("ERROR: VERTEX_API_KEY not set"); sys.exit(1)

client = genai.Client(api_key=API_KEY)
MODEL_ID = "gemini-3.1-flash-image-preview"
OUTDIR = Path("/home/murakami/multi-agent-shogun/projects/note_mcp_server/work/covers")
OUTDIR.mkdir(parents=True, exist_ok=True)

ARTICLES = [
    {
        "file": "silent_bug.png",
        "title": "動くのに壊れている — AIが書いたコードの見えないバグ",
        "prompt": """Create a clean, modern cover image for a Japanese tech blog post about invisible bugs in AI-generated code — code that works but is secretly broken.

Design:
- Dark background (#1a1a2e or similar dark blue-gray)
- Center: A code editor window showing green "ALL TESTS PASS" checkmarks, but with red cracks forming underneath, revealing hidden bugs
- Small bug icons (ladybug/insect) hiding behind the passing test indicators
- A magnifying glass revealing the hidden issues
- Japanese text: "動くのに壊れている" in bold white
- Sub-text: "AIが書いたコードの見えないバグ" in smaller gray text
- Accent color: red (#e74c3c) for the cracks/bugs, green (#2ecc71) for passing tests
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: ironic tension, hidden danger, developer unease"""
    },
    {
        "file": "harness_engineering.png",
        "title": "AIにルール読めって書いても読まない。だから仕組みで殴る",
        "prompt": """Create a clean, modern cover image for a Japanese tech blog post about using engineering mechanisms instead of prompts to control AI behavior.

Design:
- Dark background (#1a1a2e or similar dark blue-gray)
- Center: A heavy mechanical gear/cog system that physically constrains and channels an AI robot arm into the correct path
- The robot arm tries to deviate but the mechanical rails and gears force it back on track
- Scattered crumpled "prompt instruction" papers on the ground, ignored
- Japanese text: "仕組みで殴る" in bold white
- Sub-text: "プロンプトではなく設計で解決" in smaller gray text
- Accent color: metallic steel blue (#5d7b93) and orange (#f39c12) for the gear highlights
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: pragmatic engineering, tough love, industrial precision"""
    },
    {
        "file": "skill_placement.png",
        "title": "Claude Codeのスキルが発動しない？置き場所1つで全部変わった",
        "prompt": """Create a clean, modern cover image for a Japanese tech blog post about Claude Code skill placement — how file location determines whether AI skills activate or not.

Design:
- Dark background (#1a1a2e or similar dark blue-gray)
- Center: A file directory tree with two locations — one with a glowing green "ACTIVE" folder, another with a dim red "INACTIVE" folder
- Light beam connecting the correct folder to a activated plugin/skill icon
- The wrong folder has cobwebs, the right folder sparks with energy
- Japanese text: "置き場所で全部変わった" in bold white
- Sub-text: "スキルが発動しない？場所を確認" in smaller gray text
- Accent color: electric blue (#3498db) for active, dim red (#95a5a6) for inactive
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: discovery moment, "aha!" feeling, developer insight"""
    },
    {
        "file": "ai_cant_find_code.png",
        "title": "AIエージェントが自分のコードベースを探索できない話",
        "prompt": """Create a clean, modern cover image for a Japanese tech blog post about AI agents unable to explore their own codebase effectively.

Design:
- Dark background (#1a1a2e or similar dark blue-gray)
- Center: An AI robot with a magnifying glass, standing in front of a massive wall of filing cabinets/code files, looking confused and overwhelmed
- The robot's magnifying glass shows "No results found" on the other side
- Code file icons scattered chaotically, some glowing but unreachable
- A maze/labyrinth pattern overlay on the codebase
- Japanese text: "自分のコードが見つからない" in bold white
- Sub-text: "AIエージェントの探索問題" in smaller gray text
- Accent color: amber (#f0a500) for the magnifying glass glow, purple (#9b59b6) for maze patterns
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: frustration, searching, overwhelming complexity"""
    },
    {
        "file": "cdp_manga_prompt.png",
        "title": "Geminiに漫画を描かせるプロンプト設計 — 試行錯誤20回の記録",
        "prompt": """Create a clean, modern cover image for a Japanese tech blog post about prompt engineering for AI manga generation with Gemini — 20 iterations of trial and error.

Design:
- Dark background (#1a1a2e or similar dark blue-gray)
- Center: A progression from rough sketch (left) to polished manga panel (right), showing 20 iteration steps as a timeline
- Manga speech bubbles with "NG" marks on early versions, "OK" on the final one
- A prompt text box at the top feeding into the generation pipeline
- Japanese text: "試行錯誤20回" in bold white
- Sub-text: "Gemini漫画生成プロンプト設計" in smaller gray text
- Accent color: manga-style black and white with red (#e74c3c) for NG stamps, green (#27ae60) for OK
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: iterative improvement, creative process, persistence"""
    },
    {
        "file": "telephone_game.png",
        "title": "マルチエージェントの「伝言ゲーム問題」と対策",
        "prompt": """Create a clean, modern cover image for a Japanese tech blog post about the telephone game problem in multi-agent AI systems — message distortion through agent chains.

Design:
- Dark background (#1a1a2e or similar dark blue-gray)
- Center: A chain of 4-5 robot/AI agent icons passing a message bubble to each other, with the message bubble getting progressively more distorted and garbled
- First agent's message is clean "Deploy to prod", last agent receives "Destroy the database" — comedic exaggeration
- Broken telephone / whisper game visual metaphor
- Japanese text: "伝言ゲーム問題" in bold white
- Sub-text: "マルチエージェントの情報劣化" in smaller gray text
- Accent color: gradient from clean blue (#3498db) to distorted red (#e74c3c) across the chain
- Aspect ratio: 1280x670 (landscape)
- Clean sans-serif Japanese-compatible typography
- Mood: humorous warning, cascading failure, communication breakdown"""
    },
]

for i, art in enumerate(ARTICLES):
    outpath = OUTDIR / art["file"]
    if outpath.exists():
        print(f"[{i+1}/6] SKIP (exists): {outpath}")
        continue
    print(f"[{i+1}/6] Generating: {art['title']} → {outpath}")
    try:
        response = client.models.generate_content(
            model=MODEL_ID, contents=art["prompt"],
            config=types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"])
        )
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                outpath.write_bytes(part.inline_data.data)
                print(f"  Saved: {outpath} ({len(part.inline_data.data)} bytes)")
                break
            elif hasattr(part, 'text') and part.text:
                print(f"  Text response: {part.text[:200]}")
        else:
            print(f"  ERROR: No image part found")
    except Exception as e:
        print(f"  ERROR: {e}")
        traceback.print_exc()
        continue

print("\n=== Done ===")
for art in ARTICLES:
    p = OUTDIR / art["file"]
    print(f"  {art['file']}: {'EXISTS' if p.exists() else 'MISSING'} ({p.stat().st_size if p.exists() else 0} bytes)")
