
"use strict";

const $ = id => document.getElementById(id);

const fileInput = $("fileInput");
const dropZone = $("dropZone");
const fileList = $("fileList");
const pagesList = $("pagesList");
const fileCount = $("fileCount");
const pageCount = $("pageCount");
const statusText = $("status");
const progressFill = $("progressFill");

const clearAll = $("clearAll");
const restoreBtn = $("restoreBtn");
const selectAll = $("selectAll");
const deselectAll = $("deselectAll");
const deleteSelected = $("deleteSelected");

const exportAll = $("exportAll");
const exportRange = $("exportRange");
const splitAll = $("splitAll");
const pageRange = $("pageRange");

const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PAGES = 300;

let files = [];
let pages = [];
let busy = false;

let nextFileId = 1;
let nextPageId = 1;

function showStatus(text) {
  statusText.textContent = text;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function getLib() {
  if (!window.PDFLib) {
    throw new Error("PDF 函式庫載入失敗，請檢查網路連線");
  }
  return window.PDFLib;
}

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

function setBusy(value) {
  busy = value;

  fileInput.disabled = value;
  clearAll.disabled = value;
  pageRange.disabled = value;

  render();
}

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

// ===== 上傳 PDF =====

async function addFiles(selectedFiles) {
  if (busy) return;

  try {
    getLib();
  } catch (error) {
    showStatus(error.message);
    wtNotice("error", error.message);
    return;
  }

  setBusy(true);
  const toastId = wtLoading(`正在讀取 ${selectedFiles.length} 份 PDF...`);

  let added = 0;
  let rejected = 0;
  const errors = [];

  try {
    for (const file of selectedFiles) {
      if (files.length >= MAX_FILES ||
          file.size > MAX_FILE_SIZE ||
          file.size === 0 ||
          !file.name.toLowerCase().endsWith(".pdf")) {
        rejected++;
        continue;
      }

      try {
        const buffer = await file.arrayBuffer();

        // 不嘗試繞過 PDF 加密保護
        const doc = await PDFLib.PDFDocument.load(buffer);
        const count = doc.getPageCount();

        if (count === 0 || pages.length + count > MAX_PAGES) {
          rejected++;
          errors.push(`${file.name}：超過頁數上限`);
          continue;
        }

        const entry = {
          id: nextFileId++,
          name: file.name,
          size: file.size,
          doc,
          pageCount: count
        };

        files.push(entry);

        for (let i = 0; i < count; i++) {
          pages.push({
            id: nextPageId++,
            fileId: entry.id,
            pageIndex: i,
            selected: false
          });
        }

        added++;

      } catch (error) {
        rejected++;
        errors.push(`${file.name}：無法讀取，可能已加密或格式不支援`);
        console.warn("PDF 匯入失敗：", error);
      }
    }

    wtNotice(rejected ? "error" : "success", rejected
      ? `已加入 ${added} 份，略過 ${rejected} 份 PDF`
      : `已加入 ${added} 份 PDF`);
    showStatus(
      `已加入 ${added} 份 PDF` +
      (rejected ? `，略過 ${rejected} 份。` : "。") +
      (errors.length ? " " + errors.slice(0, 2).join("；") : "")
    );

  } catch (error) {
    console.error(error);
    showStatus("PDF 讀取發生錯誤");
    wtNotice("error", "PDF 讀取失敗");
  } finally {
    wtFinish(toastId);
    setBusy(false);
  }
}

// ===== 建立頁面資料 =====

function getFile(id) {
  return files.find(file => file.id === id);
}

function render() {
  fileList.replaceChildren();
  pagesList.replaceChildren();

  fileCount.textContent = `已載入 ${files.length} / ${MAX_FILES} 份 PDF`;
  pageCount.textContent = `目前頁數：${pages.length}`;

  files.forEach(file => {
    const row = document.createElement("div");
    row.className = "pdf-file";

    const icon = document.createElement("div");
    icon.className = "pdf-file-icon";
    icon.textContent = "PDF";

    const info = document.createElement("div");
    info.className = "pdf-file-info";

    const title = document.createElement("strong");
    title.textContent = file.name;

    const meta = document.createElement("span");
    meta.textContent =
      `${file.pageCount} 頁 · ${formatBytes(file.size)}`;

    info.append(title, meta);
    row.append(icon, info);
    fileList.appendChild(row);
  });

  if (!pages.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "目前沒有頁面，請上傳 PDF。";
    pagesList.appendChild(empty);
  }

  pages.forEach((page, index) => {
    const source = getFile(page.fileId);

    const row = document.createElement("div");
    row.className = "pdf-page-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = page.selected;
    checkbox.disabled = busy;
    checkbox.setAttribute(
      "aria-label", `選取第 ${index + 1} 頁`
    );

    checkbox.addEventListener("change", () => {
      page.selected = checkbox.checked;
      updateButtons();
    });

    const number = document.createElement("span");
    number.className = "pdf-page-number";
    number.textContent = index + 1;

    const info = document.createElement("div");
    info.className = "pdf-page-info";

    const title = document.createElement("strong");
    title.textContent = source?.name || "未知文件";

    const detail = document.createElement("span");
    detail.textContent = `原始第 ${page.pageIndex + 1} 頁`;

    info.append(title, detail);

    const controls = document.createElement("div");
    controls.className = "pdf-page-controls";

    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.title = "上移";
    up.setAttribute("aria-label", `上移第 ${index + 1} 頁`);
    up.disabled = busy || index === 0;
    up.addEventListener("click", () => movePage(index, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.title = "下移";
    down.setAttribute("aria-label", `下移第 ${index + 1} 頁`);
    down.disabled = busy || index === pages.length - 1;
    down.addEventListener("click", () => movePage(index, 1));

    controls.append(up, down);
    row.append(checkbox, number, info, controls);
    pagesList.appendChild(row);
  });

  updateButtons();
}

function updateButtons() {
  const hasPages = pages.length > 0;
  const hasSelected = pages.some(page => page.selected);

  restoreBtn.disabled = busy || !files.length;
  selectAll.disabled = busy || !hasPages;
  deselectAll.disabled = busy || !hasSelected;
  deleteSelected.disabled = busy || !hasSelected;

  exportAll.disabled = busy || !hasPages;
  exportRange.disabled = busy || !hasPages;
  splitAll.disabled = busy || !hasPages;
}

// ===== 移動與刪除頁面 =====

function movePage(index, direction) {
  if (busy) return;

  const target = index + direction;
  if (target < 0 || target >= pages.length) return;

  [pages[index], pages[target]] =
    [pages[target], pages[index]];

  render();
}

function removeSelectedPages() {
  if (busy) return;

  const count = pages.filter(page => page.selected).length;
  if (!count) return;

  pages = pages.filter(page => !page.selected);
  render();

  showStatus(`已從工作清單刪除 ${count} 頁，原始文件不受影響。`);
  wtNotice("success", `已移除 ${count} 頁（原始文件不變）`);
}

function restorePages() {
  if (busy) return;

  pages = files.flatMap(file =>
    Array.from({ length: file.pageCount }, (_, i) => ({
      id: nextPageId++,
      fileId: file.id,
      pageIndex: i,
      selected: false
    }))
  );

  render();
  showStatus("已還原成原始文件順序。");
  wtNotice("success", "已還原原始頁面順序");
}

// ===== 分析頁碼範圍 =====

function parseRanges(text, total) {
  if (!text.trim()) {
    throw new Error("請輸入頁碼，例如 1-3,5,8-10");
  }

  const selected = [];
  const used = new Set();

  for (const part of text.split(",")) {
    const token = part.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);

    if (!match) {
      throw new Error(`無效的頁碼格式：${token || "空白項目"}`);
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;

    if (!Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 1 || end > total || start > end) {
      throw new Error(`頁碼超出範圍或順序錯誤：${token}`);
    }

    for (let page = start; page <= end; page++) {
      const index = page - 1;

      if (!used.has(index)) {
        used.add(index);
        selected.push(index);
      }
    }
  }

  return selected;
}

// ===== 建立新 PDF =====

async function buildPDF(selectedPages, onProgress = null) {
  const { PDFDocument } = getLib();
  const output = await PDFDocument.create();
  const total = selectedPages.length;
  let processed = 0;

  // 將「相鄰且來自同一 PDF」的頁面一起複製，減少逐頁呼叫
  // copyPages() 的額外開銷，同時保留使用者指定的排列順序。
  // 每批上限 24 頁，避免一次處理過大的集合。
  while (processed < total) {
    const start = selectedPages[processed];
    const source = getFile(start.fileId);
    if (!source) throw new Error("找不到來源 PDF");

    const indices = [];
    while (processed + indices.length < total && indices.length < 24) {
      const page = selectedPages[processed + indices.length];
      if (page.fileId !== start.fileId) break;
      indices.push(page.pageIndex);
    }

    const copied = await output.copyPages(source.doc, indices);
    for (const page of copied) output.addPage(page);
    processed += indices.length;

    if (onProgress) onProgress(processed, total);
    // 讓進度列、按鈕的變更有機會畫到畫面上。
    if (processed < total) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return output.save();
}

function pdfBlob(data) {
  return new Blob([data], { type: "application/pdf" });
}

// ===== 操作進度 =====

async function runTask(label, task) {
  if (busy) return;

  setBusy(true);
  progressFill.style.width = "10%";
  showStatus(label);
  const toastId = wtLoading(label);

  try {
    await task();
    progressFill.style.width = "100%";
    wtFinish(toastId);
    wtNotice("success", "PDF 已產生並開始下載");
  } catch (error) {
    console.error(error);
    showStatus("操作失敗：" + error.message);
    wtFinish(toastId);
    wtNotice("error", "PDF 操作失敗：" + error.message);
    progressFill.style.width = "0%";
  } finally {
    wtFinish(toastId);
    setBusy(false);
  }
}

// ===== 輸出完整 PDF =====

function downloadMerged() {
  if (!pages.length) return;

  runTask("正在建立 PDF...", async () => {
    const bytes = await buildPDF(pages, (done, total) => {
      progressFill.style.width = `${10 + Math.round(done / total * 75)}%`;
      showStatus(`正在合併 PDF：${done} / ${total} 頁...`);
    });

    downloadBlob(
      pdfBlob(bytes),
      "WebToolbox-Merged.pdf"
    );

    showStatus(`已產生 ${pages.length} 頁 PDF。`);
  });
}

// ===== 擷取指定頁面 =====

function downloadRange() {
  if (!pages.length) return;

  let indices;

  try {
    indices = parseRanges(pageRange.value, pages.length);
  } catch (error) {
    showStatus(error.message);
    wtNotice("error", error.message);
    return;
  }

  runTask("正在擷取指定頁面...", async () => {
    const selected = indices.map(index => pages[index]);
    const bytes = await buildPDF(selected, (done, total) => {
      progressFill.style.width = `${10 + Math.round(done / total * 75)}%`;
      showStatus(`正在擷取頁面：${done} / ${total} 頁...`);
    });

    downloadBlob(
      pdfBlob(bytes),
      "WebToolbox-Extracted.pdf"
    );

    showStatus(`已擷取 ${selected.length} 頁。`);
  });
}

// ===== 逐頁分割 ZIP =====

function downloadSplit() {
  if (!pages.length || busy) return;

  if (pages.length > 100) {
    const confirmed = window.confirm(
      `目前共有 ${pages.length} 頁。\n\n` +
      "逐頁分割會產生大量 PDF，" +
      "可能需要較多記憶體。\n\n" +
      "確定要繼續嗎？"
    );

    if (!confirmed) return;
  }

  runTask("正在分割 PDF...", async () => {
    if (!window.JSZip) {
      throw new Error("ZIP 函式庫載入失敗");
    }

    const zip = new JSZip();

    for (let i = 0; i < pages.length; i++) {
      const data = await buildPDF([pages[i]]);
      const name = `page-${String(i + 1).padStart(3, "0")}.pdf`;

      zip.file(name, data);

      progressFill.style.width =
        `${Math.round((i + 1) / pages.length * 90)}%`;

      showStatus(`正在分割 ${i + 1} / ${pages.length} 頁...`);

      await new Promise(resolve => setTimeout(resolve, 0));
    }

    showStatus("正在打包分割後的 PDF...");
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "STORE"
    }, metadata => {
      progressFill.style.width =
        `${90 + Math.round(metadata.percent * 0.09)}%`;
    });

    downloadBlob(blob, "WebToolbox-Split-Pages.zip");
    showStatus(`已分割 ${pages.length} 頁並打包 ZIP。`);
  });
}

// ===== 清空文件 =====

function removeAll() {
  if (busy) return;

  files = [];
  pages = [];
  fileInput.value = "";
  pageRange.value = "";
  progressFill.style.width = "0%";

  render();
  showStatus("已清空所有 PDF。");
}

// ===== 上傳事件 =====

dropZone.addEventListener("click", () => {
  if (!busy) fileInput.click();
});

dropZone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (!busy) fileInput.click();
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

  if (!busy) addFiles([...event.dataTransfer.files]);
});

fileInput.addEventListener("change", async () => {
  await addFiles([...fileInput.files]);
  fileInput.value = "";
});

// ===== 按鈕事件 =====

clearAll.addEventListener("click", removeAll);
restoreBtn.addEventListener("click", () => {
  if (busy || files.length === 0) return;

  const confirmed = window.confirm(
    "確定還原原始排列嗎？\n\n" +
    "目前刪除的頁面會重新加入，" +
    "所有頁面也會恢復成原始上傳順序。"
  );

  if (confirmed) {
    restorePages();
  }
});

selectAll.addEventListener("click", () => {
  pages.forEach(page => page.selected = true);
  render();
});

deselectAll.addEventListener("click", () => {
  pages.forEach(page => page.selected = false);
  render();
});

deleteSelected.addEventListener("click", removeSelectedPages);

exportAll.addEventListener("click", downloadMerged);
exportRange.addEventListener("click", downloadRange);
splitAll.addEventListener("click", downloadSplit);

// ===== 初始化 =====

render();
