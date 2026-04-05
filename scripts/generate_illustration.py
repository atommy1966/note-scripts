#!/usr/bin/env python3
"""Generic illustration generator using Gemini Vertex AI API.

Usage:
    # Basic generation
    python3 generate_illustration.py --prompt "白髪の少年冒険者" --output out.jpg

    # With reference image
    python3 generate_illustration.py --prompt "..." --output out.jpg --ref-image ref.png

    # Custom size (resized after generation)
    python3 generate_illustration.py --prompt "..." --output out.jpg --size 1280x670

Requires:
    - gcloud ADC: gcloud auth application-default login
    - Or: source config/vertex_api_key.env
    - pip install google-genai Pillow
"""

import argparse
import io
import os
import sys
from pathlib import Path

from google import genai
from PIL import Image

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "gen-lang-client-0119911773")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")
MODEL = "gemini-3.1-flash-image-preview"


def generate_illustration(
    prompt: str,
    output_path: Path,
    size: tuple[int, int] | None = None,
    ref_image: Path | None = None,
) -> Path:
    """Generate an illustration using Gemini API."""
    client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)

    contents = [prompt]

    if ref_image and ref_image.exists():
        contents.append(Image.open(ref_image))
        print(f"[ref] Reference image: {ref_image}")

    print(f"[gen] Generating with model={MODEL}...")
    print(f"[gen] Prompt: {prompt[:120]}...")

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
        )
    except Exception as e:
        raise RuntimeError(f"Gemini API error: {e}") from e

    for part in response.parts:
        if part.inline_data is not None:
            img = Image.open(io.BytesIO(part.inline_data.data))

            if size and img.size != size:
                print(f"[resize] {img.size} -> {size}")
                img = img.resize(size, Image.LANCZOS)

            output_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(output_path, quality=95)
            kb = output_path.stat().st_size // 1024
            print(f"[saved] {output_path} ({img.size}, {kb}KB)")
            return output_path

    for part in response.parts:
        if hasattr(part, "text") and part.text:
            raise RuntimeError(f"No image generated. Text response: {part.text[:200]}")

    raise RuntimeError("No image in response and no text response")


def parse_size(size_str: str) -> tuple[int, int]:
    """Parse size string like '1280x670' to (1280, 670)."""
    try:
        w, h = size_str.lower().split("x")
        return (int(w), int(h))
    except (ValueError, AttributeError):
        raise ValueError(f"Invalid size format: {size_str}. Use WxH (e.g., 1280x670)")


def main():
    parser = argparse.ArgumentParser(
        description="Generic illustration generator using Gemini Vertex AI API"
    )
    parser.add_argument("--prompt", required=True, help="Image generation prompt")
    parser.add_argument("--output", required=True, help="Output file path (jpg/png)")
    parser.add_argument("--size", default=None, help="Target size WxH (e.g., 1280x670)")
    parser.add_argument("--ref-image", default=None, help="Reference image path")
    args = parser.parse_args()

    output_path = Path(args.output)
    size = parse_size(args.size) if args.size else None
    ref_image = Path(args.ref_image) if args.ref_image else None

    try:
        result = generate_illustration(
            prompt=args.prompt,
            output_path=output_path,
            size=size,
            ref_image=ref_image,
        )
        print(str(result))
    except Exception as e:
        print(f"[error] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
