"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const canvas = $("editorCanvas");
  const ctx = canvas.getContext("2d");
  const list = $("layerList");
  const fileInput = $("imageFiles");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  const MAX_FILES = 12;
  const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
  const MAX_FILE_PIXELS = 30_000_000;
  const MAX_TOTAL_PIXELS = 60_000_000;
  const MAX_OUTPUT_PIXELS = 20_000_000;
  const MAX_HISTORY = 35;
  const assets = new Map();
  let nextId = 1;
  let layers = [];
  let selectedId = null;
  let width = 1200;
  let height = 800;
  let background = "#ffffff";
  let transparent = false;
  let history = [];
  let historyIndex = -1;
  let pending = false;
  let exporting = false;
  let frame = 0;
  let previewRatio = 1;
  let pointer = null;

  const notify = (msg, type = "info") => window.WebToolboxNotify?.[type]?.(msg);
  const status = text => { $("composerStatus").textContent = text; };
  const selected = () => layers.find(layer => layer.id === selectedId) || null;
  const cloneState = () => ({
    layers: layers.map(({ ...fields }) => fields), selectedId,
    width, height, background, transparent
  });
  function releaseUnreferenced() {
    const used = new Set();
    for (const layer of layers) if (layer.assetId) used.add(layer.assetId);
    for (const snapshot of history) {
      for (const layer of snapshot.layers) if (layer.assetId) used.add(layer.assetId);
    }
    for (const [id, asset] of assets) {
      if (used.has(id)) continue;
      asset.bitmap.close();
      URL.revokeObjectURL(asset.url);
      assets.delete(id);
    }
  }
  function save() {
    const snapshot = cloneState();
    const last = history[historyIndex];
    if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return;
    history.splice(historyIndex + 1);
    history.push(snapshot);
    if (history.length > MAX_HISTORY) history.shift();
    historyIndex = history.length - 1;
    releaseUnreferenced();
    refresh();
  }
  function restore(snapshot) {
    layers = snapshot.layers.map(layer => ({ ...layer }));
    selectedId = snapshot.selectedId;
    width = snapshot.width;
    height = snapshot.height;
    background = snapshot.background;
    transparent = snapshot.transparent;
    $("canvasWidth").value = width;
    $("canvasHeight").value = height;
    $("backgroundColor").value = background;
    $("transparentBg").checked = transparent;
    refresh();
  }
  function undo() {
    if (pending || exporting || historyIndex <= 0) return;
    restore(history[--historyIndex]);
    status("已復原上一步。");
  }
  function redo() {
    if (pending || exporting || historyIndex >= history.length - 1) return;
    restore(history[++historyIndex]);
    status("已重做上一步。");
  }
  $("undoBtn").addEventListener("click", undo);
  $("redoBtn").addEventListener("click", redo);
  document.addEventListener("keydown", event => {
    const editing = event.target instanceof HTMLElement &&
      (event.target.matches("input, textarea, select") || event.target.isContentEditable);
    if (editing || !event.ctrlKey && !event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
    else if (key === "y" || key === "z" && event.shiftKey) { event.preventDefault(); redo(); }
  });

  function button(label, title, cb, disabled = false) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.title = title;
    el.setAttribute("aria-label", title);
    el.disabled = disabled || pending || exporting;
    el.addEventListener("click", cb);
    return el;
  }
  function layerName(layer) {
    return layer.type === "text" ? `文字：${layer.text.slice(0, 18) || "空白"}` : (assets.get(layer.assetId)?.name || "圖片");
  }
  function drawLayerControls() {
    list.replaceChildren();
    $("layerCount").textContent = `${layers.length} 個圖層`;
    $("layerEmpty").hidden = layers.length > 0;
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const li = document.createElement("li");
      li.className = "composer-layer-item" + (selectedId === layer.id ? " is-selected" : "");
      const select = button(layer.type === "text" ? "T" : "▧", `選取${layerName(layer)}`, () => choose(layer.id));
      select.className = "composer-layer-select";
      const text = document.createElement("span");
      text.textContent = layerName(layer);
      const hint = document.createElement("small");
      hint.textContent = `${i === layers.length - 1 ? "最上層" : `第 ${i + 1} 層`} · ${layer.visible ? "顯示" : "隱藏"}`;
      select.replaceChildren(text, hint);
      const actions = document.createElement("span");
      actions.className = "composer-layer-buttons";
      actions.append(
        button("↑", `上移${layerName(layer)}`, () => moveLayer(layer.id, 1), i === layers.length - 1),
        button("↓", `下移${layerName(layer)}`, () => moveLayer(layer.id, -1), i === 0),
        button(layer.visible ? "◉" : "○", `${layer.visible ? "隱藏" : "顯示"}${layerName(layer)}`, () => {
          layer.visible = !layer.visible; save();
        }),
        button("×", `移除${layerName(layer)}`, () => {
          layers = layers.filter(entry => entry.id !== layer.id);
          if (selectedId === layer.id) selectedId = null;
          save();
        })
      );
      li.append(select, actions);
      list.append(li);
    }
  }
  function choose(id) {
    selectedId = id;
    refresh();
  }
  function moveLayer(id, direction) {
    const index = layers.findIndex(layer => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= layers.length) return;
    [layers[index], layers[target]] = [layers[target], layers[index]];
    save();
  }
  function updateInspector() {
    const layer = selected();
    $("inspector").hidden = !layer;
    $("inspector").disabled = !layer || pending || exporting;
    $("selectionEmpty").hidden = !!layer;
    if (!layer) return;
    $("textOptions").hidden = layer.type !== "text";
    $("textValue").value = layer.text || "";
    $("fontSize").value = layer.fontSize || 64;
    $("fontColor").value = layer.color || "#1f2937";
    $("posX").value = Math.round(layer.x);
    $("posY").value = Math.round(layer.y);
    $("layerScale").value = Math.round(layer.scale * 100);
    $("scaleValue").textContent = `${Math.round(layer.scale * 100)}%`;
    $("rotation").value = Math.round(layer.rotation);
    $("rotationValue").textContent = `${Math.round(layer.rotation)}°`;
    $("layerOpacity").value = Math.round(layer.opacity * 100);
    $("opacityValue").textContent = `${Math.round(layer.opacity * 100)}%`;
  }
  function refresh() {
    drawLayerControls();
    updateInspector();
    $("undoBtn").disabled = pending || exporting || historyIndex <= 0;
    $("redoBtn").disabled = pending || exporting || historyIndex >= history.length - 1;
    $("clearBtn").disabled = pending || exporting || !layers.length;
    $("downloadBtn").disabled = pending || exporting || !layers.length;
    $("addTextBtn").disabled = pending || exporting || layers.length >= MAX_FILES;
    fileInput.disabled = pending || exporting || layers.length >= MAX_FILES;
    scheduleRender();
  }
  const drawingSize = layer => {
    if (layer.type === "image") return [layer.baseWidth * layer.scale, layer.baseHeight * layer.scale];
    ctx.save();
    ctx.font = `700 ${layer.fontSize}px system-ui, "Noto Sans TC", sans-serif`;
    const measured = ctx.measureText(layer.text || " ").width;
    ctx.restore();
    return [Math.max(1, measured * layer.scale), layer.fontSize * 1.25 * layer.scale];
  };
  function renderScene(target, cw, ch, preview = false, format = "image/png") {
    target.clearRect(0, 0, target.canvas.width, target.canvas.height);
    if (!transparent) {
      target.fillStyle = background;
      target.fillRect(0, 0, cw, ch);
    } else if (format === "image/jpeg") {
      target.fillStyle = "#ffffff";
      target.fillRect(0, 0, cw, ch);
    }
    for (const layer of layers) {
      if (!layer.visible) continue;
      target.save();
      target.translate(layer.x, layer.y);
      target.rotate(layer.rotation * Math.PI / 180);
      target.globalAlpha = layer.opacity;
      const [w, h] = drawingSize(layer);
      if (layer.type === "image") {
        const bitmap = assets.get(layer.assetId)?.bitmap;
        if (bitmap) target.drawImage(bitmap, -w / 2, -h / 2, w, h);
      } else if (layer.text) {
        target.fillStyle = layer.color;
        target.font = `700 ${layer.fontSize * layer.scale}px system-ui, "Noto Sans TC", sans-serif`;
        target.textAlign = "center";
        target.textBaseline = "middle";
        target.fillText(layer.text, 0, 0);
      }
      target.restore();
    }
    if (!preview || !selected()?.visible) return;
    const layer = selected();
    const [w, h] = drawingSize(layer);
    target.save();
    target.translate(layer.x, layer.y);
    target.rotate(layer.rotation * Math.PI / 180);
    target.lineWidth = 2 / previewRatio;
    target.strokeStyle = "#987aff";
    target.setLineDash([6 / previewRatio, 4 / previewRatio]);
    target.strokeRect(-w / 2, -h / 2, w, h);
    target.setLineDash([]);
    target.beginPath();
    target.arc(w / 2, h / 2, 7 / previewRatio, 0, Math.PI * 2);
    target.fillStyle = "#ffffff";
    target.fill();
    target.strokeStyle = "#6950e9";
    target.stroke();
    target.restore();
  }
  function drawPreview() {
    frame = 0;
    previewRatio = Math.min(1, 960 / width, 600 / height);
    canvas.width = Math.max(1, Math.round(width * previewRatio));
    canvas.height = Math.max(1, Math.round(height * previewRatio));
    if (!ctx) return;
    ctx.save();
    ctx.scale(canvas.width / width, canvas.height / height);
    // 比例以實際畫布寬度為準，避免畫布四捨五入後產生游標偏移。
    previewRatio = canvas.width / width;
    renderScene(ctx, width, height, true);
    ctx.restore();
  }
  function scheduleRender() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(drawPreview);
  }

  async function addFiles(fileList) {
    if (pending || exporting) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    pending = true;
    refresh();
    let added = 0;
    const errors = [];
    try {
      for (const file of files) {
        if (layers.length >= MAX_FILES) { errors.push(`最多只能有 ${MAX_FILES} 個圖層。`); break; }
        if (!allowed.has(file.type) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
          errors.push(`${file.name}：僅支援 20 MB 以下的 JPG、PNG、WebP。`);
          continue;
        }
        let bitmap;
        try {
          bitmap = await createImageBitmap(file);
          const pixels = bitmap.width * bitmap.height;
          const retainedPixels = [...assets.values()].reduce((sum, asset) => sum + asset.bitmap.width * asset.bitmap.height, 0);
          if (!pixels || pixels > MAX_FILE_PIXELS || bitmap.width > 16384 || bitmap.height > 16384 || retainedPixels + pixels > MAX_TOTAL_PIXELS) {
            throw new Error("圖片尺寸或目前保留的圖片總像素超過上限。");
          }
          const id = nextId++;
          const url = URL.createObjectURL(file);
          assets.set(id, { bitmap, url, name: file.name });
          bitmap = null;
          const asset = assets.get(id).bitmap;
          const factor = Math.min(width * .47 / asset.width, height * .54 / asset.height, 1);
          const baseWidth = asset.width * factor;
          const baseHeight = asset.height * factor;
          layers.push({ id, type: "image", assetId: id, x: width / 2 + added * 28, y: height / 2 + added * 28,
            baseWidth, baseHeight, scale: 1, rotation: 0, opacity: 1, visible: true });
          selectedId = id;
          added++;
          save();
        } catch (error) {
          bitmap?.close();
          errors.push(`${file.name}：${error.message || "讀取失敗"}`);
        }
      }
    } finally {
      pending = false;
      refresh();
      if (added) status(`已加入 ${added} 張圖片，可拖曳移動、調整圖層。`);
      if (errors.length) { notify(errors[0], "error"); status(errors.join(" ")); }
      else if (added) notify(`已加入 ${added} 張圖片。`, "success");
    }
  }
  fileInput.addEventListener("change", () => { const files = fileInput.files; addFiles(files); fileInput.value = ""; });
  const drop = $("composerDrop");
  drop.addEventListener("dragover", event => { event.preventDefault(); drop.classList.add("dragover"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", event => {
    event.preventDefault(); drop.classList.remove("dragover"); addFiles(event.dataTransfer.files);
  });
  $("addTextBtn").addEventListener("click", () => {
    if (pending || exporting || layers.length >= MAX_FILES) return;
    const id = nextId++;
    layers.push({ id, type: "text", text: "合成文字", fontSize: 64, color: "#1f2937",
      x: width / 2, y: height / 2, scale: 1, rotation: 0, opacity: 1, visible: true });
    selectedId = id;
    save();
    status("文字圖層已建立，可在右側修改內容與顏色。");
  });
  $("clearBtn").addEventListener("click", () => {
    if (pending || exporting || !layers.length) return;
    layers = [];
    selectedId = null;
    save();
    status("已清空圖層，可按復原還原內容。");
  });

  for (const [id, property, parse, valid] of [
    ["posX", "x", Number, Number.isFinite],
    ["posY", "y", Number, Number.isFinite],
    ["layerScale", "scale", v => Number(v) / 100, v => v >= .05 && v <= 4],
    ["rotation", "rotation", Number, v => v >= -180 && v <= 180],
    ["layerOpacity", "opacity", v => Number(v) / 100, v => v >= 0 && v <= 1],
    ["fontSize", "fontSize", Number, v => Number.isInteger(v) && v >= 12 && v <= 300],
    ["fontColor", "color", String, v => /^#[0-9a-f]{6}$/i.test(v)],
    ["textValue", "text", String, v => v.length <= 100]
  ]) {
    const el = $(id);
    el.addEventListener("input", () => {
      const layer = selected();
      if (!layer || pending || exporting) return;
      if (id === "textValue" && layer.type !== "text") return;
      const raw = el.value.trim();
      const value = parse(raw);
      if (raw === "" && property !== "text" || !valid(value)) return;
      layer[property] = value;
      if (id === "layerScale") $("scaleValue").textContent = `${Math.round(value * 100)}%`;
      if (id === "rotation") $("rotationValue").textContent = `${value}°`;
      if (id === "layerOpacity") $("opacityValue").textContent = `${Math.round(value * 100)}%`;
      scheduleRender();
    });
    el.addEventListener("change", () => { save(); });
  }
  function updateCanvasSetting() {
    if (pending || exporting) return;
    const nextWidth = Number($("canvasWidth").value);
    const nextHeight = Number($("canvasHeight").value);
    if (!Number.isInteger(nextWidth) || !Number.isInteger(nextHeight) ||
        nextWidth < 200 || nextHeight < 200 || nextWidth > 5000 || nextHeight > 5000 ||
        nextWidth * nextHeight > MAX_OUTPUT_PIXELS) {
      status("畫布寬高須介於 200～5000px，總像素不可超過 2000 萬。");
      notify("畫布尺寸不符合限制。", "error");
      $("canvasWidth").value = width;
      $("canvasHeight").value = height;
      return;
    }
    width = nextWidth;
    height = nextHeight;
    background = $("backgroundColor").value;
    transparent = $("transparentBg").checked;
    save();
  }
  for (const id of ["canvasWidth", "canvasHeight", "backgroundColor", "transparentBg"]) {
    $(id).addEventListener("change", updateCanvasSetting);
  }

  function logicalCoords(event) {
    const bounds = canvas.getBoundingClientRect();
    return [(event.clientX - bounds.left) / bounds.width * width,
      (event.clientY - bounds.top) / bounds.height * height];
  }
  function relativeCoords(layer, x, y) {
    const dx = x - layer.x, dy = y - layer.y;
    const a = -layer.rotation * Math.PI / 180;
    return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
  }
  function isHandle(layer, x, y) {
    const [w, h] = drawingSize(layer);
    const [px, py] = relativeCoords(layer, x, y);
    return Math.hypot(px - w / 2, py - h / 2) < 17 / previewRatio;
  }
  function hitTest(x, y) {
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.visible) continue;
      const [w, h] = drawingSize(layer);
      const [lx, ly] = relativeCoords(layer, x, y);
      if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) return layer;
    }
    return null;
  }
  canvas.addEventListener("pointerdown", event => {
    if (pending || exporting || event.button !== 0) return;
    const [x, y] = logicalCoords(event);
    const current = selected();
    const resizing = current?.visible && isHandle(current, x, y);
    const layer = resizing ? current : hitTest(x, y);
    choose(layer?.id ?? null);
    if (!layer) return;
    pointer = { id: layer.id, mode: resizing ? "resize" : "move", startX: x, startY: y,
      x: layer.x, y: layer.y, scale: layer.scale, distance: Math.max(1, Math.hypot(x - layer.x, y - layer.y)), changed: false };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener("pointermove", event => {
    if (!pointer) return;
    const layer = layers.find(item => item.id === pointer.id);
    if (!layer) return;
    const [x, y] = logicalCoords(event);
    if (pointer.mode === "move") {
      layer.x = pointer.x + x - pointer.startX;
      layer.y = pointer.y + y - pointer.startY;
    } else {
      layer.scale = Math.max(.05, Math.min(4, pointer.scale * Math.hypot(x - layer.x, y - layer.y) / pointer.distance));
    }
    pointer.changed = true;
    scheduleRender();
    event.preventDefault();
  });
  function finishPointer() {
    if (!pointer) return;
    const changed = pointer.changed;
    pointer = null;
    if (changed) save();
  }
  canvas.addEventListener("pointerup", finishPointer);
  canvas.addEventListener("pointercancel", finishPointer);
  canvas.addEventListener("lostpointercapture", finishPointer);

  $("outputFormat").addEventListener("change", () => {
    $("qualityField").hidden = $("outputFormat").value === "image/png";
  });
  $("quality").addEventListener("input", () => $("qualityValue").textContent = `${$("quality").value}%`);
  $("downloadBtn").addEventListener("click", async () => {
    if (!layers.length || pending || exporting) return;
    exporting = true;
    refresh();
    let output = null;
    let url = null;
    try {
      output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      const target = output.getContext("2d");
      if (!target) throw new Error("畫布記憶體不足，請縮小尺寸後重試。");
      const type = $("outputFormat").value;
      renderScene(target, width, height, false, type);
      const quality = Number($("quality").value) / 100;
      const blob = await new Promise((resolve, reject) => output.toBlob(value =>
        value ? resolve(value) : reject(new Error("無法產生圖片，請減小畫布尺寸。")), type, quality));
      if (blob.type !== type) throw new Error("瀏覽器不支援此輸出格式，請改用 PNG。");
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
      link.href = url;
      link.download = `WebToolbox-Composer.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      const finishedUrl = url;
      url = null;
      setTimeout(() => URL.revokeObjectURL(finishedUrl), 60000);
      status(`已產生 ${width} × ${height}px 的 ${ext.toUpperCase()} 合成圖片。`);
      notify("圖片已開始下載。", "success");
    } catch (error) {
      status(error.message || "合成圖片失敗。");
      notify(error.message || "合成圖片失敗。", "error");
      console.error("WebToolbox composer export:", error);
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (output) { output.width = 0; output.height = 0; }
      exporting = false;
      refresh();
    }
  });
  window.addEventListener("pagehide", () => {
    for (const asset of assets.values()) { asset.bitmap.close(); URL.revokeObjectURL(asset.url); }
    assets.clear();
  });
  save();
})();
