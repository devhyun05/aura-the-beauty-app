"""Build and validate mobile-ready WebP situation-card assets."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = (
    ROOT
    / "apps"
    / "mobile"
    / "src"
    / "assets"
    / "images"
    / "makeup-recommendation"
    / "situations"
)
ASSETS = (
    "daily",
    "formal-event",
    "camera-content",
    "festival-performance",
)
MAX_BYTES = 150 * 1024


def build_asset(name: str) -> None:
    source = ASSET_DIR / f"{name}-source.png"
    output = ASSET_DIR / f"{name}.webp"
    if not source.is_file():
        raise FileNotFoundError(source)

    with Image.open(source) as image:
        image = image.convert("RGB").resize((768, 768), Image.Resampling.LANCZOS)
        for quality in range(84, 67, -2):
            image.save(output, "WEBP", quality=quality, method=6, exif=b"")
            if output.stat().st_size <= MAX_BYTES:
                break

    with Image.open(output) as result:
        if result.format != "WEBP" or result.size != (768, 768) or result.mode != "RGB":
            raise RuntimeError(f"Invalid output: {output}")
    if output.stat().st_size > MAX_BYTES:
        raise RuntimeError(f"Asset exceeds 150 KiB: {output}")
    print(f"{output.name}: {output.stat().st_size / 1024:.1f} KiB")


if __name__ == "__main__":
    for asset_name in ASSETS:
        build_asset(asset_name)
