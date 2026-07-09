const DATA_URL = new URL("../data/courses.json", import.meta.url);
const APP_NAME = "Soli's Archive";
const ASSET_VERSION = "20260710-final-pdfs";
const SIDEBAR_WIDTH_KEY = "solisArchiveSidebarWidth";
const TREE_STATE_KEY = "solisArchiveCollapsedTreeNodes.v2";
const SIDEBAR_VISIBILITY_KEY = "solisArchiveSidebarVisible";
const DOCUMENT_SEARCH_VISIBILITY_KEY = "solisArchiveDocumentSearchVisible";
const PAGE_VIEWFINDER_VISIBILITY_KEY = "solisArchivePageViewfinderVisible";
const DEFAULT_COLLAPSED_TREE_NODE_KEYS = ["semester:y1-s1", "semester:y1-s2"];
const DEFAULT_SIDEBAR_WIDTH = 360;
const MIN_SIDEBAR_WIDTH = 250;
const MAX_SIDEBAR_WIDTH = 620;
const MAX_GLOBAL_SEARCH_RESULTS = 60;
const COURSE_EMOJIS = {
  "creative-communication": "💬",
  "cau-seminar-1": "🎓",
  "entrepreneurship-accounting": "💼",
  "basic-programming": "💻",
  "advanced-programming": "🧑‍💻",
  "art-technology-introduction": "🎨",
  "design-thinking-problem-solving": "💡",
  "concept-studio": "🧩",
  writing: "✍️",
  "object-oriented-programming": "🧱",
  act: "🎯",
  "communication-in-english": "🗣️",
  "cau-seminar-2": "🎓",
  "contents-mathematics": "🧮",
  "world-of-literature": "📚",
  "wellbeing-science-risk-society": "🌿",
  "visual-computing": "🖼️",
  "open-source-programming": "🐙",
  "korean-history": "🏛️",
  "industrial-security": "🛡️",
  "industrial-security-crime": "🚨",
  "business-management-security": "🏢",
  "computer-system-foundation": "🖥️",
  "information-security-theory": "🔐",
  "programming-language-theory": "🧬",
  programming: "⌨️",
  "human-behavior-psychology": "🧠",
  "future-society-software": "🚀",
  "privacy-use-protection": "🪪",
  "business-economics-data-analysis-software": "📊",
  "computer-network": "🌐",
  "algorithm-summary": "🧭",
  "basic-computer-programming": "💻",
  "technology-management-protection": "📈",
  "business-economics-software-programming": "💹",
  "industrial-security-investigation-forensics": "🕵️",
  "data-structure-summary": "🌳",
  "industrial-security-law": "⚖️",
  "plant-civilization": "🌱",
  "security-communication": "📡",
  "operating-system-security": "🛡️",
  "opensource-sw-python": "🐍",
  "operating-system": "⚙️",
  "artificial-intelligence": "🤖",
  "data-structure-english": "🌳",
  "computational-thinking-pre-admission": "🧩",
  "software-centered-world": "🌍",
  "history-culture-consumption": "🏺",
  "ai-and-law": "🤖",
  "practical-hanja": "🈶",
  "lithuanian-language-culture": "🇱🇹"
};

const treeRoot = document.querySelector("#archive-tree");
const appShell = document.querySelector(".app-shell");
const contentView = document.querySelector("#content-view");
const pageTitle = document.querySelector("#page-title");
const currentPath = document.querySelector("#current-path");
const summaryStrip = document.querySelector("#summary-strip");
const searchInput = document.querySelector("#archive-search");
const globalSearchInput = document.querySelector("#global-archive-search");
const searchResults = document.querySelector("#search-results");
const sidebarResizer = document.querySelector("#sidebar-resizer");
const sidebarVisibilityToggle = document.querySelector("#sidebar-visibility-toggle");
const textLayerObservers = [];
const embeddedCourseId = document.body?.dataset.courseId || null;
const searchPageMode = document.body?.dataset.searchMode || null;

let archive = null;
let selectedSemesterId = null;
let selectedCourseId = null;
let initialDocumentSearch = null;
let initialDocumentPage = null;
let documentPages = [];
let documentMatches = [];
let documentMatchIndex = -1;
let documentPageObserver = null;
let collapsedTreeNodes = new Set();
let globalSearchIndexPromise = null;
let globalSearchIndex = [];

init();

async function init() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`자료 목록을 불러오지 못했습니다. (${response.status})`);
    }

    archive = await response.json();
    const queryParams = new URLSearchParams(window.location.search);
    selectedCourseId = queryParams.get("course") || embeddedCourseId;
    selectedSemesterId = queryParams.get("semester");
    initialDocumentSearch = queryParams.get("docSearch");
    initialDocumentPage = Number(queryParams.get("page")) || null;
    collapsedTreeNodes = loadCollapsedTreeState();

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
  setupSidebarResizer();
  setupSidebarVisibility();
  setupSearchForms();

  document.querySelector(".brand-mark")?.addEventListener("click", (event) => {
    event.preventDefault();
    selectHome();
  });

  treeRoot.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("button[data-tree-toggle]");

    if (toggleButton) {
      toggleTreeNode(toggleButton.dataset.nodeType, toggleButton.dataset.id);
      return;
    }

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

  contentView.addEventListener("click", (event) => {
    const globalResultButton = event.target.closest("button[data-global-course-id]");

    if (globalResultButton) {
      selectCourse(
        globalResultButton.dataset.globalCourseId,
        globalResultButton.dataset.query || "",
        Number(globalResultButton.dataset.pageNumber) || null
      );
      return;
    }

    const semesterButton = event.target.closest("button[data-semester-id]");

    if (semesterButton) {
      selectSemester(semesterButton.dataset.semesterId);
      return;
    }

    const button = event.target.closest("button[data-course-id]");

    if (button) {
      selectCourse(button.dataset.courseId);
      return;
    }

    const pageButton = event.target.closest("button[data-doc-page]");

    if (pageButton) {
      scrollDocumentPageIntoView(Number(pageButton.dataset.docPage));
      return;
    }

    const viewToggleButton = event.target.closest("button[data-doc-view-toggle]");

    if (viewToggleButton) {
      toggleDocumentViewPanel(viewToggleButton.dataset.docViewToggle);
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
  expandSelectedTreePath(false);
  renderSummary();
  renderTree();

  if (searchPageMode === "course") {
    renderCourseSearchPage(getCurrentSearchQuery());
    return;
  }

  if (searchPageMode === "global") {
    renderGlobalSearchPage(getCurrentSearchQuery());
    return;
  }

  const selectedCourse = findCourse(selectedCourseId);

  if (selectedCourse) {
    renderCourse(selectedCourse);
    return;
  }

  const selectedSemester = findSemester(selectedSemesterId);

  if (selectedSemester) {
    renderSemester(selectedSemester);
    return;
  }

  renderHome();
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
    .map(([yearGroup, semesters]) => {
      const groupOpen = isTreeNodeOpen("year", yearGroup);
      const branchId = getTreePanelId("year", yearGroup);
      const toggleLabel = `${yearGroup} ${groupOpen ? "접기" : "펼치기"}`;

      return `
      <section class="tree-group" aria-label="${escapeHtml(yearGroup)}">
        <button
          class="tree-group-toggle"
          type="button"
          data-tree-toggle="true"
          data-node-type="year"
          data-id="${escapeHtml(yearGroup)}"
          aria-expanded="${String(groupOpen)}"
          aria-controls="${escapeHtml(branchId)}"
          aria-label="${escapeHtml(toggleLabel)}"
        >
          <span class="tree-chevron" aria-hidden="true"></span>
          <span class="folder-icon" aria-hidden="true"></span>
          <span>${escapeHtml(yearGroup)}</span>
        </button>
        <div id="${escapeHtml(branchId)}" class="tree-branch" ${groupOpen ? "" : "hidden"}>
          ${semesters.map(renderSemesterNode).join("")}
        </div>
      </section>
    `;
    })
    .join("");
}

function renderSemesterNode(semester) {
  const active = selectedSemesterId === semester.id && !selectedCourseId ? " is-active" : "";
  const status = semester.status === "current" ? `<span class="node-state">수강중</span>` : "";
  const semesterOpen = isTreeNodeOpen("semester", semester.id);
  const leavesId = getTreePanelId("semester", semester.id);
  const toggleLabel = `${semester.label} ${semesterOpen ? "접기" : "펼치기"}`;

  return `
    <section class="tree-semester" aria-label="${escapeHtml(semester.label)}">
      <div class="tree-row">
        <button
          class="tree-toggle"
          type="button"
          data-tree-toggle="true"
          data-node-type="semester"
          data-id="${escapeHtml(semester.id)}"
          aria-expanded="${String(semesterOpen)}"
          aria-controls="${escapeHtml(leavesId)}"
          aria-label="${escapeHtml(toggleLabel)}"
        >
          <span class="tree-chevron" aria-hidden="true"></span>
        </button>
        <button class="tree-node semester-node${active}" type="button" data-kind="semester" data-id="${semester.id}">
          <span class="folder-icon" aria-hidden="true"></span>
          <span>${escapeHtml(semester.label)}</span>
          ${status}
        </button>
      </div>
      <div id="${escapeHtml(leavesId)}" class="tree-leaves" ${semesterOpen ? "" : "hidden"}>
        ${semester.courses.map(renderCourseNode).join("")}
      </div>
    </section>
  `;
}

function renderCourseNode(course) {
  const active = selectedCourseId === course.id ? " is-active" : "";
  const statusClass = course.documentStatus === "converted" ? " is-ready" : "";

  return `
    <button class="tree-node course-node${active}${statusClass}" type="button" data-kind="course" data-id="${course.id}">
      <span class="course-emoji" aria-hidden="true">${escapeHtml(getCourseEmoji(course))}</span>
      <span>${escapeHtml(course.title)}</span>
    </button>
  `;
}

function getTreeNodeKey(type, id) {
  return `${type}:${id}`;
}

function getTreePanelId(type, id) {
  return `tree-panel-${type}-${toFolderSlug(id)}`;
}

function isTreeNodeOpen(type, id) {
  return !collapsedTreeNodes.has(getTreeNodeKey(type, id));
}

function toggleTreeNode(type, id) {
  const key = getTreeNodeKey(type, id);

  if (collapsedTreeNodes.has(key)) {
    collapsedTreeNodes.delete(key);
  } else {
    collapsedTreeNodes.add(key);
  }

  saveCollapsedTreeState();
  renderTree();
}

function loadCollapsedTreeState() {
  try {
    const savedRawState = localStorage.getItem(TREE_STATE_KEY);

    if (!savedRawState) {
      return new Set(DEFAULT_COLLAPSED_TREE_NODE_KEYS);
    }

    const savedState = JSON.parse(savedRawState);
    return new Set(Array.isArray(savedState) ? savedState : []);
  } catch {
    return new Set(DEFAULT_COLLAPSED_TREE_NODE_KEYS);
  }
}

function saveCollapsedTreeState() {
  localStorage.setItem(TREE_STATE_KEY, JSON.stringify([...collapsedTreeNodes]));
}

function expandTreeNode(type, id, persist = true) {
  collapsedTreeNodes.delete(getTreeNodeKey(type, id));

  if (persist) {
    saveCollapsedTreeState();
  }
}

function expandSemesterPath(semesterId, persist = true) {
  const semester = findSemester(semesterId);

  if (!semester) {
    return;
  }

  expandTreeNode("year", semester.yearGroup, false);
  expandTreeNode("semester", semester.id, false);

  if (persist) {
    saveCollapsedTreeState();
  }
}

function expandSelectedTreePath(persist = true) {
  if (selectedCourseId) {
    const course = findCourse(selectedCourseId);
    expandSemesterPath(course?.semesterId, persist);
    return;
  }

  if (selectedSemesterId) {
    expandSemesterPath(selectedSemesterId, persist);
  }
}

function renderHome() {
  resetDocumentState();
  selectedCourseId = null;
  selectedSemesterId = null;
  syncQuery({});

  const courses = getAllCourses();
  const completedCourses = courses.filter((course) => course.semesterStatus === "completed");
  const convertedCourses = courses.filter((course) => course.documentStatus === "converted");
  const categoryEntries = getCategoryEntries(courses);
  const yearGroups = groupSemestersByYear();

  currentPath.textContent = `${APP_NAME} / Home`;
  pageTitle.textContent = APP_NAME;
  document.title = APP_NAME;

  contentView.innerHTML = `
    <section class="home-overview" aria-label="전체 학습 아카이브 요약">
      <div class="home-hero">
        <div>
          <p class="section-label">Course Knowledge Map</p>
          <h2>새내기부터 헌내기까지</h2>
          <p>
            수강 과목, 전공 축, 변환된 문서 상태를 한 화면에서 확인하고
            각 학기나 과목으로 바로 들어갈 수 있습니다.
          </p>
        </div>
        <div class="home-scoreboard" aria-label="전체 아카이브 현황">
          ${renderStat("등록 과목", `${courses.length}개`)}
          ${renderStat("완료 과목", `${completedCourses.length}개`)}
          ${renderStat("HTML 문서", `${convertedCourses.length}개`)}
        </div>
      </div>

      <section class="home-section" aria-labelledby="home-learning-map">
        <div class="section-head">
          <div>
            <p class="section-label">Semester Map</p>
            <h3 id="home-learning-map">학기별로 배운 내용</h3>
          </div>
        </div>
        <div class="semester-map">
          ${yearGroups.map(([yearGroup, semesters]) => `
            <section class="year-lane" aria-label="${escapeHtml(yearGroup)}">
              <h4>${escapeHtml(yearGroup)}</h4>
              <div class="semester-card-grid">
                ${semesters.map(renderHomeSemesterCard).join("")}
              </div>
            </section>
          `).join("")}
        </div>
      </section>

      <section class="home-section" aria-labelledby="home-category-map">
        <div class="section-head">
          <div>
            <p class="section-label">Knowledge Areas</p>
            <h3 id="home-category-map">학습 영역 분포</h3>
          </div>
        </div>
        <div class="category-map">
          ${categoryEntries.map(([category, count]) => `
            <div class="category-tile">
              <span>${escapeHtml(category)}</span>
              <strong>${count}개 과목</strong>
            </div>
          `).join("")}
        </div>
      </section>
    </section>
  `;
}

function setupSidebarResizer() {
  if (!sidebarResizer) {
    return;
  }

  const savedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  setSidebarWidth(Number.isFinite(savedWidth) ? savedWidth : DEFAULT_SIDEBAR_WIDTH, false);

  let startX = 0;
  let startWidth = 0;

  const handlePointerMove = (event) => {
    const nextWidth = startWidth + event.clientX - startX;
    setSidebarWidth(nextWidth);
  };

  const stopResize = () => {
    document.body.classList.remove("is-resizing-sidebar");
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopResize);
  };

  sidebarResizer.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startWidth = getCurrentSidebarWidth();
    document.body.classList.add("is-resizing-sidebar");
    sidebarResizer.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  });

  sidebarResizer.addEventListener("dblclick", () => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
  });

  sidebarResizer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setSidebarWidth(getCurrentSidebarWidth() + (event.key === "ArrowRight" ? 24 : -24));
    }

    if (event.key === "Home") {
      event.preventDefault();
      setSidebarWidth(MIN_SIDEBAR_WIDTH);
    }

    if (event.key === "End") {
      event.preventDefault();
      setSidebarWidth(getMaxSidebarWidth());
    }
  });
}

function setupSidebarVisibility() {
  if (!sidebarVisibilityToggle || !appShell) {
    return;
  }

  const savedValue = localStorage.getItem(SIDEBAR_VISIBILITY_KEY);
  setSidebarVisible(savedValue !== "hidden", false);

  sidebarVisibilityToggle.addEventListener("click", () => {
    setSidebarVisible(appShell.classList.contains("is-sidebar-hidden"));
  });
}

function setupSearchForms() {
  document.querySelectorAll("[data-search-form]").forEach((form) => {
    const input = form.querySelector('input[name="q"]');

    if (searchPageMode === form.dataset.searchForm && input) {
      input.value = getCurrentSearchQuery();
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      navigateToSearchPage(form, input?.value || "");
    });
  });
}

function navigateToSearchPage(form, rawQuery) {
  const url = new URL(form.getAttribute("action") || "./course-search.html", window.location.href);
  const query = rawQuery.trim();

  if (query) {
    url.searchParams.set("q", query);
  } else {
    url.searchParams.delete("q");
  }

  window.location.assign(url.href);
}

function getCurrentSearchQuery() {
  return new URLSearchParams(window.location.search).get("q") || "";
}

function setSidebarVisible(isVisible, persist = true) {
  if (!sidebarVisibilityToggle || !appShell) {
    return;
  }

  appShell.classList.toggle("is-sidebar-hidden", !isVisible);
  sidebarVisibilityToggle.setAttribute("aria-expanded", String(isVisible));
  sidebarVisibilityToggle.setAttribute("aria-label", isVisible ? "트리 숨기기" : "트리 펼치기");
  sidebarVisibilityToggle.title = isVisible ? "트리 숨기기" : "트리 펼치기";
  sidebarVisibilityToggle.querySelector("span").textContent = isVisible ? "<" : ">";

  if (persist) {
    localStorage.setItem(SIDEBAR_VISIBILITY_KEY, isVisible ? "visible" : "hidden");
  }
}

function getCurrentSidebarWidth() {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width")) ||
    DEFAULT_SIDEBAR_WIDTH;
}

function getMaxSidebarWidth() {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - 520));
}

function setSidebarWidth(width, persist = true) {
  const nextWidth = Math.round(Math.min(getMaxSidebarWidth(), Math.max(MIN_SIDEBAR_WIDTH, width)));
  document.documentElement.style.setProperty("--sidebar-width", `${nextWidth}px`);
  sidebarResizer?.setAttribute("aria-valuenow", String(nextWidth));
  sidebarResizer?.setAttribute("aria-valuemax", String(Math.round(getMaxSidebarWidth())));

  if (persist) {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth));
  }
}

function renderHomeSemesterCard(semester) {
  const credits = semester.courses.reduce((sum, course) => sum + Number(course.credits || 0), 0);
  const converted = semester.courses.filter((course) => course.documentStatus === "converted").length;
  const categories = getCategoryEntries(semester.courses).slice(0, 4);
  const focus = getSemesterFocus(semester.id);
  const featuredCourses = semester.courses.slice(0, 7);

  return `
    <article class="semester-card">
      <button class="semester-card-main" type="button" data-semester-id="${semester.id}">
        <span class="semester-card-term">${escapeHtml(semester.schoolTerm)}</span>
        <strong>${escapeHtml(semester.label)}</strong>
        <span class="semester-card-focus">${escapeHtml(focus)}</span>
      </button>
      <div class="semester-card-meta">
        <span>${semester.courses.length}과목</span>
        <span>${formatCredits(credits)}학점</span>
        <span>문서 ${converted}/${semester.courses.length}</span>
      </div>
      <div class="category-pills">
        ${categories.map(([category, count]) => `
          <span>${escapeHtml(category)} ${count}</span>
        `).join("")}
      </div>
      <div class="course-chip-list">
        ${featuredCourses.map((course) => `
          <button type="button" data-course-id="${course.id}">
            ${escapeHtml(getCourseDisplayTitle(course))}
          </button>
        `).join("")}
      </div>
    </article>
  `;
}

function getCategoryEntries(courses) {
  const counts = new Map();

  courses.forEach((course) => {
    const category = course.category || "미분류";
    counts.set(category, (counts.get(category) || 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}

function getSemesterFocus(id) {
  const focusBySemester = {
    "y1-s1": "프로그래밍 입문, 창의적 문제 해결, 콘텐츠/예술공학 기초",
    "y1-s2": "객체지향, 오픈소스, 수학/문학/영어 기반 교양 확장",
    "y2-s1": "산업보안 기초, 보안 범죄, 정보보안론, 컴퓨터 시스템 기초",
    "y2-s2": "프로그래밍 언어, 네트워크, 개인정보 보호, 데이터 분석",
    "y3-s1": "알고리즘과 자료구조, 산업보안법, 기술경영, 보안 포렌식",
    "y3-s2": "운영체제, 인공지능, Python/Open Source, 보안 커뮤니케이션",
    seasonal: "입학 전 SW 사고, AI와 법, 언어/문화/교양 보강"
  };

  return focusBySemester[id] || "수강 과목 기반 학습 기록";
}

function getCourseEmoji(course) {
  return COURSE_EMOJIS[course.id] || "📘";
}

function getCourseDisplayTitle(course) {
  return `${getCourseEmoji(course)} ${course.title}`;
}

function isEmbeddedCoursePage() {
  return Boolean(embeddedCourseId);
}

function getAppRootPrefix() {
  return document.body?.dataset.rootPrefix || (isEmbeddedCoursePage() ? "../../../../" : "./");
}

function getRootHref(params = {}) {
  const rootUrl = new URL(`${getAppRootPrefix()}index.html`, window.location.href);

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      rootUrl.searchParams.set(key, value);
    }
  });

  return rootUrl.href;
}

function resolveArchiveUrl(path) {
  const value = String(path || "");

  if (/^(?:[a-z]+:|\/)/i.test(value)) {
    return value;
  }

  return `${getAppRootPrefix()}${value}`;
}

function getCoursePageHref(course, documentSearchQuery = null, pageNumber = null) {
  const url = new URL(encodeURI(resolveArchiveUrl(course.folderPath)), window.location.href);

  if (documentSearchQuery) {
    url.searchParams.set("docSearch", documentSearchQuery);
  }

  if (pageNumber) {
    url.searchParams.set("page", String(pageNumber));
  }

  return url.href;
}

function getAdjacentCourses(course) {
  const courses = getAllCourses();
  const index = courses.findIndex((entry) => entry.id === course.id);

  return {
    previous: index > 0 ? courses[index - 1] : null,
    next: index >= 0 && index < courses.length - 1 ? courses[index + 1] : null
  };
}

function renderCoursePageNavigation(course) {
  const { previous, next } = getAdjacentCourses(course);

  return `
    <nav class="course-page-nav" aria-label="과목 웹페이지 이동">
      ${renderCoursePageNavItem("이전 웹페이지", previous)}
      ${renderCoursePageNavItem("다음 웹페이지", next)}
    </nav>
  `;
}

function renderCoursePageNavItem(label, course) {
  if (!course) {
    return `<span class="course-page-nav-item is-disabled">${escapeHtml(label)}</span>`;
  }

  return `
    <a class="course-page-nav-item" href="${escapeHtml(getCoursePageHref(course))}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(getCourseDisplayTitle(course))}</strong>
    </a>
  `;
}

function renderSemester(semester) {
  resetDocumentState();

  if (isEmbeddedCoursePage()) {
    window.location.assign(getRootHref({ semester: semester.id }));
    return;
  }

  selectedCourseId = null;
  selectedSemesterId = semester.id;
  syncQuery({ semester: semester.id });
  renderTree();

  const credits = semester.courses.reduce((sum, course) => sum + Number(course.credits || 0), 0);
  const converted = semester.courses.filter((course) => course.documentStatus === "converted").length;

  currentPath.textContent = `${APP_NAME} / ${semester.yearGroup} / ${semester.label}`;
  pageTitle.textContent = semester.label;
  document.title = `${semester.label} - ${APP_NAME}`;

  contentView.innerHTML = `
    <section class="semester-overview">
      <div class="section-head">
        <div>
          <p class="section-label">${escapeHtml(semester.schoolTerm)}</p>
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
        <strong>${escapeHtml(getCourseDisplayTitle(course))}</strong>
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
  syncQuery(isEmbeddedCoursePage()
    ? { docSearch: initialDocumentSearch, page: initialDocumentPage }
    : { course: course.id, docSearch: initialDocumentSearch, page: initialDocumentPage });
  renderTree();

  const courseDisplayTitle = getCourseDisplayTitle(course);

  currentPath.textContent = `${APP_NAME} / ${course.yearGroup} / ${course.semesterLabel} / ${courseDisplayTitle}`;
  pageTitle.textContent = courseDisplayTitle;
  document.title = `${courseDisplayTitle} - ${APP_NAME}`;

  contentView.innerHTML = `
    <article class="course-detail">
      <header class="course-detail-head">
        <div>
          <p class="section-label">${escapeHtml(course.semesterLabel)} · ${escapeHtml(course.schoolTerm)}</p>
        </div>
        <div class="course-detail-actions">
          ${renderDocumentBadge(course.documentStatus)}
          ${renderCoursePageNavigation(course)}
        </div>
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
      const manifestUrl = `${resolveArchiveUrl(course.html.manifestPath)}?v=${ASSET_VERSION}`;
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
        <div class="document-view-controls" aria-label="문서 보기 옵션">
          <button
            type="button"
            data-doc-view-toggle="viewfinder"
            aria-pressed="true"
            aria-label="썸네일 뷰파인더 끄기"
            title="썸네일 뷰파인더 끄기"
          >
            <span aria-hidden="true">뷰파인더</span>
          </button>
          <button
            type="button"
            data-doc-view-toggle="search"
            aria-pressed="true"
            aria-label="문서 검색 플로팅 끄기"
            title="문서 검색 플로팅 끄기"
          >
            <span aria-hidden="true">⌕</span>
          </button>
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
        <div class="document-viewer">
          <aside class="page-viewfinder" aria-label="페이지 미리보기">
            ${manifest.pages.map((page, index) => renderPageThumbnail(course, page, index, manifest.pageCount)).join("")}
          </aside>
          <div class="html-pages">
            ${manifest.pages.map((page, index) => renderHtmlPage(course, page, index, manifest.pageCount)).join("")}
          </div>
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
      setupPageViewfinder();
      applyDocumentViewPreferences();
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
  const src = `${resolveArchiveUrl(`${course.html.assetBase}/${page.image}`)}?v=${ASSET_VERSION}`;

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

function renderPageThumbnail(course, page, index, pageCount) {
  const src = `${resolveArchiveUrl(`${course.html.assetBase}/${page.image}`)}?v=${ASSET_VERSION}`;

  return `
    <button
      class="page-thumbnail${index === 0 ? " is-active" : ""}"
      type="button"
      data-doc-page="${page.pageNumber}"
      aria-label="${escapeHtml(`${index + 1} / ${pageCount} 페이지로 이동`)}"
      aria-current="${index === 0 ? "page" : "false"}"
    >
      <img src="${escapeHtml(src)}" alt="" loading="${index < 4 ? "eager" : "lazy"}">
      <span>${index + 1}</span>
    </button>
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

function setupPageViewfinder() {
  disconnectDocumentPageObserver();

  const firstPage = documentPages[0];

  if (firstPage) {
    setActivePageThumbnail(firstPage.pageNumber);
  }

  if (!("IntersectionObserver" in window)) {
    return;
  }

  documentPageObserver = new IntersectionObserver((entries) => {
    const visibleEntries = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

    if (visibleEntries.length === 0) {
      return;
    }

    setActivePageThumbnail(Number(visibleEntries[0].target.dataset.pageNumber));
  }, {
    root: null,
    rootMargin: "-18% 0px -56% 0px",
    threshold: [0.08, 0.2, 0.45, 0.7]
  });

  documentPages.forEach((page) => {
    if (page.element) {
      documentPageObserver.observe(page.element);
    }
  });
}

function applyDocumentViewPreferences() {
  setDocumentSearchVisible(localStorage.getItem(DOCUMENT_SEARCH_VISIBILITY_KEY) !== "hidden", false);
  setPageViewfinderVisible(localStorage.getItem(PAGE_VIEWFINDER_VISIBILITY_KEY) !== "hidden", false);
}

function toggleDocumentViewPanel(panel) {
  if (panel === "search") {
    const isCurrentlyVisible = !document.querySelector("#document-body")?.classList.contains("is-document-search-hidden");
    setDocumentSearchVisible(!isCurrentlyVisible);
  }

  if (panel === "viewfinder") {
    const isCurrentlyVisible = !document.querySelector("#document-body")?.classList.contains("is-viewfinder-hidden");
    setPageViewfinderVisible(!isCurrentlyVisible);
  }
}

function setDocumentSearchVisible(isVisible, persist = true) {
  const body = document.querySelector("#document-body");
  const button = document.querySelector('[data-doc-view-toggle="search"]');

  if (!body || !button) {
    return;
  }

  body.classList.toggle("is-document-search-hidden", !isVisible);
  button.classList.toggle("is-off", !isVisible);
  button.setAttribute("aria-pressed", String(isVisible));
  button.setAttribute("aria-label", isVisible ? "문서 검색 플로팅 끄기" : "문서 검색 플로팅 켜기");
  button.title = isVisible ? "문서 검색 플로팅 끄기" : "문서 검색 플로팅 켜기";

  if (persist) {
    localStorage.setItem(DOCUMENT_SEARCH_VISIBILITY_KEY, isVisible ? "visible" : "hidden");
  }
}

function setPageViewfinderVisible(isVisible, persist = true) {
  const body = document.querySelector("#document-body");
  const button = document.querySelector('[data-doc-view-toggle="viewfinder"]');

  if (!body || !button) {
    return;
  }

  body.classList.toggle("is-viewfinder-hidden", !isVisible);
  button.classList.toggle("is-off", !isVisible);
  button.setAttribute("aria-pressed", String(isVisible));
  button.setAttribute("aria-label", isVisible ? "썸네일 뷰파인더 끄기" : "썸네일 뷰파인더 켜기");
  button.title = isVisible ? "썸네일 뷰파인더 끄기" : "썸네일 뷰파인더 켜기";

  if (persist) {
    localStorage.setItem(PAGE_VIEWFINDER_VISIBILITY_KEY, isVisible ? "visible" : "hidden");
  }
}

function setActivePageThumbnail(pageNumber) {
  document.querySelectorAll(".page-thumbnail").forEach((button) => {
    const active = Number(button.dataset.docPage) === pageNumber;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");

    if (active) {
      button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  });
}

function scrollDocumentPageIntoView(pageNumber) {
  const page = documentPages.find((entry) => entry.pageNumber === pageNumber);

  if (!page?.element) {
    return;
  }

  page.element.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
  setActivePageThumbnail(pageNumber);
}

function disconnectDocumentPageObserver() {
  if (documentPageObserver) {
    documentPageObserver.disconnect();
    documentPageObserver = null;
  }
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

  if (!input) {
    if (initialDocumentPage) {
      scrollDocumentPageIntoView(initialDocumentPage);
      initialDocumentPage = null;
    }

    return;
  }

  if (initialDocumentSearch) {
    input.value = initialDocumentSearch;
    handleDocumentSearch(initialDocumentSearch);
  }

  if (initialDocumentPage) {
    const requestedPage = initialDocumentPage;
    const pageMatchIndex = documentMatches.findIndex((match) => match.pageNumber === requestedPage);

    if (pageMatchIndex >= 0) {
      documentMatchIndex = pageMatchIndex;
      revealDocumentMatch(documentMatchIndex);
      updateDocumentSearchUi();
    } else {
      scrollDocumentPageIntoView(requestedPage);
    }

    window.setTimeout(() => {
      if (pageMatchIndex >= 0) {
        revealDocumentMatch(pageMatchIndex);
      } else {
        scrollDocumentPageIntoView(requestedPage);
      }
    }, 900);
  }

  initialDocumentSearch = null;
  initialDocumentPage = null;
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
  setActivePageThumbnail(page.pageNumber);
  updateActiveDocumentHighlight();

  const activeHighlight = page.element.querySelector(
    `.html-search-highlight[data-match-index="${index}"]`
  );
  const scrollTarget = activeHighlight || page.element;
  const scrollToMatch = (behavior = "smooth") => {
    scrollTarget.scrollIntoView({ behavior, block: "center", inline: "nearest" });
    setActivePageThumbnail(page.pageNumber);
  };

  scrollToMatch();
  window.setTimeout(() => scrollToMatch("auto"), 300);
  window.setTimeout(() => scrollToMatch("auto"), 900);
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
  disconnectDocumentPageObserver();
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
  expandSemesterPath(id);
  render();
}

function selectHome() {
  if (isEmbeddedCoursePage()) {
    window.location.assign(getRootHref());
    return;
  }

  selectedSemesterId = null;
  selectedCourseId = null;
  initialDocumentSearch = null;
  initialDocumentPage = null;
  searchInput.value = "";
  if (globalSearchInput) {
    globalSearchInput.value = "";
  }
  render();
}

function selectCourse(id, documentSearchQuery = null, pageNumber = null) {
  const course = findCourse(id);

  if (!course) {
    return;
  }

  window.location.assign(getCoursePageHref(course, documentSearchQuery, pageNumber));
}

function renderCourseSearchPage(rawQuery) {
  resetDocumentState();
  selectedCourseId = null;
  selectedSemesterId = null;

  if (searchResults) {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
  }

  currentPath.textContent = `${APP_NAME} / Search / Course`;
  pageTitle.textContent = "과목 검색";
  document.title = `과목 검색 - ${APP_NAME}`;

  const matches = getCourseSearchMatches(rawQuery);
  contentView.innerHTML = `
    <section class="search-page" aria-label="과목 검색 결과">
      <div class="search-page-head">
        <div>
          <p class="section-label">Course Search</p>
          <h2>${rawQuery.trim() ? `"${escapeHtml(rawQuery.trim())}" 검색 결과` : "과목 검색"}</h2>
        </div>
        <span>${rawQuery.trim() ? `${matches.length}개 결과` : "검색어 필요"}</span>
      </div>
      ${rawQuery.trim() ? `
        <div class="result-list">
          ${matches.map(renderCourseSearchResult).join("") || `<p class="no-results">일치하는 과목이 없습니다.</p>`}
        </div>
      ` : `
        <p class="search-page-empty">왼쪽의 과목 검색창에 검색어를 입력하고 돋보기 버튼을 누르거나 Enter를 누르세요.</p>
      `}
    </section>
  `;
}

function getCourseSearchMatches(rawQuery) {
  const query = rawQuery.trim().toLowerCase();

  if (!query) {
    return [];
  }

  return getAllCourses().filter((course) => {
    const haystack = [
      course.title,
      course.code,
      course.category,
      course.professor,
      course.semesterLabel
    ].filter(Boolean).join(" ").toLowerCase();

    return haystack.includes(query);
  });
}

function renderCourseSearchResult(course) {
  return `
    <button type="button" data-course-id="${course.id}">
      <strong>${escapeHtml(getCourseDisplayTitle(course))}</strong>
      <span>${escapeHtml(course.semesterLabel)} · ${escapeHtml(course.category || "-")} · ${escapeHtml(course.code || "-")}</span>
    </button>
  `;
}

async function renderGlobalSearchPage(rawQuery) {
  resetDocumentState();
  selectedCourseId = null;
  selectedSemesterId = null;

  if (searchResults) {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
  }

  currentPath.textContent = `${APP_NAME} / Search / Global`;
  pageTitle.textContent = "통합검색";
  document.title = `통합검색 - ${APP_NAME}`;

  const query = normalizeText(rawQuery);

  if (!query) {
    contentView.innerHTML = `
      <section class="search-page" aria-label="통합검색 결과">
        <div class="search-page-head">
          <div>
            <p class="section-label">Global Search</p>
            <h2>통합검색</h2>
          </div>
          <span>검색어 필요</span>
        </div>
        <p class="search-page-empty">왼쪽의 통합검색창에 검색어를 입력하고 돋보기 버튼을 누르거나 Enter를 누르세요.</p>
      </section>
    `;
    return;
  }

  contentView.innerHTML = `
    <section class="search-page" aria-label="통합검색 결과">
      <div class="search-page-head">
        <div>
          <p class="section-label">Global Search</p>
          <h2>"${escapeHtml(rawQuery.trim())}" 검색 결과</h2>
        </div>
        <span>검색 중</span>
      </div>
      <div class="search-page-loading">모든 과목 문서를 검색할 수 있도록 불러오는 중입니다.</div>
    </section>
  `;

  try {
    const index = await getGlobalSearchIndex();

    const matches = [];
    let totalOccurrenceCount = 0;

    index.forEach((entry) => {
      let fromIndex = 0;
      let firstFoundAt = -1;
      let occurrenceCount = 0;

      while (fromIndex < entry.searchText.length) {
        const foundAt = entry.searchText.indexOf(query, fromIndex);

        if (foundAt === -1) {
          break;
        }

        if (firstFoundAt === -1) {
          firstFoundAt = foundAt;
        }

        occurrenceCount += 1;
        fromIndex = foundAt + Math.max(1, query.length);
      }

      if (occurrenceCount > 0) {
        totalOccurrenceCount += occurrenceCount;

        if (matches.length < MAX_GLOBAL_SEARCH_RESULTS) {
          matches.push({
            ...entry,
            start: firstFoundAt,
            end: firstFoundAt + query.length,
            occurrenceCount,
            snippet: buildGlobalSearchSnippet(entry.text, rawQuery)
          });
        }
      }
    });

    contentView.innerHTML = renderGlobalSearchResultsHtml(rawQuery, matches, totalOccurrenceCount);
  } catch (error) {
    contentView.innerHTML = `
      <section class="search-page" aria-label="통합검색 오류">
        <div class="search-page-head">
          <div>
            <p class="section-label">Global Search</p>
            <h2>통합검색을 사용할 수 없습니다.</h2>
          </div>
          <span>${escapeHtml(rawQuery)}</span>
        </div>
        <p class="no-results">${escapeHtml(error.message)}</p>
      </section>
    `;
  }
}

async function getGlobalSearchIndex() {
  if (!globalSearchIndexPromise) {
    globalSearchIndexPromise = buildGlobalSearchIndex();
  }

  globalSearchIndex = await globalSearchIndexPromise;
  return globalSearchIndex;
}

async function buildGlobalSearchIndex() {
  const convertedCourses = getAllCourses().filter((course) => course.html?.type === "imageManifest");
  const manifests = await Promise.allSettled(
    convertedCourses.map(async (course) => {
      const response = await fetch(`${resolveArchiveUrl(course.html.manifestPath)}?v=${ASSET_VERSION}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`${course.title} manifest를 불러오지 못했습니다.`);
      }

      return {
        course,
        manifest: await response.json()
      };
    })
  );

  return manifests.flatMap((result) => {
    if (result.status !== "fulfilled") {
      return [];
    }

    const { course, manifest } = result.value;

    return (manifest.pages || [])
      .map((page, index) => {
        const text = compactText(page.text || "");

        return {
          course,
          pageNumber: page.pageNumber,
          pageIndex: index + 1,
          text,
          searchText: normalizeText(text)
        };
      })
      .filter((entry) => entry.searchText);
  });
}

function renderGlobalSearchResultsHtml(rawQuery, matches, totalOccurrenceCount = matches.length) {
  return `
    <section class="search-page" aria-label="통합검색 결과">
      <div class="search-page-head">
        <div>
          <p class="section-label">Global Search</p>
          <h2>"${escapeHtml(rawQuery.trim())}" 검색 결과</h2>
        </div>
        <span>${matches.length}개 페이지 · ${totalOccurrenceCount}회 발견</span>
      </div>
    <div class="result-list global-result-list">
      ${matches.map((match) => `
        <button
          type="button"
          data-global-course-id="${escapeHtml(match.course.id)}"
          data-page-number="${match.pageNumber}"
          data-query="${escapeHtml(rawQuery)}"
        >
          <span>
            <strong>${escapeHtml(getCourseDisplayTitle(match.course))}</strong>
            <small>${escapeHtml(match.course.semesterLabel)} · 문서 ${match.pageNumber}페이지로 이동 · ${match.occurrenceCount}회 발견</small>
            <em>${renderGlobalSearchSnippet(match.snippet, rawQuery)}</em>
          </span>
        </button>
      `).join("") || `<p class="no-results">모든 문서에서 일치하는 결과가 없습니다.</p>`}
    </div>
    </section>
  `;
}

function buildGlobalSearchSnippet(pageText, rawQuery) {
  const text = compactText(pageText);
  const lowerText = text.toLowerCase();
  const lowerQuery = compactText(rawQuery).toLowerCase();
  const foundAt = lowerQuery ? lowerText.indexOf(lowerQuery) : -1;
  const start = Math.max(0, (foundAt === -1 ? 0 : foundAt) - 48);
  const end = Math.min(text.length, (foundAt === -1 ? 140 : foundAt + lowerQuery.length + 72));

  return `${start > 0 ? "... " : ""}${text.slice(start, end)}${end < text.length ? " ..." : ""}`;
}

function renderGlobalSearchSnippet(snippet, rawQuery) {
  const query = compactText(rawQuery);

  if (!query) {
    return escapeHtml(snippet);
  }

  const index = snippet.toLowerCase().indexOf(query.toLowerCase());

  if (index === -1) {
    return escapeHtml(snippet);
  }

  return `
    ${escapeHtml(snippet.slice(0, index))}
    <mark>${escapeHtml(snippet.slice(index, index + query.length))}</mark>
    ${escapeHtml(snippet.slice(index + query.length))}
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
