# Study Record Upload Project

학교에서 공부한 과목 정리본을 학기별로 정리해 두는 정적 웹사이트입니다.  
현재 버전은 PDF 원본 보존을 우선하며, 각 과목 페이지에서 `PDF 보기`와 `HTML 보기`를 전환할 수 있습니다.  
`HTML 보기`는 PDF 각 페이지를 이미지로 변환해 쌓아 두는 방식이라 원본 레이아웃을 매우 비슷하게 유지합니다.

## 구성

- `index.html`: 학기별 자료 목록
- `course.html?id=<slug>`: 과목별 PDF 보기 페이지
- `data/courses.json`: 과목 메타데이터
- `assets/pdfs/`: 실제 PDF 파일
- `assets/html/<course-id>/`: HTML 보기용 페이지 이미지 및 `manifest.json`
- `js/`: 목록/과목 페이지 렌더링 스크립트
- `tools/render_html_pages.py`: PDF를 HTML 보기용 이미지 자산으로 변환하는 스크립트
- `styles.css`: 공통 스타일

## 새 과목 추가 방법

1. PDF 파일을 `assets/pdfs/` 폴더에 넣습니다.
2. `data/courses.json`에 과목 정보를 한 줄 추가합니다.
3. 아래 명령으로 HTML 보기 자산을 생성합니다.

```powershell
python tools/render_html_pages.py
```

HTML 보기 자산까지 만들어야 과목 페이지에서 `HTML 보기` 탭이 활성화됩니다.

예시:

```json
{
  "id": "operating-system-summary",
  "title": "운영체제",
  "displayTitle": "운영체제 총정리",
  "year": 3,
  "semester": 2,
  "pdfPath": "assets/pdfs/운영체제 총정리.pdf",
  "status": "published",
  "notes": "3학년 2학기 운영체제 정리 PDF입니다."
}
```

필드 설명:

- `id`: URL에 들어가는 고유 식별자입니다. 영어 slug를 권장합니다.
- `title`: 과목명입니다.
- `displayTitle`: 화면에 보여줄 제목입니다.
- `year`: 학년 숫자입니다.
- `semester`: 학기 숫자입니다. 현재 구조는 `1` 또는 `2`를 사용합니다.
- `pdfPath`: PDF 파일 경로입니다.
- `status`: 현재는 `published`를 사용합니다.
- `notes`: 과목 설명 또는 메모입니다.

## 로컬에서 미리보기

이 프로젝트는 `data/courses.json`을 불러오기 때문에 브라우저에서 HTML 파일을 직접 더블클릭하면 동작하지 않을 수 있습니다.  
간단한 로컬 서버를 실행한 뒤 접속하세요.

PowerShell:

```powershell
python -m http.server 8000
```

그 다음 브라우저에서 아래 주소를 엽니다.

```text
http://localhost:8000
```

## GitHub에 업로드

아직 원격 저장소가 없다면 GitHub에서 새 저장소를 만든 뒤 아래처럼 연결하면 됩니다.

```powershell
git add .
git commit -m "Initial study archive site"
git branch -M main
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

## GitHub Pages 배포

1. GitHub 저장소의 `Settings`로 이동합니다.
2. `Pages` 메뉴를 엽니다.
3. `Build and deployment`에서 `Deploy from a branch`를 선택합니다.
4. 브랜치는 `main`, 폴더는 `/ (root)`를 선택합니다.
5. 저장 후 잠시 기다리면 배포 주소가 생성됩니다.

## 현재 등록된 자료

- 3학년 1학기 `알고리즘 총정리`
- 3학년 1학기 `자료구조 총정리`
