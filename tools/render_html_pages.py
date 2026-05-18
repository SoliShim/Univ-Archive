from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parent.parent
COURSES_FILE = ROOT / "data" / "courses.json"
HTML_ROOT = ROOT / "assets" / "html"
DISPLAY_RENDER_SCALE = 2.2
OCR_RENDER_SCALE = 3.5
WEBP_QUALITY = 92
DEFAULT_OCR_LANG = "kor+eng"
MIN_CONFIDENCE = 25
OCR_PAGE_SEGMENTATION_MODE = "4"


def load_courses() -> list[dict]:
  raw_data = json.loads(COURSES_FILE.read_text(encoding="utf-8"))

  if isinstance(raw_data, list):
    return raw_data

  courses: list[dict] = []

  for semester in raw_data.get("semesters", []):
    for course in semester.get("courses", []):
      courses.append({
        **course,
        "semesterId": semester.get("id"),
        "semesterLabel": semester.get("label"),
      })

  return courses


def ensure_tool(name: str) -> str:
  path = shutil.which(name)

  if not path:
    raise RuntimeError(f"`{name}` 명령을 찾을 수 없습니다.")

  return path


def ensure_directory(path: Path) -> None:
  os.makedirs(str(path), exist_ok=True)


def cleanup_output_dir(path: Path) -> None:
  ensure_directory(path)

  for pattern in ("page-*.webp", "page-*.png", "page-*.text.json", "manifest.json", "index.html"):
    for old_file in path.glob(pattern):
      old_file.unlink()


def iter_renderable_courses(courses: list[dict]) -> list[dict]:
  return [
    course
    for course in courses
    if get_source_pdfs(course) and (course.get("html") or course.get("documentStatus") == "converted")
  ]


def get_source_pdfs(course: dict) -> list[str]:
  if course.get("sourcePdfs"):
    return course["sourcePdfs"]

  if course.get("sourcePdf"):
    return [course["sourcePdf"]]

  return []


def render_course(course: dict, tesseract_path: str, cwebp_path: str | None, lang: str) -> None:
  source_pdfs = get_source_pdfs(course)
  pdf_paths = [ROOT / source_pdf for source_pdf in source_pdfs]

  for pdf_path in pdf_paths:
    if not pdf_path.exists():
      raise FileNotFoundError(f"PDF 파일을 찾을 수 없습니다: {pdf_path}")

  html_config = course.get("html") or {}
  output_dir = ROOT / html_config.get("assetBase", str(HTML_ROOT / course["id"]))
  cleanup_output_dir(output_dir)

  pages: list[dict] = []
  page_number = 1

  with tempfile.TemporaryDirectory(prefix=f"univ-archive-{course['id']}-") as temp_dir:
    temp_root = Path(temp_dir)

    for source_index, pdf_path in enumerate(pdf_paths, start=1):
      doc = fitz.open(pdf_path)

      for source_page_number, page in enumerate(doc, start=1):
        page_base = f"page-{page_number:03}"
        display_png = temp_root / f"{page_base}.display.png"
        ocr_png = temp_root / f"{page_base}.ocr.png"
        render_page_png(page, display_png, DISPLAY_RENDER_SCALE)
        render_page_png(page, ocr_png, OCR_RENDER_SCALE)

        image_name = write_page_image(display_png, output_dir, page_base, cwebp_path)
        ocr_result = run_tesseract_ocr(tesseract_path, ocr_png, lang)
        text_json_name = f"{page_base}.text.json"

        text_json = {
          "pageNumber": page_number,
          "sourcePdf": source_pdfs[source_index - 1],
          "sourcePageNumber": source_page_number,
          "width": page.rect.width,
          "height": page.rect.height,
          "text": ocr_result["text"],
          "spans": ocr_result["spans"],
          "ocrEngine": "tesseract",
          "ocrLanguage": lang,
          "displayRenderScale": DISPLAY_RENDER_SCALE,
          "ocrRenderScale": OCR_RENDER_SCALE,
        }
        (output_dir / text_json_name).write_text(
          json.dumps(text_json, ensure_ascii=False, indent=2),
          encoding="utf-8",
        )

        pages.append({
          "pageNumber": page_number,
          "sourcePdf": source_pdfs[source_index - 1],
          "sourcePageNumber": source_page_number,
          "image": image_name,
          "textFile": text_json_name,
          "text": ocr_result["text"],
          "width": page.rect.width,
          "height": page.rect.height,
          "spans": ocr_result["spans"],
        })

        print(
          f"{course['id']} page {page_number} "
          f"(source {source_index}/{len(pdf_paths)}, page {source_page_number}/{doc.page_count}): "
          f"{len(ocr_result['text'])} chars, {len(ocr_result['spans'])} OCR spans",
        )
        page_number += 1

      doc.close()

  manifest = {
    "courseId": course["id"],
    "title": course.get("displayTitle") or course["title"],
    "semesterLabel": course.get("semesterLabel"),
    "sourcePdf": source_pdfs[0],
    "sourcePdfs": source_pdfs,
    "pageCount": len(pages),
    "pages": pages,
    "ocrEngine": "tesseract",
    "ocrLanguage": lang,
    "ocrRenderScale": OCR_RENDER_SCALE,
    "displayRenderScale": DISPLAY_RENDER_SCALE,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
  }

  (output_dir / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2),
    encoding="utf-8",
  )
  (output_dir / "index.html").write_text(render_standalone_html(manifest), encoding="utf-8")

  print(f"{course['id']}: {len(pages)} pages rendered -> {output_dir}")


def render_page_png(page: fitz.Page, output_path: Path, scale: float) -> None:
  pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
  pix.save(output_path)


def write_page_image(temp_png: Path, output_dir: Path, page_base: str, cwebp_path: str | None) -> str:
  if cwebp_path:
    image_name = f"{page_base}.webp"
    subprocess.run(
      [
        cwebp_path,
        "-quiet",
        "-q",
        str(WEBP_QUALITY),
        str(temp_png),
        "-o",
        str(output_dir / image_name),
      ],
      check=True,
    )
    return image_name

  image_name = f"{page_base}.png"
  shutil.copyfile(temp_png, output_dir / image_name)
  return image_name


def run_tesseract_ocr(tesseract_path: str, image_path: Path, lang: str) -> dict:
  completed = subprocess.run(
    [
      tesseract_path,
      str(image_path),
      "stdout",
      "-l",
      lang,
      "--psm",
      OCR_PAGE_SEGMENTATION_MODE,
      "tsv",
    ],
    check=True,
    capture_output=True,
    text=True,
  )

  rows = list(csv.DictReader(completed.stdout.splitlines(), delimiter="\t"))
  spans = []
  lines: dict[tuple[str, str, str], list[str]] = {}

  for row in rows:
    if row.get("level") != "5":
      continue

    text = (row.get("text") or "").strip()

    if not text:
      continue

    try:
      confidence = float(row.get("conf") or -1)
      left = float(row["left"])
      top = float(row["top"])
      width = float(row["width"])
      height = float(row["height"])
    except (TypeError, ValueError, KeyError):
      continue

    if confidence >= 0 and confidence < MIN_CONFIDENCE:
      continue

    line_key = (row.get("block_num", "0"), row.get("par_num", "0"), row.get("line_num", "0"))
    lines.setdefault(line_key, []).append(text)
    spans.append({
      "text": text,
      "x": round(left / OCR_RENDER_SCALE, 3),
      "y": round(top / OCR_RENDER_SCALE, 3),
      "width": round(width / OCR_RENDER_SCALE, 3),
      "height": round(height / OCR_RENDER_SCALE, 3),
      "fontSize": round(max(1, height / OCR_RENDER_SCALE), 3),
      "confidence": round(confidence, 3),
    })

  page_text = "\n".join(" ".join(words) for words in lines.values())

  return {
    "text": normalize_korean_ocr_spacing(" ".join(page_text.split())),
    "spans": spans,
  }


def normalize_korean_ocr_spacing(value: str) -> str:
  # Tesseract Korean often splits each Hangul syllable with spaces. Keep the
  # OCR spans untouched, but normalize the searchable page text.
  return re.sub(r"(?<=[가-힣])\s+(?=[가-힣])", "", value)


def render_standalone_html(manifest: dict) -> str:
  title = html_escape(manifest["title"])
  pages = "\n".join(
    f"""
    <figure class="page">
      <img src="./{html_escape(page['image'])}" alt="{title} {page['pageNumber']}페이지">
      <figcaption>{page['pageNumber']} / {manifest['pageCount']} 페이지</figcaption>
    </figure>
    """
    for page in manifest["pages"]
  )

  return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    body {{
      margin: 0;
      background: #f7f8f8;
      color: #172326;
      font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
    }}
    main {{
      width: min(100% - 32px, 980px);
      margin: 0 auto;
      padding: 32px 0 56px;
    }}
    h1 {{
      margin: 0 0 20px;
      font-size: 2rem;
    }}
    .page {{
      margin: 0 0 24px;
      padding: 14px;
      border: 1px solid #dbe4e4;
      border-radius: 10px;
      background: #fff;
    }}
    img {{
      display: block;
      width: 100%;
      height: auto;
    }}
    figcaption {{
      margin-top: 10px;
      color: #66777b;
      text-align: right;
    }}
  </style>
</head>
<body>
  <main>
    <h1>{title}</h1>
    {pages}
  </main>
</body>
</html>
"""


def html_escape(value: str) -> str:
  return (
    str(value)
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
    .replace('"', "&quot;")
  )


def main() -> None:
  parser = argparse.ArgumentParser(description="Render PDF pages and OCR text layers for Univ Archive.")
  parser.add_argument("--lang", default=DEFAULT_OCR_LANG, help="Tesseract language, e.g. kor+eng")
  parser.add_argument("--course", help="Render only one course id")
  args = parser.parse_args()

  tesseract_path = ensure_tool("tesseract")
  cwebp_path = shutil.which("cwebp")
  courses = iter_renderable_courses(load_courses())

  if args.course:
    courses = [course for course in courses if course["id"] == args.course]

  if not courses:
    raise RuntimeError("렌더링할 PDF 과목을 찾지 못했습니다.")

  ensure_directory(HTML_ROOT)

  for course in courses:
    render_course(course, tesseract_path, cwebp_path, args.lang)


if __name__ == "__main__":
  main()
