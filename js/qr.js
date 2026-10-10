
"use strict";

// 取得網頁元素
const qrText = document.getElementById("qrText");
const qrSize = document.getElementById("qrSize");
const qrDark = document.getElementById("qrDark");
const qrLight = document.getElementById("qrLight");
const qrOutput = document.getElementById("qrOutput");
const qrPlaceholder = document.getElementById("qrPlaceholder");
const qrStatus = document.getElementById("qrStatus");
const charCount = document.getElementById("charCount");
const generateBtn = document.getElementById("generateBtn");
const downloadBtn = document.getElementById("downloadBtn");

let currentCanvas = null;
let updateTimer = null;

// 更新字元數
function updateCharCount() {
  charCount.textContent = `${qrText.value.length} / 1000`;
}

// 清除舊的 QR Code
function clearQR() {
  qrOutput.replaceChildren(qrPlaceholder);
  qrOutput.classList.remove("has-code");
  currentCanvas = null;
  downloadBtn.disabled = true;
}

// 產生 QR Code
function generateQR() {
  const text = qrText.value.trim();

  clearQR();

  if (!text) {
    qrStatus.textContent = "請先輸入網址或文字內容";
    return;
  }

  if (typeof QRCode === "undefined") {
    qrStatus.textContent = "QR Code 函式庫載入失敗，請檢查網路連線";
    return;
  }

  const size = Number(qrSize.value);
  const dark = qrDark.value;
  const light = qrLight.value;

  if (dark.toLowerCase() === light.toLowerCase()) {
    qrStatus.textContent = "前景色與背景色不能相同";
    return;
  }

  try {
    const container = document.createElement("div");

    // 使用 QRCode.js 產生圖片
    new QRCode(container, {
      text: text,
      width: size,
      height: size,
      colorDark: dark,
      colorLight: light,
      correctLevel: QRCode.CorrectLevel.M
    });

    const canvas = container.querySelector("canvas");

    if (!canvas) {
      throw new Error("無法取得 QR Code 圖片");
    }

    // 儲存原始 Canvas，供下載使用
    currentCanvas = canvas;

    // 建立圖片預覽
    const preview = document.createElement("img");
    preview.src = canvas.toDataURL("image/png");
    preview.alt = "產生的 QR Code";
    preview.width = size;
    preview.height = size;

    qrOutput.replaceChildren(preview);
    qrOutput.classList.add("has-code");

    downloadBtn.disabled = false;
    qrStatus.textContent = `已成功產生 ${size} × ${size} px QR Code`;

  } catch (error) {
    console.error("QR Code 產生失敗：", error);
    clearQR();
    qrStatus.textContent =
      "產生失敗，請縮短文字長度或調整設定";
  }
}

// 下載 PNG，並加入 QR Code 所需的留白
function downloadQR() {
  if (!currentCanvas) return;

  const source = currentCanvas;
  const margin = Math.round(source.width * 0.06);

  const canvas = document.createElement("canvas");
  canvas.width = source.width + margin * 2;
  canvas.height = source.height + margin * 2;

  const ctx = canvas.getContext("2d");

  // 填入背景色
  ctx.fillStyle = qrLight.value;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 放入 QR Code
  ctx.drawImage(source, margin, margin);

  // 輸出 PNG
  canvas.toBlob(blob => {
    if (!blob) {
      qrStatus.textContent = "圖片匯出失敗，請再試一次";
      window.WebToolboxNotify?.error("QR Code 圖片匯出失敗");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "WebToolbox-QRCode.png";

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.WebToolboxNotify?.success("QR Code PNG 已開始下載");

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

// 輸入時自動重新產生
function scheduleGenerate() {
  updateCharCount();

  // 避免使用者每輸入一個字就立即重算
  clearTimeout(updateTimer);

  updateTimer = setTimeout(() => {
    generateQR();
  }, 450);
}

// 使用者輸入文字
qrText.addEventListener("input", scheduleGenerate);

// 點擊產生按鈕
generateBtn.addEventListener("click", () => {
  clearTimeout(updateTimer);
  generateQR();
});

// 修改尺寸或顏色後重新產生
[qrSize, qrDark, qrLight].forEach(input => {
  input.addEventListener("change", () => {
    clearTimeout(updateTimer);
    generateQR();
  });
});

// 點擊下載按鈕
downloadBtn.addEventListener("click", downloadQR);

// 更新頁尾年份
document.getElementById("year").textContent =
  new Date().getFullYear();

// 初始狀態
updateCharCount();
