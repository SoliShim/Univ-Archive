const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const COURSES_PATH = path.join(ROOT, "data", "courses.json");
const OUTPUT_ROOT = path.join(ROOT, "assets", "encrypted");
const ITERATIONS = 310000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

const password = process.env.ARCHIVE_PASSWORD;

if (!password || password.length < 12) {
  console.error("ARCHIVE_PASSWORD 환경변수에 12자 이상의 비밀번호를 넣어 실행하세요.");
  process.exit(1);
}

const archive = JSON.parse(fs.readFileSync(COURSES_PATH, "utf8"));
let encryptedCount = 0;

for (const semester of archive.semesters) {
  for (const course of semester.courses) {
    if (course.html?.type !== "imageManifest") {
      delete course.sourcePdf;
      delete course.sourcePdfs;
      continue;
    }

    const manifestPath = path.join(ROOT, course.html.manifestPath);
    const assetBase = path.join(ROOT, course.html.assetBase);

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`manifest를 찾을 수 없습니다: ${course.html.manifestPath}`);
    }

    const manifest = sanitizeManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
    const files = {};

    for (const page of manifest.pages) {
      const imagePath = path.join(assetBase, page.image);

      if (!fs.existsSync(imagePath)) {
        throw new Error(`페이지 이미지를 찾을 수 없습니다: ${imagePath}`);
      }

      files[page.image] = {
        mime: getMimeType(imagePath),
        data: fs.readFileSync(imagePath).toString("base64")
      };
    }

    const payload = {
      version: 1,
      courseId: course.id,
      title: course.title,
      semesterLabel: semester.label,
      manifest,
      files
    };

    const semesterFolder = toFolderSlug(semester.label);
    const outputDir = path.join(OUTPUT_ROOT, semesterFolder);
    const outputPath = path.join(outputDir, `${course.id}.archive.enc`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(encryptPayload(payload), null, 2));

    course.html = {
      type: "encryptedArchive",
      archivePath: path.relative(ROOT, outputPath).split(path.sep).join("/"),
      format: "solis-archive-v1",
      encrypted: true
    };
    delete course.sourcePdf;
    delete course.sourcePdfs;
    encryptedCount += 1;
  }
}

fs.writeFileSync(COURSES_PATH, `${JSON.stringify(archive, null, 2)}\n`);
console.log(`Encrypted ${encryptedCount} course archives.`);

function encryptPayload(payload) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2",
    digest: "SHA-256",
    iterations: ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function sanitizeManifest(manifest) {
  const copy = {
    ...manifest,
    pages: manifest.pages.map((page) => {
      const pageCopy = { ...page };
      delete pageCopy.textFile;
      delete pageCopy.sourcePdf;
      delete pageCopy.sourcePageNumber;
      return pageCopy;
    })
  };

  delete copy.sourcePdf;
  delete copy.sourcePdfs;
  return copy;
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

function toFolderSlug(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .toLowerCase();
}
