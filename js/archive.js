const DATA_URL = new URL("../data/courses.json", import.meta.url);
const ASSET_VERSION = "20260518-search-highlight";

const treeRoot = document.querySelector("#archive-tree");
const contentView = document.querySelector("#content-view");
const pageTitle = document.querySelector("#page-title");
const currentPath = document.querySelector("#current-path");
const summaryStrip = document.querySelector("#summary-strip");
const searchInput = document.querySelector("#archive-search");
const searchResults = document.querySelector("#search-results");
const textLayerObservers = [];

let archive = null;
let selectedSemesterId = null;
let selectedCourseId = null;
let initialDocumentSearch = null;
let documentPages = [];
let documentMatches = [];
let documentMatchIndex = -1;

init();

async function init() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`자료 목록을 불러오지 못했습니다. (${response.status})`);
    }

    archive = await response.json();
    const queryParams = new URLSearchParams(window.location.search);
    selectedCourseId = queryParams.get("course");
    selectedSemesterId = queryParams.get("semester");
    initialDocumentSearch = queryParams.get("docSearch");

    if (!selectedSemesterId && !selectedCourseId) {
      selectedSemesterId = archive.semesters[0]?.id ?? null;
    }

    bindEvents();
    render();
  } catch (error) {
    contentView.innerHTML = `
      <section class="error-panel">
        <h2>아카이브를 열 수 없습니다.</h2>
        <p>${escapeHtml(error.message)}</p>
      </section>
    `;
  }
}

function bindEvents() {
  treeRoot.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-kind]");

    if (!button) {
      return;
    }

    if (button.dataset.kind === "semester") {
      selectSemester(button.dataset.id);
    }

    if (button.dataset.kind === "course") {
      selectCourse(button.dataset.id);
    }
  });

  searchResults.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-course-id]");

    if (button) {
      selectCourse(button.dataset.courseId);
      searchInput.value = "";
      renderSearchResults("");
    }
  });

  searchInput.addEventListener("input", () => {
    renderSearchResults(searchInput.value);
  });

  contentView.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-course-id]");

    if (button) {
      selectCourse(button.dataset.courseId);
      return;
    }

    const docButton = event.target.closest("button[data-doc-action]");

    if (!docButton) {
      return;
    }

    if (docButton.dataset.docAction === "prev") {
      moveDocumentMatch(-1);
    }

    if (docButton.dataset.docAction === "next") {
      moveDocumentMatch(1);
    }

    if (docButton.dataset.docAction === "clear") {
      clearDocumentSearch();
    }
  });

  contentView.addEventListener("input", (event) => {
    if (event.target.matches("#document-search-input")) {
      handleDocumentSearch(event.target.value);
    }
  });

  contentView.addEventListener("keydown", (event) => {
    if (!event.target.matches("#document-search-input")) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      moveDocumentMatch(event.shiftKey ? -1 : 1);
    }

    if (event.key === "Escape") {
      clearDocumentSearch();
    }
  });
}

function render() {
  decorateCourses();
  renderSummary();
  renderTree();

  const selectedCourse = findCourse(selectedCourseId);

  if (selectedCourse) {
    renderCourse(selectedCourse);
    return;
  }

  const selectedSemester = findSemester(selectedSemesterId) ?? archive.semesters[0];
  renderSemester(selectedSemester);
}

function decorateCourses() {
  archive.semesters.forEach((semester) => {
    semester.courses.forEach((course) => {
      course.semesterId = semester.id;
      course.semesterLabel = semester.label;
      course.yearGroup = semester.yearGroup;
      course.schoolTerm = semester.schoolTerm;
      course.semesterStatus = semester.status;
      course.documentStatus = course.documentStatus || "empty";
      course.folderPath =
        `archive/${toFolderSlug(semester.yearGroup)}/${toFolderSlug(semester.label)}/${course.id}/index.html`;
    });
  });
}

function renderSummary() {
  const courses = getAllCourses();
  const totalCredits = courses.reduce((sum, course) => sum + Number(course.credits || 0), 0);
  const convertedCount = courses.filter((course) => course.documentStatus === "converted").length;
  const currentCount = courses.filter((course) => course.semesterStatus === "current").length;

  summaryStrip.innerHTML = `
    ${renderMetric("과목", courses.length)}
    ${renderMetric("학점", formatCredits(totalCredits))}
    ${renderMetric("HTML 문서", `${convertedCount}/${courses.length}`)}
    ${renderMetric("수강중", currentCount)}
  `;
}

function renderMetric(label, value) {
  return `
    <div class="summary-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function renderTree() {
  const groups = groupSemestersByYear();

  treeRoot.innerHTML = groups
    .map(([yearGroup, semesters]) => `
      <details class="tree-group" open>
        <summary>
          <span class="folder-icon" aria-hidden="true"></span>
          <span>${escapeHtml(yearGroup)}</span>
        </summary>
        <div class="tree-branch">
          ${semesters.map(renderSemesterNode).join("")}
        </div>
      </details>
    `)
    .join("");
}

function renderSemesterNode(semester) {
  const active = selectedSemesterId === semester.id && !selectedCourseId ? " is-active" : "";
  const status = semester.status === "current" ? `<span class="node-state">수강중</span>` : "";

  return `
    <details class="tree-semester" open>
      <summary>
        <button class="tree-node semester-node${active}" type="button" data-kind="semester" data-id="${semester.id}">
          <span class="folder-icon" aria-hidden="true"></span>
          <span>${escapeHtml(semester.label)}</span>
          ${status}
        </button>
      </summary>
      <div class="tree-leaves">
        ${semester.courses.map(renderCourseNode).join("")}
      </div>
    </details>
  `;
}

function renderCourseNode(course) {
  const active = selectedCourseId === course.id ? " is-active" : "";
  const statusClass = course.documentStatus === "converted" ? " is-ready" : "";

  return `
    <button class="tree-node course-node${active}${statusClass}" type="button" data-kind="course" data-id="${course.id}">
      <span class="file-icon" aria-hidden="true"></span>
      <span>${escapeHtml(course.title)}</span>
    </button>
  `;
}

function renderSemester(semester) {
  selectedCourseId = null;
  selectedSemesterId = semester.id;
  syncQuery({ semester: semester.id });

  const credits = semester.courses.reduce((sum, course) => sum + Number(course.credits || 0), 0);
  const converted = semester.courses.filter((course) => course.documentStatus === "converted").length;

  currentPath.textContent = `Univ Archive / ${semester.yearGroup} / ${semester.label}`;
  pageTitle.textContent = semester.label;

  contentView.innerHTML = `
    <section class="semester-overview">
      <div class="section-head">
        <div>
          <p class="section-label">${escapeHtml(semester.schoolTerm)}</p>
          <h2>${escapeHtml(semester.label)} 폴더</h2>
        </div>
        <span class="status-pill ${semester.status === "current" ? "is-current" : ""}">
          ${semester.status === "current" ? "수강중" : "완료"}
        </span>
      </div>

      <div class="semester-stats">
        ${renderStat("등록 과목", `${semester.courses.length}개`)}
        ${renderStat("학점", `${formatCredits(credits)}학점`)}
        ${renderStat("HTML 변환", `${converted}개`)}
      </div>

      <div class="course-table" role="table" aria-label="${escapeHtml(semester.label)} 과목 목록">
        <div class="course-row course-row-head" role="row">
          <span>과목</span>
          <span>이수구분</span>
          <span>담당교수</span>
          <span>학점</span>
          <span>문서 상태</span>
        </div>
        ${semester.courses.map(renderCourseRow).join("")}
      </div>
    </section>
  `;
}

function renderStat(label, value) {
  return `
    <div class="stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderCourseRow(course) {
  return `
    <button class="course-row" type="button" data-course-id="${course.id}">
      <span>
        <strong>${escapeHtml(course.title)}</strong>
        <small>${escapeHtml(course.code || "코드 없음")}</small>
      </span>
      <span>${escapeHtml(course.category || "-")}</span>
      <span>${escapeHtml(course.professor || "-")}</span>
      <span>${escapeHtml(String(course.credits ?? "-"))}</span>
      <span>${renderDocumentBadge(course.documentStatus)}</span>
    </button>
  `;
}

async function renderCourse(course) {
  resetDocumentState();
  selectedCourseId = course.id;
  selectedSemesterId = course.semesterId;
  syncQuery({ course: course.id });
  renderTree();

  currentPath.textContent = `Univ Archive / ${course.yearGroup} / ${course.semesterLabel} / ${course.title}`;
  pageTitle.textContent = course.title;

  contentView.innerHTML = `
    <article class="course-detail">
      <header class="course-detail-head">
        <div>
          <p class="section-label">${escapeHtml(course.semesterLabel)} · ${escapeHtml(course.schoolTerm)}</p>
          <h2>${escapeHtml(course.title)}</h2>
        </div>
        ${renderDocumentBadge(course.documentStatus)}
      </header>

      <div class="metadata-grid">
        ${renderMeta("과목 코드", course.code)}
        ${renderMeta("이수구분", course.category)}
        ${renderMeta("학점", course.credits)}
        ${renderMeta("등급", course.grade || (course.semesterStatus === "current" ? "수강중" : "-"))}
        ${renderMeta("담당교수", course.professor)}
      </div>

      <section class="document-shell">
        <div class="document-toolbar">
          <div>
            <p class="section-label">HTML Archive Slot</p>
            <h3>학습 문서 저장 위치</h3>
          </div>
          <code>${escapeHtml(course.folderPath)}</code>
        </div>
        <div id="document-body" class="document-body"></div>
      </section>
    </article>
  `;

  await renderDocumentBody(course);
}

function renderMeta(label, value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  return `
    <div class="meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

async function renderDocumentBody(course) {
  const body = document.querySelector("#document-body");

  if (!course.html) {
    body.innerHTML = `
      <div class="empty-document">
        <h3>아직 HTML 문서가 비어 있습니다.</h3>
        <p>
          이 과목 폴더는 생성되어 있고, 이후 PDF 또는 필기 자료를 HTML로 변환해
          이 위치에 저장하도록 준비되어 있습니다.
        </p>
        <div class="empty-file">
          <span class="file-icon" aria-hidden="true"></span>
          <code>${escapeHtml(course.folderPath)}</code>
        </div>
      </div>
    `;
    return;
  }

  if (course.html.type === "imageManifest") {
    body.innerHTML = `<div class="loading-panel">HTML 변환 문서를 불러오는 중입니다.</div>`;

    try {
      const manifestUrl = `${course.html.manifestPath}?v=${ASSET_VERSION}`;
      const response = await fetch(manifestUrl, { cache: "no-store" });

      if (!response.ok) {
        throw new Error("manifest를 불러오지 못했습니다.");
      }

      const manifest = await response.json();
      body.innerHTML = `
        <div class="converted-note">
          PDF 원본 렌더링 위에 검색/선택용 텍스트 레이어를 겹쳐 표시합니다.
          원본 배치를 유지하면서 브라우저 검색과 문서 내부 검색을 사용할 수 있습니다.
        </div>
        <section class="document-search" aria-label="문서 내부 검색">
          <label for="document-search-input">
            <span>문서 내부 검색</span>
            <input id="document-search-input" type="search" placeholder="이 과목 문서에서 검색">
          </label>
          <div class="document-search-actions">
            <button type="button" data-doc-action="prev" disabled>이전</button>
            <button type="button" data-doc-action="next" disabled>다음</button>
            <button type="button" data-doc-action="clear" disabled>지우기</button>
          </div>
          <p id="document-search-status">검색어를 입력하면 페이지별 결과가 표시됩니다.</p>
        </section>
        <div class="html-pages">
          ${manifest.pages.map((page, index) => renderHtmlPage(course, page, index, manifest.pageCount)).join("")}
        </div>
      `;
      documentPages = manifest.pages.map((page) => ({
        pageNumber: page.pageNumber,
        spans: page.spans || [],
        ...buildPageSearchIndex(page.spans || [], page.text || ""),
        text: compactText(page.text || ""),
        element: document.querySelector(`.html-page[data-page-number="${page.pageNumber}"]`),
        snippets: document.querySelector(`.html-page[data-page-number="${page.pageNumber}"] .html-page-snippets`),
        highlightLayer: document.querySelector(`.html-page[data-page-number="${page.pageNumber}"] .html-page-highlight-layer`)
      }));
      setupTextLayers();
      updateDocumentSearchUi();
      applyInitialDocumentSearch();
    } catch (error) {
      body.innerHTML = `
        <div class="error-panel">
          <h3>HTML 문서를 불러오지 못했습니다.</h3>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    }
  }
}

function renderHtmlPage(course, page, index, pageCount) {
  const src = `${course.html.assetBase}/${page.image}?v=${ASSET_VERSION}`;

  return `
    <figure class="html-page" data-page-number="${page.pageNumber}">
      <div class="html-page-canvas">
        <img src="${escapeHtml(src)}" alt="${escapeHtml(course.title)} ${index + 1}페이지" loading="${index < 2 ? "eager" : "lazy"}">
        <div
          class="html-page-highlight-layer"
          data-page-width="${page.width}"
          data-page-height="${page.height}"
          aria-hidden="true"
        ></div>
        <div
          class="html-page-text-layer"
          data-page-width="${page.width}"
          data-page-height="${page.height}"
          aria-label="${escapeHtml(course.title)} ${index + 1}페이지 텍스트 레이어"
        >
          ${(page.spans || []).map(renderTextSpan).join("")}
        </div>
      </div>
      <figcaption>${index + 1} / ${pageCount} 페이지</figcaption>
      <div class="html-page-snippets" hidden></div>
    </figure>
  `;
}

function renderTextSpan(span) {
  return `
    <span
      class="html-text-span"
      style="left:${span.x}px;top:${span.y}px;width:${Math.max(1, span.width)}px;height:${Math.max(1, span.height)}px;font-size:${Math.max(1, span.fontSize)}px;"
    >${escapeHtml(span.text)}</span>
  `;
}

function buildPageSearchIndex(spans, fallbackText) {
  let searchText = "";
  const spanIndexBySearchOffset = [];
  let previousChar = "";

  spans.forEach((span, spanIndex) => {
    const token = normalizeText(span.text || "");

    if (!token) {
      return;
    }

    const firstChar = token.at(0);

    if (searchText && shouldSeparateSearchTokens(previousChar, firstChar)) {
      searchText += " ";
      spanIndexBySearchOffset.push(null);
    }

    for (const char of token) {
      searchText += char;
      spanIndexBySearchOffset.push(spanIndex);
      previousChar = char;
    }
  });

  if (!searchText) {
    return {
      searchText: normalizeText(fallbackText),
      spanIndexBySearchOffset: []
    };
  }

  return {
    searchText,
    spanIndexBySearchOffset
  };
}

function shouldSeparateSearchTokens(previousChar, nextChar) {
  if (!previousChar || !nextChar) {
    return false;
  }

  if (isKoreanChar(previousChar) && isKoreanChar(nextChar)) {
    return false;
  }

  return /[\p{L}\p{N}]/u.test(previousChar) && /[\p{L}\p{N}]/u.test(nextChar);
}

function isKoreanChar(value) {
  return /[가-힣]/.test(value);
}

function getMatchSpanIndexes(page, start, end) {
  const indexes = new Set();

  for (let offset = start; offset < end; offset += 1) {
    const spanIndex = page.spanIndexBySearchOffset[offset];

    if (Number.isInteger(spanIndex)) {
      indexes.add(spanIndex);
    }
  }

  return [...indexes];
}

function renderPageSearchHighlights(page, matches) {
  if (!page.highlightLayer) {
    return;
  }

  page.highlightLayer.innerHTML = matches
    .flatMap((match) => match.spanIndexes.map((spanIndex) => renderSearchHighlight(page.spans[spanIndex], match.index)))
    .join("");
  updateActiveDocumentHighlight();
}

function renderSearchHighlight(span, matchIndex) {
  if (!span) {
    return "";
  }

  const left = Math.max(0, Number(span.x) - 1.5);
  const top = Math.max(0, Number(span.y) - 1);
  const width = Math.max(3, Number(span.width) + 3);
  const height = Math.max(3, Number(span.height) + 2);

  return `
    <span
      class="html-search-highlight"
      data-match-index="${matchIndex}"
      style="left:${left}px;top:${top}px;width:${width}px;height:${height}px;"
    ></span>
  `;
}

function updateActiveDocumentHighlight() {
  document.querySelectorAll(".html-search-highlight").forEach((highlight) => {
    highlight.classList.toggle(
      "is-active",
      Number(highlight.dataset.matchIndex) === documentMatchIndex
    );
  });
}

function setupTextLayers() {
  disconnectTextLayerObservers();

  document.querySelectorAll(".html-page-canvas").forEach((canvas) => {
    const image = canvas.querySelector("img");
    const textLayer = canvas.querySelector(".html-page-text-layer");
    const highlightLayer = canvas.querySelector(".html-page-highlight-layer");

    if (!image || !textLayer || !highlightLayer) {
      return;
    }

    const pageWidth = Number(textLayer.dataset.pageWidth);
    const pageHeight = Number(textLayer.dataset.pageHeight);

    textLayer.style.width = `${pageWidth}px`;
    textLayer.style.height = `${pageHeight}px`;
    highlightLayer.style.width = `${pageWidth}px`;
    highlightLayer.style.height = `${pageHeight}px`;

    const updateScale = () => {
      if (!image.clientWidth || !image.clientHeight) {
        return;
      }

      textLayer.style.transform =
        `scale(${image.clientWidth / pageWidth}, ${image.clientHeight / pageHeight})`;
      highlightLayer.style.transform =
        `scale(${image.clientWidth / pageWidth}, ${image.clientHeight / pageHeight})`;
    };

    image.addEventListener("load", updateScale);
    updateScale();

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(updateScale);
      observer.observe(image);
      textLayerObservers.push(observer);
    }
  });
}

function disconnectTextLayerObservers() {
  while (textLayerObservers.length > 0) {
    textLayerObservers.pop().disconnect();
  }
}

function handleDocumentSearch(rawQuery) {
  const query = normalizeText(rawQuery);

  clearDocumentHighlights();

  if (!query) {
    documentMatches = [];
    documentMatchIndex = -1;
    updateDocumentSearchUi();
    return;
  }

  documentMatches = [];

  documentPages.forEach((page) => {
    let fromIndex = 0;

    while (fromIndex < page.searchText.length) {
      const foundAt = page.searchText.indexOf(query, fromIndex);

      if (foundAt === -1) {
        break;
      }

      documentMatches.push({
        pageNumber: page.pageNumber,
        pageText: page.searchText,
        start: foundAt,
        end: foundAt + query.length,
        spanIndexes: getMatchSpanIndexes(page, foundAt, foundAt + query.length)
      });
      fromIndex = foundAt + Math.max(1, query.length);
    }
  });

  documentMatchIndex = documentMatches.length > 0 ? 0 : -1;
  renderDocumentSearchSnippets(rawQuery);
  updateDocumentSearchUi();

  if (documentMatchIndex >= 0) {
    revealDocumentMatch(documentMatchIndex);
  }
}

function applyInitialDocumentSearch() {
  const input = document.querySelector("#document-search-input");

  if (!initialDocumentSearch || !input) {
    return;
  }

  input.value = initialDocumentSearch;
  handleDocumentSearch(initialDocumentSearch);
  initialDocumentSearch = null;
}

function renderDocumentSearchSnippets(rawQuery) {
  const grouped = new Map();

  documentMatches.forEach((match, index) => {
    if (!grouped.has(match.pageNumber)) {
      grouped.set(match.pageNumber, []);
    }

    grouped.get(match.pageNumber).push({ ...match, index });
  });

  documentPages.forEach((page) => {
    const matches = grouped.get(page.pageNumber) || [];

    page.element?.classList.toggle("is-match", matches.length > 0);
    renderPageSearchHighlights(page, matches);

    if (!page.snippets) {
      return;
    }

    page.snippets.hidden = matches.length === 0;
    page.snippets.innerHTML = matches
      .slice(0, 3)
      .map((match) => renderSnippet(page.text, match, rawQuery))
      .join("");
  });
}

function renderSnippet(pageText, match, rawQuery) {
  const radius = 42;
  const start = Math.max(0, match.start - radius);
  const end = Math.min(pageText.length, match.end + radius);
  const snippet = pageText.slice(start, end).trim();
  const markStart = Math.max(0, match.start - start);
  const markEnd = Math.min(snippet.length, markStart + (match.end - match.start));

  return `
    <p class="search-snippet">
      ${start > 0 ? "... " : ""}
      ${escapeHtml(snippet.slice(0, markStart))}
      <mark>${escapeHtml(snippet.slice(markStart, markEnd))}</mark>
      ${escapeHtml(snippet.slice(markEnd))}
      ${end < pageText.length ? " ..." : ""}
    </p>
  `;
}

function moveDocumentMatch(direction) {
  if (documentMatches.length === 0) {
    return;
  }

  documentMatchIndex =
    (documentMatchIndex + direction + documentMatches.length) % documentMatches.length;
  revealDocumentMatch(documentMatchIndex);
  updateDocumentSearchUi();
}

function revealDocumentMatch(index) {
  documentPages.forEach((page) => page.element?.classList.remove("is-active-match"));

  const match = documentMatches[index];
  const page = documentPages.find((entry) => entry.pageNumber === match.pageNumber);

  if (!page?.element) {
    return;
  }

  page.element.classList.add("is-active-match");
  updateActiveDocumentHighlight();

  const activeHighlight = page.element.querySelector(
    `.html-search-highlight[data-match-index="${index}"]`
  );
  (activeHighlight || page.element).scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
}

function clearDocumentSearch() {
  const input = document.querySelector("#document-search-input");

  if (input) {
    input.value = "";
    input.focus();
  }

  documentMatches = [];
  documentMatchIndex = -1;
  clearDocumentHighlights();
  updateDocumentSearchUi();
}

function clearDocumentHighlights() {
  documentPages.forEach((page) => {
    page.element?.classList.remove("is-match", "is-active-match");
    page.highlightLayer?.replaceChildren();

    if (page.snippets) {
      page.snippets.hidden = true;
      page.snippets.innerHTML = "";
    }
  });
}

function updateDocumentSearchUi() {
  const input = document.querySelector("#document-search-input");
  const status = document.querySelector("#document-search-status");
  const buttons = document.querySelectorAll("[data-doc-action]");
  const hasQuery = Boolean(input?.value.trim());
  const hasMatches = documentMatches.length > 0;

  buttons.forEach((button) => {
    if (button.dataset.docAction === "clear") {
      button.disabled = !hasQuery;
    } else {
      button.disabled = !hasMatches;
    }
  });

  if (!status) {
    return;
  }

  if (!hasQuery) {
    status.textContent = "검색어를 입력하면 페이지별 결과가 표시됩니다.";
    return;
  }

  if (!hasMatches) {
    status.textContent = "검색 결과가 없습니다.";
    return;
  }

  status.textContent =
    `${documentMatchIndex + 1} / ${documentMatches.length} 결과 · ${documentMatches[documentMatchIndex].pageNumber}페이지`;
}

function resetDocumentState() {
  disconnectTextLayerObservers();
  documentPages = [];
  documentMatches = [];
  documentMatchIndex = -1;
}

function renderDocumentBadge(status) {
  const labels = {
    converted: "HTML 변환 완료",
    planned: "수강중 · 저장 예정",
    empty: "문서 슬롯 준비"
  };

  return `<span class="doc-badge ${status}">${labels[status] || labels.empty}</span>`;
}

function selectSemester(id) {
  selectedSemesterId = id;
  selectedCourseId = null;
  render();
}

function selectCourse(id) {
  selectedCourseId = id;
  selectedSemesterId = findCourse(id)?.semesterId ?? selectedSemesterId;
  render();
}

function renderSearchResults(rawQuery) {
  const query = rawQuery.trim().toLowerCase();

  if (!query) {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
    return;
  }

  const matches = getAllCourses().filter((course) => {
    const haystack = [
      course.title,
      course.code,
      course.category,
      course.professor,
      course.semesterLabel
    ].filter(Boolean).join(" ").toLowerCase();

    return haystack.includes(query);
  });

  searchResults.hidden = false;
  searchResults.innerHTML = `
    <div class="search-results-head">
      <strong>검색 결과 ${matches.length}개</strong>
      <span>${escapeHtml(rawQuery)}</span>
    </div>
    <div class="result-list">
      ${matches.map((course) => `
        <button type="button" data-course-id="${course.id}">
          <strong>${escapeHtml(course.title)}</strong>
          <span>${escapeHtml(course.semesterLabel)} · ${escapeHtml(course.category || "-")} · ${escapeHtml(course.code || "-")}</span>
        </button>
      `).join("") || `<p class="no-results">일치하는 과목이 없습니다.</p>`}
    </div>
  `;
}

function groupSemestersByYear() {
  const groups = new Map();

  archive.semesters.forEach((semester) => {
    if (!groups.has(semester.yearGroup)) {
      groups.set(semester.yearGroup, []);
    }

    groups.get(semester.yearGroup).push(semester);
  });

  return [...groups.entries()];
}

function getAllCourses() {
  return archive.semesters.flatMap((semester) => semester.courses);
}

function findSemester(id) {
  return archive.semesters.find((semester) => semester.id === id);
}

function findCourse(id) {
  if (!id) {
    return null;
  }

  return getAllCourses().find((course) => course.id === id);
}

function syncQuery(params) {
  const url = new URL(window.location.href);
  url.search = "";

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  window.history.replaceState({}, "", url);
}

function toFolderSlug(value) {
  return String(value)
    .replace(/\s+/g, "-")
    .replace(/[^\w가-힣-]/g, "")
    .toLowerCase();
}

function formatCredits(value) {
  return Number.isInteger(value) ? String(value) : String(value.toFixed(1)).replace(/\.0$/, "");
}

function normalizeText(value) {
  return compactText(value)
    .toLowerCase()
    .replace(/(?<=[가-힣])\s+(?=[가-힣])/g, "");
}

function compactText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
