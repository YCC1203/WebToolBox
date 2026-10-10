
"use strict";

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

// ===== 取得元素 =====

const $ = id => document.getElementById(id);

const fileInput = $("fileInput");
const dropZone = $("dropZone");
const imageList = $("imageList");
const fileCount = $("fileCount");
const sourceSize = $("sourceSize");

const outputFormat = $("outputFormat");
const quality = $("quality");
const qualityValue = $("qualityValue");
const backgroundColor = $("backgroundColor");
const backgroundValue = $("backgroundValue");

const convertBtn = $("convertBtn");
const downloadAll = $("downloadAll");
const clearAll = $("clearAll");
const status = $("status");
const progressFill = $("progressFill");

// ===== 設定 =====

const MAX_FILES = 20;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 8192;

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const acceptedTypes = new Set(Object.keys(TYPES));

let images = [];
let busy = false;
let importing = false;

// ===== 小工具 =====

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1048576) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1048576).toFixed(2)} MB`;
}

function showStatus(text) {
  status.textContent = text;
}

function setBusy(value) {
  busy = value;

  fileInput.disabled = value || importing;
  clearAll.disabled = value || importing;
  convertBtn.disabled = value || importing || images.length === 0;
  downloadAll.disabled =
    value || importing || !images.some(item => item.result);

  outputFormat.disabled = value;
  quality.disabled = value;
  backgroundColor.disabled = value;

  renderList();
}

function updateQualityUI() {
  const isPNG = outputFormat.value === "image/png";
  const isJPEG = outputFormat.value === "image/jpeg";

  quality.disabled = busy || isPNG;
  qualityValue.textContent = isPNG
    ? "不適用"
    : `${quality.value}%`;

  backgroundColor.disabled = busy || !isJPEG;
  backgroundValue.textContent =
    backgroundColor.value.toUpperCase();
}

function getFileName(item, index) {
  const base = item.file.name.replace(/\.[^.]+$/, "");
  const ext = TYPES[outputFormat.value];

  return `${base}-converted-${index + 1}.${ext}`;
}

// ===== 圖片讀取 =====

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(
      new Error("無法解碼此圖片")
    );

    image.src = url;
  });
}

function validateDimensions(width, height) {
  if (
    !width || !height ||
    width > MAX_SIDE ||
    height > MAX_SIDE ||
    width * height > MAX_PIXELS
  ) {
    throw new Error("圖片解析度超過目前支援範圍");
  }
}

// ===== 檔案加入 =====

async function addFiles(files) {
  if (busy || importing || !files.length) return;

  importing = true;
  fileInput.disabled = true;
  clearAll.disabled = true;
  convertBtn.disabled = true;
  downloadAll.disabled = true;

  try {
  let added = 0;
  let rejected = 0;

  for (const file of files) {
    if (images.length >= MAX_FILES) {
      rejected++;
      continue;
    }

    if (
      !acceptedTypes.has(file.type) ||
      file.size === 0 ||
      file.size > MAX_FILE_SIZE
    ) {
      rejected++;
      continue;
    }

    const url = URL.createObjectURL(file);

    try {
      const image = await loadImage(url);

      validateDimensions(
        image.naturalWidth,
        image.naturalHeight
      );

      images.push({
        file,
        url,
        width: image.naturalWidth,
        height: image.naturalHeight,
        result: null,
        error: null
      });

      added++;
    } catch {
      URL.revokeObjectURL(url);
      rejected++;
    }
  }

  invalidateResults();
  renderList();

  if (rejected) wtNotice("error", `略過 ${rejected} 張不支援或無法讀取的圖片`);
  else if (added) wtNotice("success", `已加入 ${added} 張圖片`);

  showStatus(
    `已加入 ${added} 張圖片` +
    (rejected ? `，略過 ${rejected} 張不支援或過大的圖片。` : "。")
  );
  } finally {
    importing = false;
    fileInput.disabled = busy;
    clearAll.disabled = busy;
    renderList();
  }
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

// ===== 檔案清單 =====

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
    thumbnail.src = item.url;
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
      `${formatBytes(item.file.size)}`;

    const resultLine = document.createElement("div");
    resultLine.className = "image-result";

    const change = document.createElement("span");

    if (item.error) {
      resultLine.classList.add("error-result");
      resultLine.textContent = item.error;
    } else if (item.result) {
      const result = item.result;

      resultLine.textContent =
        `輸出：${result.width} × ${result.height} | ` +
        `${formatBytes(result.blob.size)} `;

      const format = document.createElement("span");
      format.className = "format-label";
      format.textContent = TYPES[result.type].toUpperCase();
      resultLine.appendChild(format);

      const difference = item.file.size - result.blob.size;
      const percent = Math.abs(
        difference / item.file.size * 100
      );

      change.className = "size-difference " +
        (difference > 0 ? "smaller" :
         difference < 0 ? "larger" : "same");

      change.textContent =
        difference > 0 ? `減少 ${percent.toFixed(1)}%` :
        difference < 0 ? `增加 ${percent.toFixed(1)}%` :
        "大小不變";
    } else {
      resultLine.textContent = "尚未轉換";
    }

    info.append(title, original, resultLine);

    if (item.result) {
      info.appendChild(change);
    }

    const button = document.createElement("button");
    button.className = "image-download";
    button.type = "button";
    button.textContent = "↓ 下載";
    button.disabled = !item.result || busy;

    button.addEventListener("click", () => {
      if (item.result) {
        downloadBlob(
          item.result.blob,
          item.result.filename
        );
      }
    });

    row.append(thumbnail, info, button);
    imageList.appendChild(row);
  });

  fileCount.textContent =
    `已選擇 ${images.length} / ${MAX_FILES} 張`;

  sourceSize.textContent =
    "總大小：" + formatBytes(
      images.reduce((sum, item) => sum + item.file.size, 0)
    );

  convertBtn.disabled = busy || importing || !images.length;
  downloadAll.disabled =
    busy || importing || !images.some(item => item.result);
}

// ===== Canvas 匯出 =====

function canvasToBlob(canvas, type, outputQuality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("圖片匯出失敗"));
        return;
      }

      // 防止瀏覽器退回 PNG，卻被命名為 WebP/JPG
      if (blob.type !== type) {
        reject(new Error("瀏覽器不支援此輸出格式"));
        return;
      }

      resolve(blob);
    }, type, outputQuality);
  });
}

// ===== 轉換單張圖片 =====

async function convertImage(item, index) {
  const image = await loadImage(item.url);
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  validateDimensions(width, height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  try {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("無法建立 Canvas 畫布");
  }

  const type = outputFormat.value;

  // JPEG 不支援透明像素
  if (type === "image/jpeg") {
    ctx.fillStyle = backgroundColor.value;
    ctx.fillRect(0, 0, width, height);
  }

  // 保留解析度，繪製原始圖片
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(
    canvas,
    type,
    Number(quality.value) / 100
  );


  return {
    blob,
    type,
    width,
    height,
    filename: getFileName(item, index)
  };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

// ===== 批次轉換 =====

async function convertImages() {
  if (busy || importing || !images.length) return;

  invalidateResults();
  setBusy(true);

  let success = 0;
  let failed = 0;
  const toastId = wtLoading(`正在轉換 ${images.length} 張圖片...`);

  try {
    for (let i = 0; i < images.length; i++) {
      const item = images[i];

      showStatus(
        `正在轉換第 ${i + 1} / ${images.length} 張圖片...`
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      try {
        item.result = await convertImage(item, i);
        success++;
      } catch (error) {
        console.error(error);
        item.error = error.message || "轉換失敗";
        failed++;
      }

      progressFill.style.width =
        `${Math.round((i + 1) / images.length * 100)}%`;

      renderList();
    }

    showStatus(
      `轉換完成：成功 ${success} 張，失敗 ${failed} 張。`
    );
    wtNotice(failed ? "error" : "success", `轉換完成：成功 ${success} 張，失敗 ${failed} 張`);
  } catch (error) {
    console.error(error);
    showStatus("轉換過程發生錯誤");
    wtNotice("error", "圖片轉換失敗，請再試一次");
  } finally {
    wtFinish(toastId);
    setBusy(false);
    updateQualityUI();
  }
}

// ===== 下載圖片 =====

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

// ===== ZIP 批次下載 =====

async function downloadZip() {
  if (busy || importing) return;

  const completed = images.filter(item => item.result);
  if (!completed.length) return;

  if (typeof JSZip === "undefined") {
    showStatus("ZIP 函式庫未載入，請檢查網路連線。");
    wtNotice("error", "ZIP 函式庫載入失敗");
    return;
  }

  setBusy(true);
  const toastId = wtLoading("正在建立圖片 ZIP...");

  try {
    showStatus("正在建立 ZIP 檔案...");

    const zip = new JSZip();

    for (const item of completed) {
      zip.file(
        item.result.filename,
        item.result.blob
      );
    }

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "STORE"
    });

    downloadBlob(
      blob,
      "WebToolbox-Converted-Images.zip"
    );

    showStatus(
      `ZIP 已建立，包含 ${completed.length} 張圖片。`
    );
    wtNotice("success", `包含 ${completed.length} 張圖片的 ZIP 已開始下載`);
  } catch (error) {
    console.error(error);
    showStatus("ZIP 建立失敗，請改用個別下載。");
    wtNotice("error", "ZIP 建立失敗，請改用個別下載");
  } finally {
    wtFinish(toastId);
    setBusy(false);
    updateQualityUI();
  }
}

// ===== 清空 =====

function removeAll() {
  if (busy || importing) return;

  images.forEach(item => {
    URL.revokeObjectURL(item.url);
  });

  images = [];
  fileInput.value = "";

  invalidateResults();
  renderList();
  showStatus("已清空所有圖片。");
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

  if (!busy) {
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

// ===== 設定事件 =====

outputFormat.addEventListener("change", () => {
  updateQualityUI();
  settingsChanged();
});

quality.addEventListener("input", () => {
  updateQualityUI();
  settingsChanged();
});

backgroundColor.addEventListener("input", () => {
  updateQualityUI();
  settingsChanged();
});

// ===== 按鈕事件 =====

convertBtn.addEventListener("click", convertImages);
downloadAll.addEventListener("click", downloadZip);
clearAll.addEventListener("click", removeAll);

// ===== 清理 =====

window.addEventListener("beforeunload", () => {
  images.forEach(item => {
    URL.revokeObjectURL(item.url);
  });
});

// ===== 初始化 =====

renderList();
updateQualityUI();
