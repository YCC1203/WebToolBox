
"use strict";

// ===== 取得網頁元素 =====

const textInput = document.getElementById("textInput");

const totalChars = document.getElementById("totalChars");
const noSpaceChars = document.getElementById("noSpaceChars");
const chineseChars = document.getElementById("chineseChars");
const englishWords = document.getElementById("englishWords");
const lineCount = document.getElementById("lineCount");
const byteCount = document.getElementById("byteCount");

const undoBtn = document.getElementById("undoBtn");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const textStatus = document.getElementById("textStatus");

const formatter = new Intl.NumberFormat("zh-TW");
const encoder = new TextEncoder();

// 儲存最近的操作紀錄，最多 30 步
const history = [];
const MAX_HISTORY = 30;


// ===== 顯示狀態訊息 =====

function showStatus(message, error = false, toast = false) {
  textStatus.textContent = message;
  textStatus.style.color = error ? "#ff9a9a" : "#9ae6bf";

  if (!toast || !message) return;

  const cleanMessage = message.replace(/^✓\s*/, "");
  if (error) {
    window.WebToolboxNotify?.error(cleanMessage);
  } else {
    window.WebToolboxNotify?.success(cleanMessage);
  }
}


// ===== 統計文字 =====

function updateStatistics() {
  const text = textInput.value;

  // 使用 Unicode 字元計數
  const characters = Array.from(text);

  // 不含空白字元
  const withoutSpaces = characters.filter(char => !/\s/u.test(char));

  // Unicode 漢字
  const chinese = text.match(/\p{Script=Han}/gu) || [];

  // 英文單字，包括英文縮寫中的撇號
  const english = text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || [];

  // 空白文字顯示 0 行
  const lines = text.length === 0
    ? 0
    : text.split(/\r\n|\r|\n/).length;

  // UTF-8 位元組數
  const bytes = encoder.encode(text).length;

  totalChars.textContent = formatter.format(characters.length);
  noSpaceChars.textContent = formatter.format(withoutSpaces.length);
  chineseChars.textContent = formatter.format(chinese.length);
  englishWords.textContent = formatter.format(english.length);
  lineCount.textContent = formatter.format(lines);

  byteCount.textContent = bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(2)} KB`
      : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}


// ===== 操作紀錄與還原 =====

function saveHistory() {
  const currentText = textInput.value;

  if (history[history.length - 1] !== currentText) {
    history.push(currentText);
  }

  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  undoBtn.disabled = history.length === 0;
}

function applyText(newText) {
  if (newText === textInput.value) {
    showStatus("文字內容沒有變化。");
    return;
  }

  saveHistory();
  textInput.value = newText;
  updateStatistics();
  textInput.focus();

  showStatus("✓ 文字處理完成");
}

function undoAction() {
  if (history.length === 0) {
    showStatus("沒有可以還原的操作。", true);
    return;
  }

  textInput.value = history.pop();
  undoBtn.disabled = history.length === 0;

  updateStatistics();
  showStatus("✓ 已還原上一次操作");
}


// ===== 文字轉換函式 =====

const actions = {

  // 全部大寫
  upper(text) {
    return text.toUpperCase();
  },

  // 全部小寫
  lower(text) {
    return text.toLowerCase();
  },

  // 英文單字首字母大寫
  title(text) {
    return text.toLowerCase().replace(
      /[A-Za-z]+(?:['’][A-Za-z]+)*/g,
      word => word.charAt(0).toUpperCase() + word.slice(1)
    );
  },

  // 連續空白與 Tab 合併為一個空白
  spaces(text) {
    return text
      .split(/\r\n|\r|\n/)
      .map(line => line.replace(/[ \t]+/g, " ").trim())
      .join("\n");
  },

  // 移除全空白行
  empty(text) {
    return text
      .split(/\r\n|\r|\n/)
      .filter(line => line.trim() !== "")
      .join("\n");
  },

  // 移除全文首尾空白
  trim(text) {
    return text.trim();
  },

  // 移除重複行，保留第一次出現者
  unique(text) {
    const lines = text.split(/\r\n|\r|\n/);
    return [...new Set(lines)].join("\n");
  },

  // 反轉每一行的順序
  reverse(text) {
    return text
      .split(/\r\n|\r|\n/)
      .reverse()
      .join("\n");
  },

  // 按字母及數字順序排序
  sort(text) {
    return text
      .split(/\r\n|\r|\n/)
      .sort((a, b) =>
        a.localeCompare(b, "zh-Hant", { numeric: true })
      )
      .join("\n");
  }
};


// ===== 執行文字轉換 =====

function runAction(actionName) {
  if (textInput.value.length === 0) {
    showStatus("請先輸入需要處理的文字。", true);
    return;
  }

  const action = actions[actionName];

  if (!action) {
    showStatus("不支援這個功能。", true);
    return;
  }

  applyText(action(textInput.value));
}


// ===== 複製文字 =====

async function copyText() {
  const text = textInput.value;

  if (!text) {
    showStatus("沒有可以複製的文字。", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showStatus("✓ 已複製到剪貼簿", false, true);
  } catch (error) {
    console.error("複製失敗：", error);
    showStatus("無法自動複製，請手動選取文字。", true, true);
  }
}


// ===== 下載 TXT =====

function downloadText() {
  const text = textInput.value;

  if (!text) {
    showStatus("沒有可以下載的文字。", true);
    return;
  }

  // 加入 UTF-8 BOM，提升 Windows 記事本相容性
  const blob = new Blob(
    ["\uFEFF", text],
    { type: "text/plain;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "WebToolbox-Text.txt";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showStatus("✓ TXT 檔案已開始下載", false, true);
}


// ===== 事件監聽 =====

// 手動輸入時更新數據
textInput.addEventListener("input", () => {
  updateStatistics();
  showStatus("");
});

// 所有轉換按鈕共用一個事件監聽
document.querySelectorAll("[data-action]").forEach(button => {
  button.addEventListener("click", () => {
    runAction(button.dataset.action);
  });
});

// 清空文字
clearBtn.addEventListener("click", () => {
  if (!textInput.value) {
    showStatus("文字編輯區已經是空的。");
    return;
  }

  applyText("");
});

// 還原操作
undoBtn.addEventListener("click", undoAction);

// 複製文字
copyBtn.addEventListener("click", copyText);

// 下載文字
downloadBtn.addEventListener("click", downloadText);

// 頁尾年份
document.getElementById("year").textContent =
  new Date().getFullYear();

// 初始化
updateStatistics();
