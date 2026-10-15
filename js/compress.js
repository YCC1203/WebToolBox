
"use strict";

const $ = id => document.getElementById(id);

const fileInput = $("fileInput");
const dropZone = $("dropZone");
const imageList = $("imageList");
const fileCount = $("fileCount");
const sourceSize = $("sourceSize");

const outputMode = $("outputMode");
const quality = $("quality");
const qualityValue = $("qualityValue");
const minSaving = $("minSaving");

const compressBtn = $("compressBtn");
const downloadAll = $("downloadAll");
const clearAll = $("clearAll");
const progressFill = $("progressFill");
const statusText = $("status");

const summary = $("summary");
const totalBefore = $("totalBefore");
const totalAfter = $("totalAfter");
const totalSaved = $("totalSaved");

const modal = $("compareModal");
const beforePreview = $("beforePreview");
const afterPreview = $("afterPreview");
const closeCompare = $("closeCompare");

const MAX_FILES = 20;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 8192;

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

let images = [];
let busy = false;
let importing = false;
let lastFocused = null;

// ===== 通用工具 =====

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function message(text) {
  statusText.textContent = text;
}

function pause() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function outputName(item, index, type) {
  const base = item.file.name.replace(/\.[^.]+$/, "");
  return `${base}-compressed-${index + 1}.${TYPES[type]}`;
}

function releaseResults() {
  for (const item of images) {
    if (item.result?.previewUrl) {
      URL.revokeObjectURL(item.result.previewUrl);
    }
    item.result = null;
    item.error = null;
  }

  progressFill.style.width = "0%";
  summary.hidden = true;
}

function setBusy(value) {
  busy = value;

  [
    fileInput, clearAll, outputMode, quality, minSaving
  ].forEach(control => control.disabled = value);

  renderList();
}

// ===== 讀取與驗證圖片 =====

function readDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("圖片無法讀取"));
    };

    img.src = url;
  });
}

async function addFiles(files) {
  if (busy || importing) return;

  importing = true;
  compressBtn.disabled = true;

  let added = 0;
  let rejected = 0;

  try {
    for (const file of files) {
      if (images.length >= MAX_FILES ||
          !Object.hasOwn(TYPES, file.type) ||
          file.size === 0 ||
          file.size > MAX_BYTES) {
        rejected++;
        continue;
      }

      try {
        const { width, height } = await readDimensions(file);

        if (!width || !height ||
            width > MAX_SIDE ||
            height > MAX_SIDE ||
            width * height > MAX_PIXELS) {
          rejected++;
          continue;
        }

        images.push({
          file,
          width,
          height,
          previewUrl: URL.createObjectURL(file),
          result: null,
          error: null
        });

        added++;
      } catch {
        rejected++;
      }
    }

    releaseResults();

    message(
      `已加入 ${added} 張圖片` +
      (rejected ? `，略過 ${rejected} 張。` : "。")
    );
  } finally {
    importing = false;
    renderList();
  }
}

// ===== Canvas 編碼 =====

function canvasToBlob(canvas, type, q) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("圖片編碼失敗"));
        return;
      }

      if (blob.type !== type) {
        reject(new Error("瀏覽器不支援指定的格式"));
        return;
      }

      resolve(blob);
    }, type, q);
  });
}

// 最多三次品質試算，最低不低於滑桿設定。
// 已有較大檔案先試 98% 以減少重複編碼；已壓縮的小檔先試最低品質，
// 不符合節省門檻便直接保留原檔。每次皆以實際檔案大小驗證。
async function chooseLossyEncoding(canvas, type, floor, maxBytes, sourceBytes) {
  const lower = Math.max(0.5, Math.min(1, floor));
  const upper = Math.max(lower, 0.98);
  let encoded = 0;
  let best = null;
  let bestQuality = null;

  async function tryQuality(q) {
    const blob = await canvasToBlob(canvas, type, q);
    encoded++;
    // maxBytes 是原始大小扣除最低節省比例後的嚴格上限。
    if (blob.size < maxBytes) {
      best = blob;
      bestQuality = q;
      return true;
    }
    return false;
  }

  // A large source in relation to its pixels is frequently a high-quality
  // JPEG/WebP or a PNG being converted to WebP.  Such images can often be
  // saved directly at 98% quality.  Try that first to avoid a redundant low-
  // quality encode.  For already-small inputs, start at the quality floor:
  // if it cannot shrink, no second encode is needed.
  // This changes only probe order, not the candidate quality levels or the
  // three-encode upper bound of the existing algorithm.
  const bytesPerPixel = sourceBytes / (canvas.width * canvas.height);
  const preferHighFirst = bytesPerPixel >= (type === "image/jpeg" ? 0.8 : 0.5);

  if (upper - lower < 0.004) {
    await tryQuality(lower);
    return { blob: best, quality: bestQuality, attempts: encoded };
  }

  if (preferHighFirst) {
    if (await tryQuality(upper)) {
      return { blob: best, quality: bestQuality, attempts: encoded };
    }
    if (!(await tryQuality(lower))) {
      return { blob: null, quality: null, attempts: encoded };
    }
  } else {
    if (!(await tryQuality(lower))) {
      return { blob: null, quality: null, attempts: encoded };
    }
    if (await tryQuality(upper)) {
      return { blob: best, quality: bestQuality, attempts: encoded };
    }
  }

  const middle = Math.round(((lower + upper) / 2) * 1000) / 1000;
  if (upper - lower > 0.012) await tryQuality(middle);
  return { blob: best, quality: bestQuality, attempts: encoded };
}
// ===== 壓縮單張圖片 =====

async function compressImage(item, index) {
  const requestedType = outputMode.value === "webp"
    ? "image/webp"
    : item.file.type;

  const minimumQuality = Number(quality.value) / 100;
  const requiredSaving = Number(minSaving.value) / 100;
  const maxAcceptableSize =
    item.file.size * (1 - requiredSaving);

  const canvas = document.createElement("canvas");
  canvas.width = item.width;
  canvas.height = item.height;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("無法建立 Canvas");
  }

  let image = null;
  let best = null;
  let acceptedQuality = null;

  try {
    // 瀏覽器解碼圖片，保留自然顯示方向
    image = await createImageBitmap(item.file, {
      imageOrientation: "from-image"
    });

    if (image.width !== item.width ||
        image.height !== item.height) {
      throw new Error("圖片方向或解碼尺寸不一致");
    }

    // JPEG 必須使用不透明背景
    if (requestedType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    if (requestedType === "image/png") {
      // PNG 不使用有損品質參數
      const blob = await canvasToBlob(
        canvas, "image/png"
      );

      if (blob.size < item.file.size && blob.size <= maxAcceptableSize) {
        best = blob;
      }

    } else {
      const result = await chooseLossyEncoding(
        canvas, requestedType, minimumQuality, maxAcceptableSize, item.file.size
      );
      best = result.blob;
      acceptedQuality = result.quality;
    }

  } finally {
    if (image) image.close();
    canvas.width = 0;
    canvas.height = 0;
  }

  // 沒有符合節省門檻的結果：保留原始檔
  const retainedOriginal = !best;
  const blob = best || item.file;
  const type = retainedOriginal
    ? item.file.type
    : requestedType;

  const filename = retainedOriginal
    ? item.file.name
    : outputName(item, index, type);

  return {
    blob,
    type,
    filename,
    retainedOriginal,
    quality: acceptedQuality,
    width: item.width,
    height: item.height,
    previewUrl: retainedOriginal ? null : URL.createObjectURL(blob)
  };
}

// ===== UI 清單 =====

function makeButton(label, onClick, disabled) {
  const button = document.createElement("button");
  button.className = "image-download";
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

function renderList() {
  imageList.replaceChildren();

  if (!images.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "尚未上傳圖片。";
    imageList.appendChild(empty);
  }

  images.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "image-item";

    const thumbnail = document.createElement("img");
    thumbnail.className = "image-thumb";
    thumbnail.src = item.previewUrl;
    thumbnail.alt = item.file.name;

    const info = document.createElement("div");
    info.className = "image-info";

    const title = document.createElement("strong");
    title.className = "image-name";
    title.textContent = item.file.name;
    title.title = item.file.name;

    const original = document.createElement("div");
    original.className = "image-meta";
    original.textContent =
      `原始：${item.width} × ${item.height} | ` +
      formatBytes(item.file.size);

    const resultLine = document.createElement("div");
    resultLine.className = "image-result";

    if (item.error) {
      resultLine.style.color = "#ff9a9a";
      resultLine.textContent = item.error;

    } else if (item.result) {
      const result = item.result;
      const saved = item.file.size - result.blob.size;
      const percent = saved / item.file.size * 100;

      resultLine.textContent =
        `輸出：${result.width} × ${result.height}` +
        ` | ${formatBytes(result.blob.size)} | ` +
        `${TYPES[result.type].toUpperCase()}`;

      const note = document.createElement("div");
      note.className = "compress-note";

      if (result.retainedOriginal) {
        note.classList.add("unchanged");
        note.textContent =
          "未達節省門檻，已保留原始檔案";
      } else {
        note.textContent =
          `減少 ${percent.toFixed(1)}%` +
          (result.quality === null
            ? "（PNG 重新編碼）"
            : `（品質設定 ${Math.round(result.quality * 100)}%）`);
      }

      info.append(title, original, resultLine, note);

    } else {
      resultLine.textContent = "尚未壓縮";
    }

    if (!item.result) {
      info.append(title, original, resultLine);
    }

    const actions = document.createElement("div");
    actions.className = "compress-actions";

    actions.append(
      makeButton("比較", () => openCompare(index),
        busy || !item.result),
      makeButton("↓ 下載", () => {
        if (item.result) {
          downloadBlob(item.result.blob, item.result.filename);
        }
      }, busy || !item.result)
    );

    row.append(thumbnail, info, actions);
    imageList.appendChild(row);
  });

  fileCount.textContent =
    `已選擇 ${images.length} / ${MAX_FILES} 張`;

  sourceSize.textContent =
    "總大小：" + formatBytes(
      images.reduce((n, item) => n + item.file.size, 0)
    );

  compressBtn.disabled =
    busy || importing || !images.length;

  downloadAll.disabled =
    busy || !images.some(item => item.result);
}

// ===== 批次壓縮 =====

async function compressAll() {
  if (busy || importing || !images.length) return;

  closeComparison();
  releaseResults();
  setBusy(true);

  let success = 0;
  let failed = 0;
  const began = performance.now();

  try {
    for (let i = 0; i < images.length; i++) {
      const item = images[i];

      message(`正在壓縮第 ${i + 1} / ${images.length} 張...`);
      await pause();

      try {
        item.result = await compressImage(item, i);
        success++;
      } catch (error) {
        console.error("重新編碼失敗，保留原始圖片：", error);

        item.result = {
            blob: item.file,
            type: item.file.type,
            filename: item.file.name,
            retainedOriginal: true,
            quality: null,
            width: item.width,
            height: item.height,
            previewUrl: null
        };

        success++;
      }

      progressFill.style.width =
        `${Math.round((i + 1) / images.length * 100)}%`;

      renderList();
    }

    const completed = images.filter(item => item.result);
    const before = completed.reduce(
      (sum, item) => sum + item.file.size, 0
    );
    const after = completed.reduce(
      (sum, item) => sum + item.result.blob.size, 0
    );

    if (completed.length) {
      totalBefore.textContent = formatBytes(before);
      totalAfter.textContent = formatBytes(after);
      totalSaved.textContent =
        `${formatBytes(before - after)} ` +
        `(${((before - after) / before * 100).toFixed(1)}%)`;

      summary.hidden = false;
    }

    message(
      `完成：成功 ${success} 張，失敗 ${failed} 張。` +
      `沒有節省空間的圖片會保留原檔。耗時 ${((performance.now()-began)/1000).toFixed(1)} 秒。`
    );

  } finally {
    setBusy(false);
  }
}

// ===== 比較視窗 =====

function openCompare(index) {
  const item = images[index];
  if (!item?.result) return;

  lastFocused = document.activeElement;

  beforePreview.src = item.previewUrl;
  afterPreview.src = item.result.previewUrl || item.previewUrl;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  closeCompare.focus();
}

function closeComparison() {
  if (modal.hidden) return;

  modal.hidden = true;
  beforePreview.removeAttribute("src");
  afterPreview.removeAttribute("src");
  document.body.style.overflow = "";

  // 清單更新後按鈕可能已被替換
  if (lastFocused?.isConnected) {
    lastFocused.focus();
  }
}

closeCompare.addEventListener("click", closeComparison);

modal.addEventListener("click", event => {
  if (event.target === modal) closeComparison();
});

document.addEventListener("keydown", event => {
  if (!modal.hidden && event.key === "Escape") {
    closeComparison();
  }

  if (!modal.hidden && event.key === "Tab") {
    // 比較視窗只有一個可操作按鈕
    event.preventDefault();
    closeCompare.focus();
  }
});

// ===== ZIP 下載 =====

async function downloadZip() {
  if (busy) return;

  const completed = images.filter(item => item.result);
  if (!completed.length) return;

  if (typeof JSZip === "undefined") {
    message("ZIP 函式庫載入失敗，請確認網路連線。");
    return;
  }

  setBusy(true);

  try {
    message("正在建立 ZIP 檔案...");

    const zip = new JSZip();

    completed.forEach((item, index) => {
      // 使用序號避免同名檔案衝突
      const name = `${String(index + 1).padStart(2, "0")}-` +
        item.result.filename;

      zip.file(name, item.result.blob);
    });

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "STORE"
    });

    downloadBlob(blob, "WebToolbox-Compressed-Images.zip");
    message(`ZIP 已建立，包含 ${completed.length} 張圖片。`);

  } catch (error) {
    console.error(error);
    message("ZIP 建立失敗，請改為個別下載。");
  } finally {
    setBusy(false);
  }
}

// ===== 清空與設定變更 =====

function clearImages() {
  if (busy || importing) return;

  closeComparison();

  releaseResults();

  images.forEach(item => {
    URL.revokeObjectURL(item.previewUrl);
  });

  images = [];
  fileInput.value = "";

  renderList();
  message("已清空所有圖片。");
}

function settingsChanged() {
  if (busy || importing) return;

  closeComparison();
  releaseResults();
  renderList();
  message("設定已變更，請重新執行壓縮。");
}

// ===== 上傳事件 =====

dropZone.addEventListener("click", () => {
  if (!busy && !importing) fileInput.click();
});

dropZone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (!busy && !importing) fileInput.click();
  }
});

dropZone.addEventListener("dragover", event => {
  event.preventDefault();
  if (!busy && !importing) {
    dropZone.classList.add("dragover");
  }
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", event => {
  event.preventDefault();
  dropZone.classList.remove("dragover");

  if (!busy && !importing) {
    addFiles([...event.dataTransfer.files]);
  }
});

fileInput.addEventListener("change", async () => {
  await addFiles([...fileInput.files]);
  fileInput.value = "";
});

quality.addEventListener("input", () => {
  qualityValue.textContent = `${quality.value}%`;
  settingsChanged();
});

outputMode.addEventListener("change", settingsChanged);
minSaving.addEventListener("change", settingsChanged);

compressBtn.addEventListener("click", compressAll);
downloadAll.addEventListener("click", downloadZip);
clearAll.addEventListener("click", clearImages);

window.addEventListener("beforeunload", () => {
  closeComparison();
  releaseResults();
  images.forEach(item => URL.revokeObjectURL(item.previewUrl));
});

// ===== 初始化 =====

renderList();
