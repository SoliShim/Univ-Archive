import {
  getLoadErrorMessage,
  getSemesterLabel,
  loadCourses,
} from "./data-loader.js";

const statusMessage = document.querySelector("#course-status");
const courseView = document.querySelector("#course-view");
const breadcrumbSemester = document.querySelector("#breadcrumb-semester");
const breadcrumbTitle = document.querySelector("#breadcrumb-title");
const courseSemester = document.querySelector("#course-semester");
const courseTitle = document.querySelector("#course-title");
const courseNotes = document.querySelector("#course-notes");
const openPdfLink = document.querySelector("#open-pdf-link");
const downloadPdfLink = document.querySelector("#download-pdf-link");
const pdfFrame = document.querySelector("#pdf-frame");
const viewerTip = document.querySelector("#viewer-tip");
const pdfPanel = document.querySelector("#pdf-panel");
const htmlPanel = document.querySelector("#html-panel");
const htmlPages = document.querySelector("#html-pages");
const pdfTab = document.querySelector("#pdf-tab");
const htmlTab = document.querySelector("#html-tab");
const htmlSearchInput = document.querySelector("#html-search-input");
const searchPrevButton = document.querySelector("#search-prev");
const searchNextButton = document.querySelector("#search-next");
const searchClearButton = document.querySelector("#search-clear");
const searchStatus = document.querySelector("#search-status");
const textLayerObservers = [];
const ASSET_VERSION = "20260325-02";

let currentCourse = null;
let htmlManifest = null;
let htmlRendered = false;
let currentPdfUrl = "";
let pageElements = [];
let currentSearchMatches = [];
let currentSearchIndex = -1;

async function init() {
  const courseId = new URLSearchParams(window.location.search).get("id");

  if (!courseId) {
    showError("잘못된 주소입니다. 과목 식별자가 없습니다.");
    return;
  }

  try {
    const courses = await loadCourses();
    const course = courses.find((entry) => entry.id === courseId);

    if (!course) {
      showError("요청한 과목 자료를 찾을 수 없습니다.");
      return;
    }

    currentCourse = course;
    htmlManifest = await loadHtmlManifest(course.id);
    renderCourse(course);
    bindViewTabs();
    bindSearchControls();
    setActiveView(resolveInitialView());
  } catch (error) {
    showError(getLoadErrorMessage(error));
  }
}

function renderCourse(course) {
  const semesterLabel = getSemesterLabel(course.year, course.semester);
  const pdfUrl = encodeURI(`./${course.pdfPath}`);

  resetViewShell();
  document.title = `${course.displayTitle || course.title} | 학습 기록 아카이브`;
  breadcrumbSemester.textContent = semesterLabel;
  breadcrumbTitle.textContent = course.displayTitle || course.title;
  courseSemester.textContent = semesterLabel;
  courseTitle.textContent = course.displayTitle || course.title;

  if (course.notes) {
    courseNotes.hidden = false;
    courseNotes.textContent = course.notes;
  }

  openPdfLink.href = pdfUrl;
  downloadPdfLink.href = pdfUrl;
  pdfFrame.src = pdfUrl;
  currentPdfUrl = pdfUrl;
  htmlTab.disabled = !htmlManifest;
  htmlTab.title = htmlManifest ? "" : "이 과목은 아직 HTML 보기 자산이 없습니다.";

  statusMessage.hidden = true;
  courseView.hidden = false;
}

function resetViewShell() {
  pdfPanel.hidden = false;
  htmlPanel.hidden = true;
  pdfTab.classList.add("is-active");
  htmlTab.classList.remove("is-active");
  pdfTab.setAttribute("aria-selected", "true");
  htmlTab.setAttribute("aria-selected", "false");
  viewerTip.textContent =
    "브라우저에서 PDF가 보이지 않으면 위 버튼으로 새 탭 열기 또는 다운로드를 사용하세요.";
  resetSearchResults();
}

async function loadHtmlManifest(courseId) {
  const manifestUrl = `./assets/html/${encodeURIComponent(courseId)}/manifest.json?v=${ASSET_VERSION}`;

  try {
    const response = await fetch(manifestUrl, { cache: "no-store" });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

function bindViewTabs() {
  pdfTab.addEventListener("click", () => setActiveView("pdf"));
  htmlTab.addEventListener("click", () => {
    if (!htmlManifest) {
      return;
    }

    setActiveView("html");
  });
}

function bindSearchControls() {
  htmlSearchInput.addEventListener("input", handleSearchInput);
  htmlSearchInput.addEventListener("keydown", handleSearchKeydown);
  searchPrevButton.addEventListener("click", () => moveSearchCursor(-1));
  searchNextButton.addEventListener("click", () => moveSearchCursor(1));
  searchClearButton.addEventListener("click", clearSearch);

  document.addEventListener("keydown", (event) => {
    const isFindShortcut =
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "f";

    if (!isFindShortcut || htmlPanel.hidden) {
      return;
    }

    event.preventDefault();
    htmlSearchInput.focus();
    htmlSearchInput.select();
  });
}

function resolveInitialView() {
  const requestedView = new URLSearchParams(window.location.search).get("view");

  if (requestedView === "pdf") {
    return "pdf";
  }

  if (htmlManifest) {
    return "html";
  }

  return "pdf";
}

function setActiveView(view) {
  const isHtml = view === "html" && htmlManifest;

  pdfPanel.hidden = isHtml;
  htmlPanel.hidden = !isHtml;
  pdfTab.classList.toggle("is-active", !isHtml);
  htmlTab.classList.toggle("is-active", isHtml);
  pdfTab.setAttribute("aria-selected", String(!isHtml));
  htmlTab.setAttribute("aria-selected", String(isHtml));

  if (isHtml) {
    pdfFrame.src = "about:blank";
    viewerTip.textContent =
      "HTML 보기에서는 PDF 각 페이지를 이미지로 변환해 표시합니다. 원본과 거의 동일하게 보이지만 텍스트를 직접 수정하는 문서는 아닙니다.";

    if (!htmlRendered) {
      renderHtmlPages();
    }

    queueMicrotask(() => {
      htmlSearchInput.focus({ preventScroll: true });
    });
  } else {
    if (pdfFrame.src !== currentPdfUrl) {
      pdfFrame.src = currentPdfUrl;
    }

    viewerTip.textContent =
      "브라우저에서 PDF가 보이지 않으면 위 버튼으로 새 탭 열기 또는 다운로드를 사용하세요.";
  }

  syncViewQuery(isHtml ? "html" : "pdf");
}

function renderHtmlPages() {
  if (!currentCourse || !htmlManifest) {
    return;
  }

  disconnectTextLayerObservers();
  htmlPages.innerHTML = "";
  pageElements = [];

  htmlManifest.pages.forEach((pageData, index) => {
    const figure = document.createElement("figure");
    figure.className = "html-page";
    figure.dataset.pageNumber = String(pageData.pageNumber);

    const canvas = document.createElement("div");
    canvas.className = "html-page-canvas";

    const image = document.createElement("img");
    image.className = "html-page-image";
    image.src = `./assets/html/${encodeURIComponent(currentCourse.id)}/${pageData.image}?v=${ASSET_VERSION}`;
    image.alt = `${currentCourse.displayTitle || currentCourse.title} ${index + 1}페이지`;
    image.loading = index < 2 ? "eager" : "lazy";
    image.decoding = "async";

    const textLayer = createTextLayer(pageData, index);
    bindTextLayerScale(image, textLayer, pageData);

    const caption = document.createElement("figcaption");
    caption.className = "html-page-caption";
    caption.textContent = `${index + 1} / ${htmlManifest.pageCount} 페이지`;

    const snippets = document.createElement("div");
    snippets.className = "html-page-snippets";
    snippets.hidden = true;

    canvas.append(image, textLayer);
    figure.append(canvas, caption, snippets);
    htmlPages.append(figure);
    const rawText = compactText(pageData.text || "");
    pageElements.push({
      figure,
      snippets,
      pageNumber: pageData.pageNumber,
      rawText,
      normalizedText: rawText.toLowerCase(),
    });
  });

  htmlRendered = true;
  updateSearchUiState();
}

function createTextLayer(pageData, index) {
  const textLayer = document.createElement("div");
  textLayer.className = "html-page-text-layer";
  textLayer.setAttribute(
    "aria-label",
    `${currentCourse.displayTitle || currentCourse.title} ${index + 1}페이지 텍스트 레이어`,
  );
  textLayer.style.width = `${pageData.width}px`;
  textLayer.style.height = `${pageData.height}px`;

  (pageData.spans || []).forEach((spanData) => {
    const span = document.createElement("span");
    span.className = "html-text-span";
    span.textContent = spanData.text;
    span.style.left = `${spanData.x}px`;
    span.style.top = `${spanData.y}px`;
    span.style.width = `${Math.max(1, spanData.width)}px`;
    span.style.height = `${Math.max(1, spanData.height)}px`;
    span.style.fontSize = `${Math.max(1, spanData.fontSize)}px`;
    textLayer.append(span);
  });

  return textLayer;
}

function bindTextLayerScale(image, textLayer, pageData) {
  const updateScale = () => {
    if (!image.clientWidth || !image.clientHeight) {
      return;
    }

    const scaleX = image.clientWidth / pageData.width;
    const scaleY = image.clientHeight / pageData.height;
    textLayer.style.transform = `scale(${scaleX}, ${scaleY})`;
  };

  image.addEventListener("load", updateScale);
  updateScale();

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => {
      updateScale();
    });
    observer.observe(image);
    textLayerObservers.push(observer);
  }
}

function disconnectTextLayerObservers() {
  while (textLayerObservers.length > 0) {
    const observer = textLayerObservers.pop();
    observer.disconnect();
  }
}

function handleSearchInput() {
  const query = normalizeText(htmlSearchInput.value);

  if (!query) {
    resetSearchResults();
    updateSearchUiState();
    return;
  }

  currentSearchMatches = buildMatches(query);
  currentSearchIndex = currentSearchMatches.length > 0 ? 0 : -1;
  renderSearchResults(query);
  updateSearchUiState();

  if (currentSearchMatches.length > 0) {
    revealSearchMatch(currentSearchIndex);
  }
}

function handleSearchKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    moveSearchCursor(event.shiftKey ? -1 : 1);
    return;
  }

  if (event.key === "Escape") {
    clearSearch();
  }
}

function buildMatches(query) {
  const matches = [];

  pageElements.forEach((pageEntry) => {
    let fromIndex = 0;

    while (fromIndex < pageEntry.normalizedText.length) {
      const foundAt = pageEntry.normalizedText.indexOf(query, fromIndex);

      if (foundAt === -1) {
        break;
      }

      matches.push({
        pageNumber: pageEntry.pageNumber,
        pageText: pageEntry.rawText,
        start: foundAt,
        end: foundAt + query.length,
      });

      fromIndex = foundAt + Math.max(1, query.length);
    }
  });

  return matches;
}

function renderSearchResults(query) {
  resetPageHighlights();

  const groupedMatches = new Map();

  currentSearchMatches.forEach((match, index) => {
    if (!groupedMatches.has(match.pageNumber)) {
      groupedMatches.set(match.pageNumber, []);
    }

    groupedMatches.get(match.pageNumber).push({ ...match, globalIndex: index });
  });

  pageElements.forEach((pageEntry) => {
    const pageMatches = groupedMatches.get(pageEntry.pageNumber) || [];
    pageEntry.figure.classList.toggle("is-match", pageMatches.length > 0);
    pageEntry.snippets.innerHTML = "";
    pageEntry.snippets.hidden = pageMatches.length === 0;

    if (pageMatches.length === 0) {
      return;
    }

    pageMatches.slice(0, 3).forEach((match) => {
      pageEntry.snippets.append(createSnippetElement(pageEntry.rawText, match, query));
    });
  });
}

function createSnippetElement(pageText, match, query) {
  const paragraph = document.createElement("p");
  paragraph.className = "search-snippet";

  const snippetRadius = 42;
  const snippetStart = Math.max(0, match.start - snippetRadius);
  const snippetEnd = Math.min(pageText.length, match.end + snippetRadius);
  const snippetText = pageText.slice(snippetStart, snippetEnd).trim();
  const snippetMatchStart = Math.max(0, match.start - snippetStart);
  const snippetMatchEnd = Math.min(snippetText.length, snippetMatchStart + query.length);

  if (snippetStart > 0) {
    paragraph.append("... ");
  }

  paragraph.append(snippetText.slice(0, snippetMatchStart));

  const mark = document.createElement("mark");
  mark.textContent = snippetText.slice(snippetMatchStart, snippetMatchEnd);
  paragraph.append(mark);

  paragraph.append(snippetText.slice(snippetMatchEnd));

  if (snippetEnd < pageText.length) {
    paragraph.append(" ...");
  }

  return paragraph;
}

function moveSearchCursor(direction) {
  if (currentSearchMatches.length === 0) {
    return;
  }

  if (currentSearchIndex === -1) {
    currentSearchIndex = 0;
  } else {
    currentSearchIndex =
      (currentSearchIndex + direction + currentSearchMatches.length) %
      currentSearchMatches.length;
  }

  revealSearchMatch(currentSearchIndex);
  updateSearchUiState();
}

function revealSearchMatch(index) {
  resetActiveMatch();

  const match = currentSearchMatches[index];
  const pageEntry = pageElements.find((entry) => entry.pageNumber === match.pageNumber);

  if (!pageEntry) {
    return;
  }

  pageEntry.figure.classList.add("is-active-match");
  pageEntry.figure.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearSearch() {
  htmlSearchInput.value = "";
  resetSearchResults();
  updateSearchUiState();
}

function resetSearchResults() {
  currentSearchMatches = [];
  currentSearchIndex = -1;
  resetPageHighlights();
}

function resetPageHighlights() {
  pageElements.forEach((pageEntry) => {
    pageEntry.figure.classList.remove("is-match", "is-active-match");
    pageEntry.snippets.innerHTML = "";
    pageEntry.snippets.hidden = true;
  });
}

function resetActiveMatch() {
  pageElements.forEach((pageEntry) => {
    pageEntry.figure.classList.remove("is-active-match");
  });
}

function updateSearchUiState() {
  const query = normalizeText(htmlSearchInput.value);
  const hasQuery = query.length > 0;
  const hasResults = currentSearchMatches.length > 0;

  searchPrevButton.disabled = !hasResults;
  searchNextButton.disabled = !hasResults;
  searchClearButton.disabled = !hasQuery;

  if (!hasQuery) {
    searchStatus.textContent = "Ctrl+F를 누르면 이 검색창으로 바로 이동합니다.";
    return;
  }

  if (!hasResults) {
    searchStatus.textContent = `"${htmlSearchInput.value}" 검색 결과가 없습니다.`;
    return;
  }

  searchStatus.textContent = `${currentSearchIndex + 1} / ${currentSearchMatches.length} 결과, ${currentSearchMatches[currentSearchIndex].pageNumber}페이지`;
}

function normalizeText(value) {
  return compactText(value).toLowerCase();
}

function compactText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function syncViewQuery(view) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("view", view);
  window.history.replaceState({}, "", nextUrl);
}

function showError(message) {
  statusMessage.hidden = false;
  statusMessage.classList.add("is-error");
  statusMessage.textContent = message;
  courseView.hidden = true;
}

init();
