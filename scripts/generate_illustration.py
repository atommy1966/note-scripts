#!/usr/bin/env python3
"""Generic illustration generator using Gemini Vertex AI API.

Usage:
    # Basic generation
    python3 generate_illustration.py --prompt "白髪の少年冒険者" --output out.jpg

    # With reference image(s) — supports multiple, REPO_ROOT relative paths, GCS URI
    python3 generate_illustration.py --prompt "..." --output out.jpg \
        --ref-image ref.png \
        --ref-image projects/note_mcp_server/assets/naginata_tachie.png

    # Custom size (resized after generation)
    python3 generate_illustration.py --prompt "..." --output out.jpg --size 1200x670

    # Retry on 429/timeout (default: 3 attempts)
    python3 generate_illustration.py --prompt "..." --output out.jpg --retries 5

Requires:
    - gcloud ADC: gcloud auth application-default login
    - pip install google-genai Pillow
"""

import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types
from PIL import Image

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "gen-lang-client-0119911773")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")
MODEL = "gemini-3.1-flash-image-preview"
REPO_ROOT = Path("/home/murakami/multi-agent-shogun")

GCS_BUCKET = "shogun-manga-refs"
GCS_KNOWN_PREFIXES = {
    "character/selected/": "character/",
    "komawari_templates/": "komawari/",
    "minecraft_wiki/mobs/": "mobs/",
}


def _gcs_cache_path():
    return Path(__file__).parent / "gcs_uri_cache.json"


def _load_gcs_cache():
    p = _gcs_cache_path()
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            pass
    return {}


def _save_gcs_cache(cache):
    _gcs_cache_path().write_text(json.dumps(cache, indent=2, ensure_ascii=False))


def resolve_ref_path(raw: str) -> Path | None:
    """Resolve a ref image path. Tries: absolute, REPO_ROOT relative, cwd relative."""
    p = Path(raw)
    if p.is_absolute():
        return p if p.exists() else None
    candidates = [
        REPO_ROOT / p,
        Path.cwd() / p,
    ]
    for c in candidates:
        if c.exists():
            return c.resolve()
    return None


def upload_to_gcs(image_paths: list[Path]) -> dict:
    """Upload ref images to GCS, return {resolved_path_str: (gs_uri, mime)}."""
    cache = _load_gcs_cache()
    result = {}

    for rp in image_paths:
        rp_str = str(rp.resolve())
        suffix = rp.suffix.lower()
        mime = "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/png"

        # Known path mapping
        matched = False
        for local_pattern, gcs_prefix in GCS_KNOWN_PREFIXES.items():
            if local_pattern in rp_str:
                gcs_uri = f"gs://{GCS_BUCKET}/{gcs_prefix}{rp.name}"
                result[rp_str] = (gcs_uri, mime)
                print(f"  [GCS] 既知パス: {rp.name} → {gcs_uri}")
                matched = True
                break
        if matched:
            continue

        # Cache check
        if rp_str in cache:
            result[rp_str] = (cache[rp_str], mime)
            print(f"  [GCS] キャッシュ: {rp.name} → {cache[rp_str]}")
            continue

        # Auto upload
        scene_hash = hashlib.md5(rp.parent.name.encode()).hexdigest()[:8]
        gcs_path = f"illustrations/{scene_hash}/{rp.name}"
        gcs_uri = f"gs://{GCS_BUCKET}/{gcs_path}"

        try:
            proc = subprocess.run(
                ["gcloud", "storage", "cp", str(rp), gcs_uri],
                capture_output=True, text=True, timeout=30,
            )
            if proc.returncode == 0:
                result[rp_str] = (gcs_uri, mime)
                cache[rp_str] = gcs_uri
                print(f"  [GCS] アップロード: {rp.name} → {gcs_uri}")
            else:
                print(f"  [GCS] WARNING: アップロード失敗: {proc.stderr[:100]}")
        except Exception as e:
            print(f"  [GCS] WARNING: {rp.name} エラー: {e}")

    if cache:
        _save_gcs_cache(cache)
    return result


def generate_illustration(
    prompt: str,
    output_path: Path,
    size: tuple[int, int] | None = None,
    ref_images: list[Path] | None = None,
    retries: int = 3,
) -> dict:
    """Generate an illustration. Returns result dict with metadata."""
    client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)

    # Build content parts
    parts = []

    # Ref images → GCS URI
    if ref_images:
        gcs_uris = upload_to_gcs(ref_images)
        for rp in ref_images:
            rp_str = str(rp.resolve())
            suffix = rp.suffix.lower()
            mime = "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/png"
            if rp_str in gcs_uris:
                uri, uri_mime = gcs_uris[rp_str]
                parts.append(types.Part.from_uri(file_uri=uri, mime_type=uri_mime))
            else:
                raise RuntimeError(
                    f"GCSアップロード失敗。Part.from_bytesフォールバックは禁止。ファイル: {rp}"
                )
        print(f"  [ref] {len(parts)}枚のリファレンス画像")

    parts.append(prompt)

    print(f"[gen] model={MODEL}")
    print(f"[gen] prompt: {prompt[:150]}...")

    # Retry with exponential backoff
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            t0 = time.time()
            response = client.models.generate_content(
                model=MODEL,
                contents=parts,
            )
            elapsed = time.time() - t0

            # Extract usage
            usage = {}
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                um = response.usage_metadata
                usage = {
                    "prompt_tokens": getattr(um, "prompt_token_count", 0),
                    "total_tokens": getattr(um, "total_token_count", 0),
                }

            for part in response.parts:
                if part.inline_data is not None:
                    img = Image.open(io.BytesIO(part.inline_data.data))
                    original_size = img.size

                    if size and img.size != size:
                        print(f"[resize] {img.size} → {size}")
                        img = img.resize(size, Image.LANCZOS)

                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    img.save(output_path, quality=95)
                    kb = output_path.stat().st_size // 1024
                    print(f"[saved] {output_path} ({img.size}, {kb}KB)")

                    return {
                        "status": "success",
                        "output_path": str(output_path),
                        "original_size": f"{original_size[0]}x{original_size[1]}",
                        "final_size": f"{img.size[0]}x{img.size[1]}",
                        "elapsed_sec": round(elapsed, 1),
                        "attempt": attempt,
                        "usage": usage,
                    }

            # Text response = no image generated
            text = ""
            for part in response.parts:
                if hasattr(part, "text") and part.text:
                    text = part.text[:200]
            last_error = f"No image in response. Text: {text}"
            print(f"[retry] attempt {attempt}/{retries}: {last_error}")

        except Exception as e:
            last_error = str(e)
            print(f"[retry] attempt {attempt}/{retries}: {last_error}")

        if attempt < retries:
            wait = 120 * (2 ** (attempt - 1))  # 120s, 240s, ...
            print(f"[wait] {wait}s before retry...")
            time.sleep(wait)

    return {"status": "failed", "error": last_error, "attempts": retries}


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
    parser.add_argument("--size", default=None, help="Target size WxH (e.g., 1200x670)")
    parser.add_argument(
        "--ref-image", action="append", default=[], dest="ref_images",
        help="Reference image path(s). Supports absolute, REPO_ROOT relative. Repeatable.",
    )
    parser.add_argument("--retries", type=int, default=3, help="Max retry attempts (default: 3)")
    args = parser.parse_args()

    output_path = Path(args.output)
    size = parse_size(args.size) if args.size else None

    # Resolve ref image paths
    resolved_refs = []
    for raw in args.ref_images:
        rp = resolve_ref_path(raw)
        if rp:
            resolved_refs.append(rp)
        else:
            print(f"[ref] WARNING: 見つからない: {raw}", file=sys.stderr)

    result = generate_illustration(
        prompt=args.prompt,
        output_path=output_path,
        size=size,
        ref_images=resolved_refs if resolved_refs else None,
        retries=args.retries,
    )

    # Save result log
    log_path = output_path.with_suffix(".json")
    log_path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"[log] {log_path}")

    if result["status"] != "success":
        print(f"[error] {result.get('error', 'unknown')}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
