from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
COURSES_FILE = ROOT / "data" / "courses.json"
INDEX_FILE = ROOT / "index.html"
ARCHIVE_ROOT = ROOT / "archive"
ROOT_PREFIX = "../../../../"
ASSET_VERSION = "20260710-final-pdfs"


def to_folder_slug(value: object) -> str:
  text = str(value)
  text = re.sub(r"\s+", "-", text)
  text = re.sub(r"[^0-9A-Za-z_가-힣-]", "", text)
  return text.lower()


def iter_courses() -> list[dict]:
  data = json.loads(COURSES_FILE.read_text(encoding="utf-8"))
  courses: list[dict] = []

  for semester in data.get("semesters", []):
    for course in semester.get("courses", []):
      courses.append({
        **course,
        "semester": semester,
        "folderPath": (
          f"archive/{to_folder_slug(semester.get('yearGroup'))}/"
          f"{to_folder_slug(semester.get('label'))}/{course['id']}/index.html"
        ),
      })

  return courses


def render_course_page(index_html: str, course: dict) -> str:
  title = f"{course['title']} | Soli's Archive"
  html = index_html
  html = html.replace("<title>Soli's Archive</title>", f"<title>{title}</title>")
  html = html.replace(
    f'<link rel="stylesheet" href="./styles.css?v={ASSET_VERSION}">',
    f'<link rel="stylesheet" href="{ROOT_PREFIX}styles.css?v={ASSET_VERSION}">',
  )
  html = html.replace(
    "<body>",
    f'<body data-course-id="{course["id"]}" data-root-prefix="{ROOT_PREFIX}">',
  )
  html = html.replace(
    'href="./index.html" aria-label="Soli\'s Archive 홈"',
    f'href="{ROOT_PREFIX}index.html" aria-label="Soli\'s Archive 홈"',
  )
  html = html.replace(
    'action="./course-search.html"',
    f'action="{ROOT_PREFIX}course-search.html"',
  )
  html = html.replace(
    'action="./global-search.html"',
    f'action="{ROOT_PREFIX}global-search.html"',
  )
  html = html.replace(
    f'<script type="module" src="./js/archive.js?v={ASSET_VERSION}"></script>',
    f'<script type="module" src="{ROOT_PREFIX}js/archive.js?v={ASSET_VERSION}"></script>',
  )
  return html


def main() -> None:
  index_html = INDEX_FILE.read_text(encoding="utf-8")

  for course in iter_courses():
    output_path = ROOT / course["folderPath"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_course_page(index_html, course), encoding="utf-8")
    print(output_path.relative_to(ROOT))


if __name__ == "__main__":
  main()
