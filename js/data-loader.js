const SEMESTERS = [
  { year: 1, semester: 1 },
  { year: 1, semester: 2 },
  { year: 2, semester: 1 },
  { year: 2, semester: 2 },
  { year: 3, semester: 1 },
  { year: 3, semester: 2 },
];

export async function loadCourses() {
  const dataUrl = new URL("../data/courses.json", import.meta.url);
  const response = await fetch(dataUrl);

  if (!response.ok) {
    throw new Error(`자료 목록을 불러오지 못했습니다. (${response.status})`);
  }

  const rawData = await response.json();
  const courses = Array.isArray(rawData) ? rawData : rawData.courses;

  if (!Array.isArray(courses)) {
    throw new Error("자료 목록 형식이 올바르지 않습니다.");
  }

  return courses.filter((course) => !course.status || course.status === "published");
}

export function getSemesterBlueprint() {
  return SEMESTERS.map((entry) => ({ ...entry }));
}

export function getSemesterLabel(year, semester) {
  return `${year}학년 ${semester}학기`;
}

export function getSemesterKey(year, semester) {
  return `${year}-${semester}`;
}

export function groupCoursesBySemester(courses) {
  return courses.reduce((grouped, course) => {
    const key = getSemesterKey(course.year, course.semester);

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(course);
    return grouped;
  }, new Map());
}

export function getLoadErrorMessage(error) {
  const details =
    window.location.protocol === "file:"
      ? "브라우저에서 파일을 직접 열면 JSON을 불러오지 못할 수 있습니다. README의 로컬 서버 실행 방법 또는 GitHub Pages 배포 방식을 사용하세요."
      : error.message;

  return `자료를 표시할 수 없습니다. ${details}`;
}
