"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const input = $("fileInput");
  const dropZone = $("dropZone");
  const list = $("imageList");
  const canvas = $("previewCanvas");
  const empty = $("previewEmpty");
  const status = $("stitchStatus");
  const outputInfo = $("outputInfo");
  const downloadBtn = $("downloadBtn");
  const clearBtn = $("clearAll");
  const modeInput = $("layoutMode");
  const formatInput = $("outputFormat");
  const MAX_FILES = 20;
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_FILE_PIXELS = 40_000_000;
  const MAX_TOTAL_PIXELS = 65_000_000;
  const MAX_OUTPUT_PIXELS = 40_000_000;
  const MAX_OUTPUT_EDGE = 16_384;
  const types = new Set(["image/png", "image/jpeg", "image/webp"]);
  const items = [];
  let nextId = 1;
  let draggingId = null;
  let busy = false;
  let pending = 0;
  let loadGeneration = 0;
  let loadQueue = Promise.resolve();
  let frame = 0;
  let lastLayout = null;
  let loadError = "";

  function notify(message, type = "info") {
    window.WebToolboxNotify?.[type]?.(message);
  }
  function message(text) { status.textContent = text; }
  function updateButtons() {
    downloadBtn.disabled = busy || pending > 0 || !lastLayout;
    clearBtn.disabled = busy || (items.length === 0 && pending === 0);
  }
  function dispose(item) {
    item.bitmap.close();
    URL.revokeObjectURL(item.url);
  }
  function totalPixels() {
    return items.reduce((sum, item) => sum + item.bitmap.width * item.bitmap.height, 0);
  }
  function fileLabel(item) {
    return `${item.bitmap.width} × ${item.bitmap.height} px · ${(item.file.size / 1024 / 1024).toFixed(2)} MB`;
  }
  function move(from, to) {
    if (busy || pending || from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return;
    items.splice(to, 0, ...items.splice(from, 1));
    renderList();
    schedulePreview();
  }
  function renderList() {
    list.replaceChildren();
    $("fileCount").textContent = `${items.length} / ${MAX_FILES} 張圖片` + (pending ? " · 正在讀取圖片…" : "");
    items.forEach((item, index) => {
      const li = document.createElement("li");
      li.draggable = !busy && !pending;
      li.dataset.itemId = String(item.id);
      const thumb = document.createElement("img");
      thumb.src = item.url;
      thumb.alt = `第 ${index + 1} 張圖片縮圖`;
      thumb.className = "stitch-thumb";
      const details = document.createElement("span");
      details.className = "stitch-file-details";
      const filename = document.createElement("strong");
      filename.textContent = `${index + 1}. ${item.file.name}`;
      filename.title = item.file.name;
      const description = document.createElement("small");
      description.textContent = fileLabel(item);
      details.append(filename, description);
      const actions = document.createElement("span");
      actions.className = "stitch-file-actions";
      for (const [symbol, label, fn, disabled, extra] of [
        ["↑", "上移", () => move(index, index - 1), index === 0, ""],
        ["↓", "下移", () => move(index, index + 1), index === items.length - 1, ""],
        ["×", "移除", () => {
          if (busy || pending) return;
          dispose(items.splice(index, 1)[0]);
          renderList(); schedulePreview();
        }, false, "remove"]
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = symbol;
        button.className = extra;
        button.title = label;
        button.setAttribute("aria-label", `${label}第 ${index + 1} 張圖片`);
        button.disabled = disabled || busy || pending > 0;
        button.addEventListener("click", fn);
        actions.append(button);
      }
      li.append(thumb, details, actions);
      li.addEventListener("dragstart", event => {
        if (busy || pending) { event.preventDefault(); return; }
        draggingId = item.id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(item.id));
        li.classList.add("dragging");
      });
      li.addEventListener("dragend", () => {
        draggingId = null;
        list.querySelectorAll("li").forEach(el => el.classList.remove("dragging", "drop-before", "drop-after"));
      });
      li.addEventListener("dragover", event => {
        if (draggingId === null || draggingId === item.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        li.classList.toggle("drop-after", event.clientY > li.getBoundingClientRect().top + li.clientHeight / 2);
        li.classList.toggle("drop-before", event.clientY <= li.getBoundingClientRect().top + li.clientHeight / 2);
      });
      li.addEventListener("dragleave", () => li.classList.remove("drop-before", "drop-after"));
      li.addEventListener("drop", event => {
        if (draggingId === null) return;
        event.preventDefault();
        const from = items.findIndex(entry => entry.id === draggingId);
        const target = items.findIndex(entry => entry.id === item.id);
        if (from < 0 || target < 0 || from === target) return;
        const after = event.clientY > li.getBoundingClientRect().top + li.clientHeight / 2;
        const insertion = target + (after ? 1 : 0) - (from < target + (after ? 1 : 0) ? 1 : 0);
        move(from, insertion);
        draggingId = null;
      });
      list.append(li);
    });
    updateButtons();
  }

  async function decodeImage(file) {
    if (!types.has(file.type)) throw new Error(`${file.name}：僅支援 JPG、PNG、WebP。`);
    if (file.size === 0 || file.size > MAX_FILE_BYTES) throw new Error(`${file.name}：檔案不可為空或超過 20 MB。`);
    const bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height || bitmap.width > MAX_OUTPUT_EDGE || bitmap.height > MAX_OUTPUT_EDGE ||
        bitmap.width * bitmap.height > MAX_FILE_PIXELS) {
      bitmap.close();
      throw new Error(`${file.name}：圖片尺寸過大。`);
    }
    return bitmap;
  }
  async function processFiles(files, generation) {
    if (!files.length) return;
    const errors = [];
    pending++;
    loadError = "";
    renderList(); updateButtons();
    try {
      for (const file of files) {
        if (generation !== loadGeneration) break;
        if (items.length >= MAX_FILES) { errors.push(`最多只能加入 ${MAX_FILES} 張圖片。`); break; }
        let bitmap;
        try {
          bitmap = await decodeImage(file);
          if (generation !== loadGeneration) { bitmap.close(); break; }
          if (totalPixels() + bitmap.width * bitmap.height > MAX_TOTAL_PIXELS) {
            bitmap.close();
            errors.push("圖片總像素超過限制，請先移除部分圖片。");
            continue;
          }
          const url = URL.createObjectURL(file);
          items.push({ id: nextId++, file, bitmap, url });
          renderList();
        } catch (error) {
          if (bitmap) bitmap.close();
          if (generation === loadGeneration) errors.push(error.message || `${file.name}：圖片讀取失敗。`);
        }
      }
    } finally {
      pending--;
      renderList();
      if (generation === loadGeneration) {
        loadError = errors.join(" ");
        if (errors.length) notify(errors[0], "error");
        else if (files.length) notify(`已加入圖片，目前共 ${items.length} 張。`, "success");
      }
      schedulePreview();
    }
  }
  function addFiles(fileList) {
    if (busy) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const generation = loadGeneration;
    loadQueue = loadQueue.then(() => processFiles(files, generation));
  }
  dropZone.addEventListener("click", () => input.click());
  dropZone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); input.click(); }
  });
  dropZone.addEventListener("dragover", event => { event.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", event => {
    event.preventDefault(); dropZone.classList.remove("dragover");
    addFiles(event.dataTransfer.files);
  });
  input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
  clearBtn.addEventListener("click", () => {
    if (busy) return;
    loadGeneration++;
    loadError = "";
    items.splice(0).forEach(dispose);
    renderList(); schedulePreview();
  });

  function numeric(id, min, max) {
    const el = $(id);
    const text = el.value.trim();
    const value = Number(text);
    if (!text || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${el.closest("label")?.firstChild?.textContent?.trim() || id} 必須介於 ${min}～${max}。`);
    }
    return value;
  }
  function getLayout() {
    if (!items.length) return null;
    const width = numeric("outputWidth", 200, 6000);
    const gap = numeric("gap", 0, 120);
    const padding = numeric("padding", 0, 120);
    const innerWidth = width - 2 * padding;
    if (innerWidth <= 0) throw new Error("輸出寬度需要大於兩側留白。");
    const layoutMode = modeInput.value;
    const positions = [];
    let height;
    if (layoutMode === "vertical") {
      let y = padding;
      for (const item of items) {
        const h = innerWidth * item.bitmap.height / item.bitmap.width;
        positions.push({ item, x: padding, y, width: innerWidth, height: h, crop: false });
        y += h + gap;
      }
      height = y - gap + padding;
    } else if (layoutMode === "horizontal") {
      const available = innerWidth - gap * (items.length - 1);
      const sumRatios = items.reduce((sum, item) => sum + item.bitmap.width / item.bitmap.height, 0);
      const commonHeight = available / sumRatios;
      if (commonHeight < 1) throw new Error("圖片太多或間距太大，請加大輸出寬度或減少間距。");
      let x = padding;
      for (const item of items) {
        const w = commonHeight * item.bitmap.width / item.bitmap.height;
        positions.push({ item, x, y: padding, width: w, height: commonHeight, crop: false });
        x += w + gap;
      }
      height = commonHeight + padding * 2;
    } else {
      const columns = Number($("columns").value);
      const ratio = Number($("cellRatio").value);
      const cellWidth = (innerWidth - gap * (columns - 1)) / columns;
      if (cellWidth < 1) throw new Error("網格欄數太多或間距太大，請調整設定。");
      const cellHeight = cellWidth / ratio;
      const rows = Math.ceil(items.length / columns);
      items.forEach((item, index) => positions.push({
        item, x: padding + (index % columns) * (cellWidth + gap),
        y: padding + Math.floor(index / columns) * (cellHeight + gap),
        width: cellWidth, height: cellHeight, crop: $("fitMode").value === "cover", grid: true
      }));
      height = padding * 2 + rows * cellHeight + (rows - 1) * gap;
    }
    height = Math.ceil(height);
    if (width > MAX_OUTPUT_EDGE || height > MAX_OUTPUT_EDGE || width * height > MAX_OUTPUT_PIXELS) {
      throw new Error("拼接結果超過 16,384 px 或 4,000 萬像素，請減少圖片或調低輸出寬度。");
    }
    return { width, height, positions, background: $("backgroundColor").value };
  }
  function draw(ctx, layout, scale) {
    const { width, height, positions, background } = layout;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width * scale, height * scale);
    for (const p of positions) {
      const bmp = p.item.bitmap;
      let { x, y, width: w, height: h } = p;
      x *= scale; y *= scale; w *= scale; h *= scale;
      if (!p.grid) {
        ctx.drawImage(bmp, x, y, w, h);
      } else if (p.crop) {
        // Fill the cell: crop evenly from the source's centre.
        const sourceRatio = bmp.width / bmp.height;
        const targetRatio = w / h;
        let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
        if (sourceRatio > targetRatio) { sw = bmp.height * targetRatio; sx = (bmp.width - sw) / 2; }
        else { sh = bmp.width / targetRatio; sy = (bmp.height - sh) / 2; }
        ctx.drawImage(bmp, sx, sy, sw, sh, x, y, w, h);
      } else {
        const imageRatio = bmp.width / bmp.height;
        const boxRatio = w / h;
        const dw = imageRatio > boxRatio ? w : h * imageRatio;
        const dh = imageRatio > boxRatio ? w / imageRatio : h;
        ctx.drawImage(bmp, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      }
    }
  }
  function renderPreview() {
    frame = 0;
    lastLayout = null;
    if (!items.length) {
      canvas.hidden = true;
      empty.hidden = false;
      empty.textContent = "請先選擇圖片，預覽將在這裡顯示";
      outputInfo.textContent = "尚無輸出尺寸";
      message(loadError || (pending ? "正在讀取圖片…" : "請先上傳圖片。"));
      updateButtons();
      return;
    }
    try {
      const layout = getLayout();
      const scale = Math.min(1, 960 / layout.width, 620 / layout.height);
      canvas.width = Math.max(1, Math.floor(layout.width * scale));
      canvas.height = Math.max(1, Math.floor(layout.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("瀏覽器無法建立預覽畫布。");
      draw(ctx, layout, canvas.width / layout.width);
      canvas.hidden = false;
      empty.hidden = true;
      outputInfo.textContent = `${layout.width.toLocaleString()} × ${layout.height.toLocaleString()} px`;
      message(loadError || (pending ? "正在讀取圖片…" : "預覽已更新，可以下載原始解析度拼接圖片。"));
      lastLayout = layout;
    } catch (error) {
      canvas.hidden = true;
      empty.hidden = false;
      empty.textContent = "請調整設定以產生預覽";
      outputInfo.textContent = "設定需調整";
      message(error.message || "無法產生預覽。");
    }
    updateButtons();
  }
  function schedulePreview() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(renderPreview);
    updateButtons();
  }
  modeInput.addEventListener("change", () => {
    loadError = "";
    const isGrid = modeInput.value === "grid";
    for (const id of ["columnsField", "cellRatioField", "fitField"]) $(id).hidden = !isGrid;
    schedulePreview();
  });
  formatInput.addEventListener("change", () => {
    loadError = "";
    $("qualityField").hidden = formatInput.value === "image/png";
    schedulePreview();
  });
  for (const id of ["outputWidth", "gap", "padding", "backgroundColor", "columns", "cellRatio", "fitMode", "quality"]) {
    $(id).addEventListener("input", () => {
      loadError = "";
      $("qualityValue").textContent = `${$("quality").value}%`;
      schedulePreview();
    });
  }
  downloadBtn.addEventListener("click", async () => {
    if (!lastLayout || busy || pending) return;
    busy = true;
    updateButtons(); renderList();
    message("正在產生完整解析度圖片，請稍候…");
    let exportCanvas = null;
    try {
      const layout = getLayout();
      exportCanvas = document.createElement("canvas");
      exportCanvas.width = layout.width;
      exportCanvas.height = layout.height;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) throw new Error("無法建立輸出畫布，請調低輸出寬度。");
      draw(ctx, layout, 1);
      const requestedType = formatInput.value;
      const quality = Number($("quality").value) / 100;
      const blob = await new Promise((resolve, reject) => {
        exportCanvas.toBlob(value => value ? resolve(value) : reject(new Error("圖片編碼失敗，請嘗試較小尺寸。")), requestedType, quality);
      });
      if (blob.type !== requestedType) throw new Error("此瀏覽器不支援選擇的輸出格式，請改用 PNG 或 JPG。");
      const extension = requestedType === "image/jpeg" ? "jpg" : requestedType === "image/webp" ? "webp" : "png";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `WebToolbox-Stitched-Image.${extension}`;
      document.body.appendChild(a);
      a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      message(`已產生 ${layout.width} × ${layout.height} px 的 ${extension.toUpperCase()} 圖片。`);
      notify("拼接圖片已開始下載。", "success");
    } catch (error) {
      message(error.message || "下載失敗，請重試。");
      notify(error.message || "下載失敗，請重試。", "error");
      console.error("WebToolbox image stitch export:", error);
    } finally {
      if (exportCanvas) { exportCanvas.width = 0; exportCanvas.height = 0; }
      busy = false;
      renderList(); updateButtons();
    }
  });
  window.addEventListener("pagehide", () => { items.splice(0).forEach(dispose); });
  renderList(); schedulePreview();
})();
