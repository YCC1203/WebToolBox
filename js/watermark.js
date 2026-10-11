"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const sourceInput = $("sourceFile");
  const logoInput = $("logoFile");
  const sourceInfo = $("sourceInfo");
  const logoInfo = $("logoInfo");
  const textInput = $("watermarkText");
  const modeInputs = document.querySelectorAll('input[name="watermarkMode"]');
  const opacityInput = $("opacity");
  const sizeInput = $("size");
  const colorInput = $("textColor");
  const canvas = $("previewCanvas");
  const empty = $("previewEmpty");
  const status = $("watermarkStatus");
  const download = $("downloadWatermark");
  const positions = $("positionValue");
  const positionButtons = $("positionTitle").nextElementSibling;
  const positionNames = {
    tl: "左上", tc: "正上", tr: "右上",
    ml: "正左", mc: "正中", mr: "正右",
    bl: "左下", bc: "正下", br: "右下"
  };
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const maxPixels = 40_000_000;
  let source = null;
  let logo = null;
  let sourceName = "image";
  let mode = "text";
  let position = "br";
  let scheduledFrame = 0;
  let sourceRequest = 0;
  let logoRequest = 0;
  let busy = false;
  let sourceError = "";
  let logoError = "";

  function notify(message, type = "error") {
    if (window.WebToolboxNotify && typeof window.WebToolboxNotify[type] === "function") {
      window.WebToolboxNotify[type](message);
    }
  }

  function setStatus(message) { status.textContent = message; }

  function ready() {
    return !!source && (mode === "text" ? textInput.value.trim().length > 0 : !!logo);
  }

  function updateAvailability() { download.disabled = busy || !ready(); }

  function updateControls() {
    $("textField").hidden = mode !== "text";
    $("logoField").hidden = mode !== "logo";
    $("colorField").hidden = mode !== "text";
    $("sizeHint").textContent = mode === "text"
      ? "文字高度相對於圖片短邊的百分比"
      : "Logo 寬度相對於原圖寬度的百分比";
    updateAvailability();
  }

  function getPosition(width, height, markWidth, markHeight) {
    const pad = Math.min(width, height) * 0.04;
    const xMode = position[1] === "l" ? "l" : position[1] === "r" ? "r" : "c";
    // 位置代號 tl/tc/tr、ml/mc/mr、bl/bc/br；第二字母決定水平。
    const x = xMode === "l" ? pad
      : xMode === "r" ? width - pad - markWidth : (width - markWidth) / 2;
    const y = position[0] === "t" ? pad
      : position[0] === "b" ? height - pad - markHeight : (height - markHeight) / 2;
    return [Math.max(0, x), Math.max(0, y)];
  }

  function drawWatermark(ctx, width, height) {
    if (!source) return;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    const opacity = Number(opacityInput.value) / 100;
    if (opacity === 0) return;
    const size = Number(sizeInput.value) / 100;
    const pad = Math.min(width, height) * 0.04;

    ctx.save();
    ctx.globalAlpha = opacity;
    if (mode === "text") {
      const content = textInput.value.trim();
      if (content) {
        let fontSize = Math.max(1, Math.min(width, height) * size);
        ctx.font = `700 ${fontSize}px "Noto Sans TC", system-ui, sans-serif`;
        const measured = ctx.measureText(content).width;
        const maxWidth = Math.max(1, width - 2 * pad);
        if (measured > maxWidth) {
          fontSize = Math.max(1, fontSize * maxWidth / measured);
          ctx.font = `700 ${fontSize}px "Noto Sans TC", system-ui, sans-serif`;
        }
        const textWidth = Math.min(maxWidth, ctx.measureText(content).width);
        const textHeight = fontSize * 1.2;
        const [x, y] = getPosition(width, height, textWidth, textHeight);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(0,0,0,.8)";
        ctx.lineWidth = Math.max(1, fontSize * 0.045);
        ctx.fillStyle = colorInput.value;
        ctx.strokeText(content, x, y + textHeight / 2, maxWidth);
        ctx.fillText(content, x, y + textHeight / 2, maxWidth);
      }
    } else if (logo) {
      let markWidth = Math.min(width - 2 * pad, width * size);
      let markHeight = markWidth * logo.height / logo.width;
      if (markHeight > height - 2 * pad) {
        const scale = (height - 2 * pad) / markHeight;
        markWidth *= scale;
        markHeight *= scale;
      }
      const [x, y] = getPosition(width, height, markWidth, markHeight);
      ctx.drawImage(logo, x, y, markWidth, markHeight);
    }
    ctx.restore();
  }

  function renderPreview() {
    scheduledFrame = 0;
    updateAvailability();
    if (!source) {
      canvas.style.display = "none";
      empty.hidden = false;
      setStatus(sourceError || "請先選擇原始圖片。");
      return;
    }
    const ratio = Math.min(1, 1100 / source.width, 740 / source.height);
    const width = Math.max(1, Math.round(source.width * ratio));
    const height = Math.max(1, Math.round(source.height * ratio));
    canvas.width = width;
    canvas.height = height;
    try {
      drawWatermark(canvas.getContext("2d"), width, height);
      canvas.style.display = "block";
      empty.hidden = true;
      if (ready()) setStatus(`預覽已更新，下載尺寸：${source.width} × ${source.height} px（PNG）。`);
      else if (mode === "logo") setStatus(logoError || "請先選擇 Logo 圖片。");
      else setStatus("請輸入浮水印文字。");
    } catch (error) {
      setStatus("預覽失敗，請嘗試更換圖片。");
      notify("無法產生浮水印預覽。");
      console.error("WebToolbox watermark preview:", error);
    }
  }

  function schedulePreview() {
    updateAvailability();
    if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
    scheduledFrame = requestAnimationFrame(renderPreview);
  }

  async function decodeFile(file, limit, label) {
    if (!allowedTypes.has(file.type)) throw new Error(`${label}僅支援 JPG、PNG、WebP。`);
    if (file.size === 0 || file.size > limit) throw new Error(`${label}檔案為空或超過大小限制。`);
    const bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > maxPixels ||
        bitmap.width > 16384 || bitmap.height > 16384) {
      bitmap.close();
      throw new Error(`${label}尺寸過大，最多 4000 萬像素且單邊不得超過 16384 px。`);
    }
    return bitmap;
  }

  sourceInput.addEventListener("change", async () => {
    const request = ++sourceRequest;
    const file = sourceInput.files?.[0];
    if (source) source.close();
    source = null;
    sourceName = "image";
    sourceError = "";
    sourceInfo.textContent = "請選擇圖片（20 MB 以下）。";
    schedulePreview();
    if (!file) return;
    setStatus("正在讀取圖片…");
    try {
      const bitmap = await decodeFile(file, 20 * 1024 * 1024, "原始圖片");
      if (request !== sourceRequest) { bitmap.close(); return; }
      source = bitmap;
      sourceName = file.name;
      sourceInfo.textContent = `${file.name}｜${bitmap.width} × ${bitmap.height} px`;
      schedulePreview();
    } catch (error) {
      if (request !== sourceRequest) return;
      sourceError = error.message || "無法讀取圖片。";
      setStatus(sourceError);
      notify(error.message || "無法讀取圖片。");
      sourceInput.value = "";
    }
  });

  logoInput.addEventListener("change", async () => {
    const request = ++logoRequest;
    const file = logoInput.files?.[0];
    if (logo) logo.close();
    logo = null;
    logoError = "";
    logoInfo.textContent = "建議透明背景 PNG，檔案不超過 10 MB。";
    schedulePreview();
    if (!file) return;
    try {
      const bitmap = await decodeFile(file, 10 * 1024 * 1024, "Logo");
      if (request !== logoRequest) { bitmap.close(); return; }
      logo = bitmap;
      logoInfo.textContent = `${file.name}｜${bitmap.width} × ${bitmap.height} px`;
      schedulePreview();
    } catch (error) {
      if (request !== logoRequest) return;
      logoError = error.message || "無法讀取 Logo。";
      setStatus(logoError);
      notify(error.message || "無法讀取 Logo。");
      logoInput.value = "";
    }
  });

  for (const input of modeInputs) input.addEventListener("change", () => {
    if (!input.checked) return;
    mode = input.value;
    updateControls();
    schedulePreview();
  });

  for (const input of [textInput, colorInput, opacityInput, sizeInput]) {
    input.addEventListener("input", () => {
      $("opacityValue").textContent = `${opacityInput.value}%`;
      $("sizeValue").textContent = `${sizeInput.value}%`;
      schedulePreview();
    });
  }

  positionButtons.addEventListener("click", event => {
    const button = event.target.closest("button[data-pos]");
    if (!button || !positionNames[button.dataset.pos]) return;
    position = button.dataset.pos;
    for (const b of positionButtons.querySelectorAll("button[data-pos]")) {
      const selected = b === button;
      b.classList.toggle("selected", selected);
      b.setAttribute("aria-pressed", String(selected));
    }
    positions.textContent = `目前位置：${positionNames[position]}`;
    schedulePreview();
  });

  download.addEventListener("click", async () => {
    if (!ready() || busy) return;
    busy = true;
    updateAvailability();
    setStatus("正在產生原始解析度 PNG…");
    let exportCanvas = null;
    try {
      exportCanvas = document.createElement("canvas");
      exportCanvas.width = source.width;
      exportCanvas.height = source.height;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) throw new Error("瀏覽器無法建立繪圖畫布。");
      drawWatermark(ctx, exportCanvas.width, exportCanvas.height);
      const blob = await new Promise((resolve, reject) => {
        exportCanvas.toBlob(result => result ? resolve(result) : reject(new Error("PNG 產生失敗。")), "image/png");
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stem = sourceName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").slice(0, 100) || "image";
      anchor.href = objectUrl;
      anchor.download = `${stem}-watermarked.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setStatus(`已產生 ${source.width} × ${source.height} px 的 PNG。`);
      notify("浮水印圖片已開始下載。", "success");
    } catch (error) {
      setStatus(error.message || "產生 PNG 時發生錯誤。");
      notify(error.message || "產生 PNG 時發生錯誤。");
      console.error("WebToolbox watermark export:", error);
    } finally {
      if (exportCanvas) { exportCanvas.width = 0; exportCanvas.height = 0; }
      busy = false;
      updateAvailability();
    }
  });

  updateControls();
  schedulePreview();
})();
