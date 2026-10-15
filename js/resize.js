
"use strict";

const $ = id => document.getElementById(id);

const fileInput = $("fileInput");
const dropZone = $("dropZone");
const imageList = $("imageList");
const fileCount = $("fileCount");
const sourceSize = $("sourceSize");
const targetWidth = $("targetWidth");
const targetHeight = $("targetHeight");
const outputFormat = $("outputFormat");
const quality = $("quality");
const qualityValue = $("qualityValue");
const lockRatio = $("lockRatio");
const noUpscale = $("noUpscale");
const processBtn = $("processBtn");
const downloadAll = $("downloadAll");
const clearAll = $("clearAll");
const status = $("status");
const progressFill = $("progressFill");

const MAX_FILES = 20;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_SIDE = 8192;
const MAX_PIXELS = 40_000_000;

const acceptedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const extensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

let images = [];
let busy = false;
let importing = false;

// 共用通知：通知系統未載入時不影響工具原有功能
function wtNotice(type, text) {
  window.WebToolboxNotify?.[type]?.(text);
}
function wtLoading(text) {
  return window.WebToolboxNotify?.loading?.(text) ?? null;
}
function wtFinish(id) {
  if (id !== null) window.WebToolboxNotify?.dismiss?.(id);
}

// ===== 通用功能 =====

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function message(text) {
  status.textContent = text;
}

function makeButton(text, callback, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "image-download";
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener("click", callback);
  return button;
}

async function getDimensions(file) {
  // 讀取尺寸時只保留寬高資訊，不保留解碼後的完整像素資料。
  // 用相同的 EXIF 方向設定，確保匯入與處理時計算的尺寸一致。
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap?.close();
  }
}

function updateCount() {
  fileCount.textContent = `已選擇 ${images.length} / ${MAX_FILES} 張`;
  sourceSize.textContent =
    `總大小：${bytes(images.reduce((n, item) => n + item.file.size, 0))}`;

  processBtn.disabled = busy || importing || images.length === 0;
  downloadAll.disabled = busy || importing || !images.some(x => x.result);
}

function getTargetDimensions(item) {
  let width = Number(targetWidth.value);
  let height = Number(targetHeight.value);

  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 ||
      width > MAX_SIDE || height > MAX_SIDE) {
    throw new Error("寬度與高度必須是 1～8192 的整數");
  }

  if (lockRatio.checked) {
    height = Math.max(
      1,
      Math.round(width * item.height / item.width)
    );
  }

  if (noUpscale.checked) {
    // 鎖定比例時，整體等比例縮小，絕不放大。
    if (lockRatio.checked) {
      const factor = Math.min(
        1,
        width / item.width,
        height / item.height
      );

      width = Math.max(1, Math.round(item.width * factor));
      height = Math.max(1, Math.round(item.height * factor));
    } else {
      width = Math.min(width, item.width);
      height = Math.min(height, item.height);
    }
  }

  if (width > MAX_SIDE || height > MAX_SIDE ||
      width * height > MAX_PIXELS) {
    throw new Error("輸出尺寸過大，請縮小目標解析度");
  }

  return { width, height };
}

// ===== 畫出圖片清單 =====

function renderList() {
  imageList.replaceChildren();

  if (images.length === 0) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "尚無圖片，請先從上方選擇檔案。";
    imageList.appendChild(empty);
    updateCount();
    return;
  }

  images.forEach(item => {
    const row = document.createElement("div");
    row.className = "image-item";

    const preview = document.createElement("img");
    preview.className = "image-thumb";
    preview.src = item.previewUrl;
    preview.alt = item.file.name;

    const info = document.createElement("div");
    info.className = "image-info";

    const name = document.createElement("strong");
    name.className = "image-name";
    name.textContent = item.file.name;
    name.title = item.file.name;

    const original = document.createElement("div");
    original.className = "image-meta";
    original.textContent =
      `原始：${item.width} × ${item.height} | ${bytes(item.file.size)}`;

    const result = document.createElement("div");
    result.className = "image-result";

    if (item.error) {
      result.style.color = "#ff9a9a";
      result.textContent = item.error;
    } else if (item.result) {
      result.textContent =
        `輸出：${item.result.width} × ${item.result.height}` +
        ` | ${bytes(item.result.blob.size)}`;
    } else {
      result.textContent = "尚未處理";
    }

    info.append(name, original, result);

    const button = makeButton(
      "↓ 下載",
      () => {
        if (item.result) {
          downloadBlob(item.result.blob, item.result.filename);
        }
      },
      !item.result || busy
    );

    row.append(preview, info, button);
    imageList.appendChild(row);
  });

  updateCount();
}

// ===== 匯入圖片 =====

async function addFiles(files) {
  if (busy || importing || !files.length) return;

  importing = true;
  fileInput.disabled = true;
  clearAll.disabled = true;
  updateCount();

  try {
  let added = 0;
  let rejected = 0;

  for (const file of files) {
    if (images.length >= MAX_FILES) {
      rejected++;
      continue;
    }

    if (!acceptedTypes.has(file.type) ||
        file.size > MAX_BYTES ||
        file.size === 0) {
      rejected++;
      continue;
    }

    try {
      const dimensions = await getDimensions(file);

      if (
        dimensions.width < 1 ||
        dimensions.height < 1 ||
        dimensions.width * dimensions.height > MAX_PIXELS
      ) {
        rejected++;
        continue;
      }

      images.push({
        file,
        width: dimensions.width,
        height: dimensions.height,
        previewUrl: URL.createObjectURL(file),
        result: null,
        error: null
      });

      added++;
    } catch {
      rejected++;
    }
  }

  // 以第一張圖片作為比例設定參考
  if (images.length > 0 && added > 0) {
    const first = images[0];
    targetWidth.value = Math.min(first.width, MAX_SIDE);
    syncHeight();
  }

  invalidateResults();
  renderList();

  if (rejected) wtNotice("error", `略過 ${rejected} 張不支援、過大或無法讀取的圖片`);
  else if (added) wtNotice("success", `已加入 ${added} 張圖片`);

  message(
    `已加入 ${added} 張圖片` +
    (rejected ? `，略過 ${rejected} 張不支援或過大的圖片。` : "。")
  );
  } finally {
    importing = false;
    fileInput.disabled = busy;
    clearAll.disabled = busy;
    updateCount();
  }
}

// ===== 寬高比例同步 =====

function syncHeight() {
  if (!lockRatio.checked || !images.length) return;

  const first = images[0];
  const width = Number(targetWidth.value);

  if (!Number.isFinite(width) || width < 1) return;

  const height = Math.round(width * first.height / first.width);
  targetHeight.value = Math.max(1, Math.min(MAX_SIDE, height));
}

function syncWidth() {
  if (!lockRatio.checked || !images.length) return;

  const first = images[0];
  const height = Number(targetHeight.value);

  if (!Number.isFinite(height) || height < 1) return;

  const width = Math.round(height * first.width / first.height);
  targetWidth.value = Math.max(1, Math.min(MAX_SIDE, width));
}

// ===== 清除舊結果 =====

function invalidateResults() {
  for (const item of images) {
    item.result = null;
    item.error = null;
  }

  progressFill.style.width = "0%";
  downloadAll.disabled = true;
}

function settingsChanged() {
  if (busy) return;
  invalidateResults();
  renderList();
}

// ===== 圖片處理 =====

function canvasToBlob(canvas, type, qualityValue) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("圖片匯出失敗"));
      } else if (blob.type !== type) {
        reject(new Error("瀏覽器不支援此輸出格式"));
      } else {
        resolve(blob);
      }
    }, type, qualityValue);
  });
}

async function resizeImage(item, index) {
  const dimensions = getTargetDimensions(item);

  const type = outputFormat.value === "original"
    ? item.file.type
    : outputFormat.value;

  const filename =
    item.file.name.replace(/\.[^.]+$/, "") +
    `-${dimensions.width}x${dimensions.height}-${index + 1}.` +
    extensions[type];

  // 同尺寸、同格式時直接保留原始檔案，避免重編碼變大。
  if (dimensions.width === item.width &&
      dimensions.height === item.height &&
      type === item.file.type) {
    return {
      blob: item.file,
      width: item.width,
      height: item.height,
      filename
    };
  }

  let bitmap = null;
  let canvas = null;

  try {
    bitmap = await createImageBitmap(item.file, {
      imageOrientation: "from-image"
    });

    canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("無法建立圖片畫布");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // JPEG 不支援透明度，先填入白色背景。
    if (type === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(
      bitmap,
      0, 0,
      canvas.width,
      canvas.height
    );

    const blob = await canvasToBlob(
      canvas,
      type,
      Number(quality.value) / 100
    );

    return {
      blob,
      width: dimensions.width,
      height: dimensions.height,
      filename
    };
  } finally {
    if (bitmap) bitmap.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

// ===== 批次處理 =====

async function processImages() {
  if (busy || importing || images.length === 0) return;

  try {
    // 先檢查所有尺寸設定
    images.forEach(getTargetDimensions);
  } catch (error) {
    message(error.message);
    wtNotice("error", error.message);
    return;
  }

  busy = true;
  invalidateResults();
  processBtn.disabled = true;
  clearAll.disabled = true;
  fileInput.disabled = true;
  downloadAll.disabled = true;

  const settingControls = [
    targetWidth, targetHeight, outputFormat,
    quality, lockRatio, noUpscale
  ];
  settingControls.forEach(control => control.disabled = true);

  let success = 0;
  let failed = 0;
  const toastId = wtLoading(`正在調整 ${images.length} 張圖片...`);

  try {
    for (let i = 0; i < images.length; i++) {
      const item = images[i];
      message(`正在處理第 ${i + 1} / ${images.length} 張圖片...`);

      // 允許瀏覽器更新畫面
      await new Promise(resolve => setTimeout(resolve, 0));

      try {
        item.result = await resizeImage(item, i);
        success++;
      } catch (error) {
        item.error = error.message || "處理失敗";
        failed++;
      }

      progressFill.style.width =
        `${Math.round((i + 1) / images.length * 100)}%`;

      renderList();
    }

    message(
      `處理完成：成功 ${success} 張，失敗 ${failed} 張。`
    );
    wtNotice(failed ? "error" : "success", `圖片處理完成：成功 ${success} 張，失敗 ${failed} 張`);
  } catch (error) {
    console.error(error);
    message("圖片處理發生未預期錯誤");
    wtNotice("error", "圖片處理失敗，請重新嘗試");
  } finally {
    wtFinish(toastId);
    busy = false;
    clearAll.disabled = false;
    fileInput.disabled = false;
    settingControls.forEach(control => control.disabled = false);
    renderList();
  }
}

// ===== 檔案下載 =====

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function downloadZip() {
  if (busy || importing) return;

  const completed = images.filter(item => item.result);
  if (!completed.length) return;

  if (typeof JSZip === "undefined") {
    message("ZIP 函式庫載入失敗，請確認網路連線。");
    wtNotice("error", "ZIP 函式庫載入失敗");
    return;
  }

  busy = true;
  fileInput.disabled = true;
  clearAll.disabled = true;
  downloadAll.disabled = true;
  processBtn.disabled = true;
  const settingControls = [targetWidth, targetHeight, outputFormat, quality, lockRatio, noUpscale];
  settingControls.forEach(control => control.disabled = true);

  const toastId = wtLoading("正在建立圖片 ZIP...");
  try {
    message("正在建立 ZIP 壓縮檔...");

    const zip = new JSZip();

    for (const item of completed) {
      zip.file(
        item.result.filename,
        item.result.blob
      );
    }

    // 圖片本身通常已經壓縮，不必再使用高強度 ZIP 壓縮
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "STORE"
    });

    downloadBlob(blob, "WebToolbox-Resized-Images.zip");
    message(`ZIP 已建立，包含 ${completed.length} 張圖片。`);
    wtNotice("success", `包含 ${completed.length} 張圖片的 ZIP 已開始下載`);

  } catch (error) {
    console.error(error);
    message("建立 ZIP 失敗，請嘗試個別下載圖片。");
    wtNotice("error", "ZIP 建立失敗，請嘗試個別下載");
  } finally {
    wtFinish(toastId);
    busy = false;
    fileInput.disabled = false;
    clearAll.disabled = false;
    settingControls.forEach(control => control.disabled = false);
    renderList();
  }
}

// ===== 清空圖片 =====

function removeAll() {
  if (busy || importing) return;

  images.forEach(item => {
    URL.revokeObjectURL(item.previewUrl);
  });

  images = [];
  fileInput.value = "";

  invalidateResults();
  renderList();
  message("已清空圖片。");
}

// ===== 事件 =====

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
  if (!busy) dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", event => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  if (!importing && !busy) addFiles([...event.dataTransfer.files]);
});

fileInput.addEventListener("change", async () => {
  await addFiles([...fileInput.files]);
  fileInput.value = "";
});

targetWidth.addEventListener("input", () => {
  syncHeight();
  settingsChanged();
});

targetHeight.addEventListener("input", () => {
  syncWidth();
  settingsChanged();
});

lockRatio.addEventListener("change", () => {
  syncHeight();
  settingsChanged();
});

[noUpscale, outputFormat, quality].forEach(control => {
  control.addEventListener("input", settingsChanged);
});

quality.addEventListener("input", () => {
  qualityValue.textContent = `${quality.value}%`;
});

processBtn.addEventListener("click", processImages);
downloadAll.addEventListener("click", downloadZip);
clearAll.addEventListener("click", removeAll);

window.addEventListener("beforeunload", () => {
  images.forEach(item => URL.revokeObjectURL(item.previewUrl));
});

renderList();
