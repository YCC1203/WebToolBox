
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const pages = [
  "index.html",
  "tools/qr.html",
  "tools/password.html",
  "tools/text.html",
  "tools/json.html",
  "tools/resize.html",
  "tools/convert.html",
  "tools/compress.html",
  "tools/crop.html",
  "tools/watermark.html",
  "tools/stitch.html",
  "tools/composer.html",
  "tools/pdf.html"
];

let passed = 0;
let failed = 0;

for (const page of pages) {
  const fullPath = path.join(root, page);

  if (!fs.existsSync(fullPath)) {
    console.error(`✗ 找不到頁面：${page}`);
    failed++;
    continue;
  }

  const html = fs.readFileSync(fullPath, "utf8");

  const references = [
    ...html.matchAll(
      /(?:src|href)\s*=\s*["']([^"']+)["']/gi
    )
  ];

  for (const [, reference] of references) {
    if (
      !reference.startsWith("./") &&
      !reference.startsWith("../")
    ) {
      continue;
    }

    const cleanPath = reference.split(/[?#]/)[0];
    const target = path.resolve(
      path.dirname(fullPath),
      cleanPath
    );

    if (!fs.existsSync(target)) {
      console.error(
        `✗ ${page} 引用不存在的檔案：${reference}`
      );
      failed++;
    } else {
      passed++;
    }
  }

  console.log(`✓ 已檢查 ${page}`);
}

console.log("\n檢查結果");
console.log(`有效的本機引用：${passed}`);
console.log(`錯誤數量：${failed}`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("✓ 基本網站檔案檢查通過");
}
