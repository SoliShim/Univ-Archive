import {
  getLoadErrorMessage,
  getSemesterBlueprint,
  getSemesterKey,
  getSemesterLabel,
  groupCoursesBySemester,
  loadCourses,
} from "./data-loader.js";

const statusMessage = document.querySelector("#status-message");
const semesterTree = document.querySelector("#semester-tree");

async function init() {
  try {
    const courses = await loadCourses();
    renderArchive(courses);
  } catch (error) {
    showError(error);
  }
}

function renderArchive(courses) {
  const groupedCourses = groupCoursesBySemester(courses);
  const years = new Map();

  getSemesterBlueprint().forEach((semesterInfo) => {
    const { year, semester } = semesterInfo;

    if (!years.has(year)) {
      years.set(year, []);
    }

    years.get(year).push({
      year,
      semester,
      courses: groupedCourses.get(getSemesterKey(year, semester)) ?? [],
    });
  });

  semesterTree.innerHTML = "";

  years.forEach((semesters, year) => {
    const yearCard = document.createElement("section");
    yearCard.className = "year-card";

    const title = document.createElement("h3");
    title.textContent = `${year}학년`;

    const semesterList = document.createElement("div");
    semesterList.className = "semester-list";

    semesters.forEach((semesterInfo) => {
      semesterList.append(createSemesterCard(semesterInfo));
    });

    yearCard.append(title, semesterList);
    semesterTree.append(yearCard);
  });

  statusMessage.hidden = true;
  semesterTree.hidden = false;
}

function createSemesterCard({ year, semester, courses }) {
  const section = document.createElement("section");
  section.className = "semester-card";

  const heading = document.createElement("h4");
  heading.textContent = getSemesterLabel(year, semester);

  const caption = document.createElement("p");
  caption.className = "semester-caption";
  caption.textContent =
    courses.length > 0
      ? `${courses.length}개의 자료가 등록되어 있습니다.`
      : "아직 등록된 자료가 없습니다.";

  const courseList = document.createElement("div");
  courseList.className = "course-list";

  if (courses.length === 0) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "empty-card";

    const emptyText = document.createElement("p");
    emptyText.className = "empty-text";
    emptyText.textContent = "자료 추가 예정";

    emptyCard.append(emptyText);
    courseList.append(emptyCard);
  } else {
    courses
      .slice()
      .sort((left, right) => left.title.localeCompare(right.title, "ko"))
      .forEach((course) => {
        courseList.append(createCourseCard(course));
      });
  }

  section.append(heading, caption, courseList);
  return section;
}

function createCourseCard(course) {
  const link = document.createElement("a");
  link.className = "course-card";
  link.href = `./course.html?id=${encodeURIComponent(course.id)}&view=html`;
  link.setAttribute("aria-label", `${course.title} 자료 보기`);

  const title = document.createElement("span");
  title.className = "course-title";
  title.textContent = course.displayTitle || course.title;

  const subtitle = document.createElement("span");
  subtitle.className = "course-subtitle";
  subtitle.textContent = course.notes || "PDF 원본 보기";

  link.append(title, subtitle);
  return link;
}

function showError(error) {
  statusMessage.hidden = false;
  statusMessage.classList.add("is-error");
  statusMessage.textContent = getLoadErrorMessage(error);
  semesterTree.hidden = true;
}

init();
