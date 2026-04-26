#!/usr/bin/env python3
"""Generate cover image for YouTube subtitle search article using Gemini."""

import os
import sys
import io
from pathlib import Path
from google import genai
from google.genai import types
from PIL import Image

MODEL_ID = "gemini-3.1-flash-image-preview"
OUTPUT_PATH = Path(__file__).parent / "youtube_search_cover.png"


client = genai.Client(vertexai=True, project="gen-lang-client-0119911773", location="global")

PROMPT = (
    "Generate a wide cover image (1280x670 pixels) with a dark navy/black gradient background. "
    "The theme is 'YouTube subtitle search'. "
    "In the center, show a large glowing magnifying glass hovering over scattered text lines (subtitles/captions). "
    "Inside the magnifying glass lens, show a highlighted line of Japanese text being found, "
    "while the surrounding text lines are dim. "
    "Add subtle tech elements: circuit-like patterns, binary numbers, or data visualization dots in the background. "
    "Use a color palette of deep blue (#0a0a2e), electric cyan (#00d4ff), and warm amber (#ff9f43) for accents. "
    "The overall mood should be modern, techy, and slightly mysterious. "
    "No text labels, no logos, no people. Abstract and clean."
)

print(f"[cover] Generating with {MODEL_ID}...")
response = client.models.generate_content(
    model=MODEL_ID,
    contents=PROMPT,
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"],
    ),
)

# Extract image from response
image_data = None
for part in response.candidates[0].content.parts:
    if part.inline_data is not None and part.inline_data.mime_type.startswith("image/"):
        image_data = part.inline_data.data
        break

if not image_data:
    print("ERROR: No image in response")
    sys.exit(1)

# Save and resize to exact 1280x670
img = Image.open(io.BytesIO(image_data))
print(f"[cover] Generated size: {img.size}")
img = img.resize((1280, 670), Image.LANCZOS)
img.save(OUTPUT_PATH, "PNG")
print(f"[cover] Saved: {OUTPUT_PATH} (1280x670)")
