
"use strict";

/*
 * WebToolbox 共用通知系統
 * 使用方式：
 * WebToolboxNotify.success("已完成");
 * WebToolboxNotify.error("操作失敗");
 * WebToolboxNotify.info("請先上傳檔案");
 * const id = WebToolboxNotify.loading("正在處理...");
 * WebToolboxNotify.dismiss(id);
 */

(() => {
  const MAX_TOASTS = 4;
  const DEFAULT_DURATION = 3200;

  const icons = {
    success: "✓",
    error: "!",
    info: "i",
    loading: "↻"
  };

  let nextId = 1;
  const notices = new Map();

  const container = document.createElement("div");
  container.id = "wt-toast-container";
  container.setAttribute("aria-label", "操作通知");

  document.body.appendChild(container);

  function dismiss(id) {
    const item = notices.get(id);
    if (!item) return;

    if (item.timer) {
      clearTimeout(item.timer);
    }

    item.element.classList.add("wt-toast-leaving");
    notices.delete(id);

    setTimeout(() => {
      item.element.remove();
    }, 220);
  }

  function show(message, type = "info", duration) {
    if (!Object.hasOwn(icons, type)) {
      type = "info";
    }

    const id = nextId++;

    // 最多同時顯示四筆通知
    if (notices.size >= MAX_TOASTS) {
      const oldest = notices.keys().next().value;
      dismiss(oldest);
    }

    const toast = document.createElement("div");
    toast.className = `wt-toast wt-toast-${type}`;

    // loading 通知可能長時間顯示
    toast.setAttribute(
      "role",
      type === "error" ? "alert" : "status"
    );

    const icon = document.createElement("span");
    icon.className = "wt-toast-icon";
    icon.textContent = icons[type];
    icon.setAttribute("aria-hidden", "true");

    const content = document.createElement("span");
    content.className = "wt-toast-message";
    content.textContent = String(message);

    const close = document.createElement("button");
    close.className = "wt-toast-close";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "關閉通知");
    close.addEventListener("click", () => dismiss(id));

    toast.append(icon, content, close);
    container.appendChild(toast);

    const lifespan = duration ?? (
      type === "loading" ? 0 : DEFAULT_DURATION
    );

    const timer = lifespan > 0
      ? setTimeout(() => dismiss(id), lifespan)
      : null;

    notices.set(id, {
      element: toast,
      timer
    });

    return id;
  }

  window.WebToolboxNotify = Object.freeze({
    show,
    dismiss,
    success: message => show(message, "success"),
    error: message => show(message, "error", 5000),
    info: message => show(message, "info"),
    loading: message => show(message, "loading", 0)
  });
})();
