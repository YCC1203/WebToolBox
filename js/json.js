
"use strict";

// ===== 取得網頁元素 =====

const input = document.getElementById("jsonInput");
const output = document.getElementById("jsonOutput");

const indentSize = document.getElementById("indentSize");

const formatBtn = document.getElementById("formatBtn");
const minifyBtn = document.getElementById("minifyBtn");
const validateBtn = document.getElementById("validateBtn");

const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const importBtn = document.getElementById("importBtn");
const clearBtn = document.getElementById("clearBtn");
const fileInput = document.getElementById("fileInput");

const inputSize = document.getElementById("inputSize");
const outputSize = document.getElementById("outputSize");

const statusBox = document.getElementById("jsonStatus");
const statusIcon = document.getElementById("statusIcon");
const statusTitle = document.getElementById("statusTitle");
const statusMessage = document.getElementById("statusMessage");

const encoder = new TextEncoder();

const MAX_FILE_SIZE = 5 * 1024 * 1024;


// ===== 顯示檔案大小 =====

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function updateSizes() {
  inputSize.textContent =
    formatBytes(encoder.encode(input.value).length);

  outputSize.textContent =
    formatBytes(encoder.encode(output.value).length);
}


// ===== 顯示狀態 =====

function setStatus(type, title, message) {
  statusBox.className = "json-status";

  if (type === "success" || type === "error") {
    statusBox.classList.add(type);
  }

  statusIcon.textContent =
    type === "success" ? "✓" :
    type === "error" ? "✕" : "◇";

  statusTitle.textContent = title;
  statusMessage.textContent = message;
}


// ===== 清除舊結果 =====

function clearOutput() {
  output.value = "";
  copyBtn.disabled = true;
  downloadBtn.disabled = true;
  updateSizes();
}


// ===== 取得錯誤位置 =====

// 不同瀏覽器可能提供不同格式的錯誤訊息
function findErrorLocation(message, text) {
  const positionMatch = message.match(/position\s+(\d+)/i);

  let position = null;

  if (positionMatch) {
    position = Number(positionMatch[1]);
  } else {
    const locationMatch = message.match(
      /line\s+(\d+)\s+column\s+(\d+)/i
    );

    if (locationMatch) {
      const targetLine = Number(locationMatch[1]);
      const targetColumn = Number(locationMatch[2]);

      const lines = text.split("\n");

      if (targetLine >= 1 && targetLine <= lines.length) {
        position = 0;

        for (let i = 0; i < targetLine - 1; i++) {
          position += lines[i].length + 1;
        }

        position += targetColumn - 1;
      }
    }
  }

  if (position === null || !Number.isFinite(position)) {
    return null;
  }

  position = Math.max(0, Math.min(position, text.length));

  const before = text.slice(0, position);
  const lines = before.split("\n");

  return {
    position,
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}


// ===== 解析 JSON =====

function parseInput() {
  const text = input.value;

  if (!text.trim()) {
    clearOutput();
    setStatus("error", "沒有輸入內容", "請先貼上 JSON 資料。");
    return { success: false };
  }

  try {
    const data = JSON.parse(text);

    return {
      success: true,
      data
    };

  } catch (error) {
    clearOutput();

    const location = findErrorLocation(error.message, text);

    let detail = error.message;

    if (location) {
      detail += `（第 ${location.line} 行，第 ${location.column} 欄）`;

      // 選取錯誤位置附近，方便使用者修改
      input.focus();
      input.setSelectionRange(
        location.position,
        Math.min(location.position + 1, text.length)
      );
    }

    setStatus("error", "JSON 格式錯誤", detail);
    window.WebToolboxNotify?.error("JSON 格式錯誤，請查看下方詳細資訊");

    return { success: false };
  }
}


// ===== 設定輸出結果 =====

function setOutput(text, title, message) {
  output.value = text;

  copyBtn.disabled = false;
  downloadBtn.disabled = false;

  updateSizes();
  setStatus("success", title, message);
}


// ===== 美化 JSON =====

function formatJSON() {
  const result = parseInput();

  if (!result.success) return;

  const indent = indentSize.value === "tab"
    ? "\t"
    : Number(indentSize.value);

  const formatted = JSON.stringify(result.data, null, indent);

  setOutput(
    formatted,
    "JSON 美化成功",
    "格式正確，已依照指定的縮排方式重新排版。"
  );
}


// ===== 壓縮 JSON =====

function minifyJSON() {
  const result = parseInput();

  if (!result.success) return;

  const minified = JSON.stringify(result.data);

  const originalBytes = encoder.encode(input.value).length;
  const newBytes = encoder.encode(minified).length;

  const difference = originalBytes - newBytes;

  const message = difference > 0
    ? `已減少 ${formatBytes(difference)}，結果已顯示在右側。`
    : "已完成壓縮，但原始內容已經很精簡。";

  setOutput(minified, "JSON 壓縮成功", message);
}


// ===== 驗證 JSON =====

function validateJSON() {
  const result = parseInput();

  if (!result.success) return;

  clearOutput();

  setStatus(
    "success",
    "JSON 語法正確",
    "資料已通過 JSON 語法解析檢查，可以正常解析。"
  );
}


// ===== 複製結果 =====

async function copyJSON() {
  if (copyBtn.disabled) return;

  try {
    await navigator.clipboard.writeText(output.value);
    window.WebToolboxNotify?.success("JSON 已複製到剪貼簿");

    setStatus(
      "success",
      "複製成功",
      "JSON 處理結果已複製到剪貼簿。"
    );

  } catch (error) {
    console.error("複製失敗：", error);
    window.WebToolboxNotify?.error("JSON 複製失敗");

    setStatus(
      "error",
      "複製失敗",
      "請確認瀏覽器權限，或手動選取結果複製。"
    );
  }
}


// ===== 下載 JSON =====

function downloadJSON() {
  if (downloadBtn.disabled) return;

  const blob = new Blob(
    [output.value],
    { type: "application/json;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "WebToolbox-Formatted.json";

  document.body.appendChild(link);
  link.click();
  link.remove();
  window.WebToolboxNotify?.success("JSON 檔案已開始下載");

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


// ===== 匯入 JSON 檔案 =====

async function importJSON(file) {
  if (!file) return;

  const validName = file.name.toLowerCase().endsWith(".json");

  if (!validName) {
    setStatus(
      "error",
      "檔案類型錯誤",
      "請選擇副檔名為 .json 的檔案。"
    );
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    setStatus(
      "error",
      "檔案過大",
      "目前支援最大 5 MB 的 JSON 檔案。"
    );
    return;
  }

  try {
    const text = await file.text();

    input.value = text;
    clearOutput();
    updateSizes();

    setStatus(
      "success",
      "檔案匯入成功",
      `已載入 ${file.name}，可以開始格式化或驗證。`
    );

  } catch (error) {
    console.error("檔案讀取失敗：", error);

    setStatus(
      "error",
      "檔案讀取失敗",
      "無法讀取這個檔案，請重新選擇。"
    );
  }
}


// ===== 按鈕事件 =====

formatBtn.addEventListener("click", formatJSON);
minifyBtn.addEventListener("click", minifyJSON);
validateBtn.addEventListener("click", validateJSON);

copyBtn.addEventListener("click", copyJSON);
downloadBtn.addEventListener("click", downloadJSON);

importBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  await importJSON(fileInput.files[0]);

  // 允許再次選取同一個檔案
  fileInput.value = "";
});

clearBtn.addEventListener("click", () => {
  input.value = "";
  clearOutput();
  updateSizes();

  setStatus(
    "neutral",
    "已清空",
    "請輸入新的 JSON 資料。"
  );

  input.focus();
});

// 修改原始輸入時，清除之前的處理結果
input.addEventListener("input", () => {
  clearOutput();

  setStatus(
    "neutral",
    "內容已變更",
    "請重新執行格式化、壓縮或驗證。"
  );
});

// 修改縮排選項時提示重新格式化
indentSize.addEventListener("change", () => {
  setStatus(
    "neutral",
    "縮排設定已變更",
    "再次點擊美化 JSON，即可使用新的縮排方式。"
  );
});


// ===== 初始化 =====

document.getElementById("year").textContent =
  new Date().getFullYear();

updateSizes();
