# Soli's Archive

대학에서 수강한 과목과 학습 문서를 학년/학기 폴더 트리로 정리하는 정적 웹 아카이브입니다.

현재 구조는 `PDF 보기` 중심이 아니라, 각 과목마다 HTML 문서 저장 슬롯을 두고 PDF 또는 필기 자료를 HTML 형식으로 옮겨 보관하는 방향으로 재구성되어 있습니다. PDF가 연결된 문서는 OCR 기반 검색/선택용 텍스트 레이어를 포함한 HTML 문서 패키지로 만든 뒤, 공개 배포 전 암호화된 `.archive.enc` 패키지로 바꿔 제공합니다.

프로젝트 구조와 작업 흐름은 `project-guide/index.html`에서도 확인할 수 있습니다.

## 현재 포함된 범위

- 1학년 1학기: 2021-1
- 1학년 2학기: 2021-2
- 2학년 1학기: 2024-1
- 2학년 2학기: 2024-2
- 3학년 1학기: 2025-1
- 3학년 2학기: 2026-1, 현재 수강중
- 계절/특별학기

## 구성

- `index.html`: 트리형 아카이브 앱 진입점
- `course.html`: 이전 과목 상세 URL을 `index.html?course=<id>`로 넘기는 호환용 페이지
- `data/courses.json`: 학년, 학기, 과목, 문서 상태 데이터
- `js/archive.js`: 트리 탐색, 검색, 과목 상세 렌더링
- `styles.css`: 전체 UI 스타일
- `assets/encrypted/<학기>/<course-id>.archive.enc`: 공개 사이트에서 제공하는 암호화 문서 패키지
- `assets/html/<학기>/<과목명>/<course-id>/`: PDF 원본 렌더링 이미지, OCR 텍스트 JSON, manifest, standalone HTML 임시 생성 위치
- `assets/pdfs/<학기>/<과목명>/`: PDF 원본 임시 입력 위치
- `tools/render_html_pages.py`: PDF를 원본 렌더링 이미지와 OCR 텍스트 레이어로 변환하는 도구
- `tools/encrypt_archives.js`: 변환된 HTML 문서 패키지를 AES-GCM 암호화 패키지로 묶는 도구
- `requirements.txt`: 변환 스크립트용 Python 의존성

## 새 과목 문서 저장 방식

각 과목은 웹 화면에서 아래와 같은 문서 슬롯 경로를 가집니다.

```text
archive/<학년>/<학기>/<course-id>/index.html
```

아직 모든 과목의 실제 문서 파일을 생성하지는 않고, `data/courses.json`에 경로와 상태를 먼저 잡아 두었습니다. PDF를 HTML로 변환한 뒤 암호화 패키지로 바꾸면 이 슬롯에서 비밀번호 입력 후 문서를 볼 수 있습니다.

## 문서 변환 및 암호화 흐름

HWP 원본은 보관용으로 두고, 웹 변환은 PDF에서 시작합니다. 변환 결과는 과목별로 아래 파일들을 만듭니다.

```text
assets/html/<학기>/<과목명>/<course-id>/
├─ page-001.webp
├─ page-001.text.json
├─ manifest.json
└─ index.html
```

중간/기말처럼 PDF가 여러 개로 나뉜 과목은 암호화 전 임시 변환 단계에서 `data/courses.json`의 `sourcePdfs`에 순서대로 등록합니다. 변환 결과는 사용자가 보기에는 하나의 문서처럼 이어진 페이지 번호를 가집니다. 암호화가 끝나면 공개용 `data/courses.json`에는 원본 PDF 경로를 남기지 않습니다.

필요 도구:

```bash
brew install tesseract tesseract-lang
python3 -m pip install -r requirements.txt
```

변환 실행:

```bash
python3 tools/render_html_pages.py --lang kor+eng
```

특정 과목만 다시 변환:

```bash
python3 tools/render_html_pages.py --course data-structure-summary --lang kor+eng
```

표시용 이미지는 PDF 원본 레이아웃을 유지하고, OCR 결과는 투명 텍스트 레이어와 문서 내부 검색 인덱스로 사용됩니다.

## 공개 배포용 암호화

GitHub Pages는 정적 공개 사이트이므로 PDF 원본과 OCR JSON, WebP 페이지 이미지를 그대로 커밋하지 않습니다. OCR 변환이 끝나면 아래 명령으로 과목별 문서를 암호화합니다.

```bash
ARCHIVE_PASSWORD='12자 이상 비밀번호' node tools/encrypt_archives.js
```

암호화 후 구조는 아래처럼 바뀝니다.

```text
assets/encrypted/<학기>/
└─ <course-id>.archive.enc
```

스크립트는 `data/courses.json`의 `html.type`을 `encryptedArchive`로 바꾸고, 공개 사이트에서는 이 `.enc` 파일만 내려받습니다. 사용자가 입력한 비밀번호는 서버로 전송되지 않고 브라우저 메모리 안에서만 복호화에 사용됩니다.

암호화 후에는 평문 자료가 커밋되지 않도록 확인합니다.

```bash
find assets/html assets/pdfs -type f ! -name '.gitkeep' -print
```

위 명령에서 아무 파일도 나오지 않아야 합니다.

## 로컬 미리보기

JSON과 HTML 변환 자산을 불러와야 하므로 로컬 서버로 확인하세요.

```bash
python3 -m http.server 8000
```

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:8000
```
