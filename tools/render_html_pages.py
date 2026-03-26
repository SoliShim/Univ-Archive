from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import fitz
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
COURSES_FILE = ROOT / "data" / "courses.json"
HTML_ROOT = ROOT / "assets" / "html"
RENDER_SCALE = 2.2
WEBP_QUALITY = 92


def load_courses() -> list[dict]:
  return json.loads(COURSES_FILE.read_text(encoding="utf-8"))


def ensure_directory(path: Path) -> None:
  os.makedirs(str(path), exist_ok=True)


def render_course(course: dict) -> None:
  pdf_path = ROOT / course["pdfPath"]
  output_dir = HTML_ROOT / course["id"]
  ensure_directory(output_dir)

  for old_file in output_dir.glob("page-*.webp"):
    old_file.unlink()

  manifest_path = output_dir / "manifest.json"
  if manifest_path.exists():
    manifest_path.unlink()

  doc = fitz.open(pdf_path)
  pages: list[dict] = []

  for index, page in enumerate(doc, start=1):
    pix = page.get_pixmap(matrix=fitz.Matrix(RENDER_SCALE, RENDER_SCALE), alpha=False)
    image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    output_name = f"page-{index:03}.webp"
    image.save(output_dir / output_name, "WEBP", quality=WEBP_QUALITY, method=6)
    text = " ".join(page.get_text("text").split())
    spans = []

    for block in page.get_text("dict").get("blocks", []):
      if block.get("type") != 0:
        continue

      for line in block.get("lines", []):
        for span in line.get("spans", []):
          span_text = span.get("text", "")

          if not span_text.strip():
            continue

          x0, y0, x1, y1 = span["bbox"]
          spans.append({
            "text": span_text,
            "x": round(x0, 3),
            "y": round(y0, 3),
            "width": round(x1 - x0, 3),
            "height": round(y1 - y0, 3),
            "fontSize": round(span.get("size", y1 - y0), 3),
          })

    pages.append({
      "pageNumber": index,
      "image": output_name,
      "text": text,
      "width": page.rect.width,
      "height": page.rect.height,
      "spans": spans,
    })

  manifest = {
    "courseId": course["id"],
    "title": course.get("displayTitle") or course["title"],
    "sourcePdf": course["pdfPath"],
    "pageCount": len(pages),
    "pages": pages,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
  }

  manifest_path.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2),
    encoding="utf-8",
  )

  print(f"{course['id']}: {len(pages)} pages rendered -> {output_dir}")


def main() -> None:
  courses = load_courses()
  ensure_directory(HTML_ROOT)

  for course in courses:
    if course.get("status") not in (None, "published"):
      continue

    render_course(course)


if __name__ == "__main__":
  main()
