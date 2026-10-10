
"use strict";

(() => {
  // ===== 建立閱讀進度條 =====
  const progress = document.createElement("div");

  progress.id = "scrollProgress";
  progress.setAttribute("aria-hidden", "true");

  document.body.appendChild(progress);

  // ===== 建立返回頂部按鈕 =====
  const backToTop = document.createElement("button");

  backToTop.id = "backToTop";
  backToTop.type = "button";
  backToTop.textContent = "↑";
  backToTop.title = "返回頂部";
  backToTop.setAttribute("aria-label", "返回頁面頂部");

  document.body.appendChild(backToTop);

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  backToTop.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: reduceMotion.matches ? "instant" : "smooth"
    });
  });

  // ===== 滾動狀態 =====
  let ticking = false;

  function updateScroll() {
    const maximum =
      document.documentElement.scrollHeight -
      window.innerHeight;

    const percentage = maximum > 0
      ? Math.min(100, Math.max(0, window.scrollY / maximum * 100))
      : 0;

    progress.style.width = `${percentage}%`;

    backToTop.classList.toggle(
      "visible",
      window.scrollY > 350
    );

    ticking = false;
  }

  window.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(updateScroll);
      ticking = true;
    }
  }, { passive: true });

  window.addEventListener("resize", updateScroll);
  updateScroll();

  // ===== 快速搜尋快捷鍵 =====
  // 首頁按 / 即可聚焦搜尋框
  document.addEventListener("keydown", event => {
    const target = event.target;
    const editing = target instanceof HTMLElement &&
      (
        target.matches("input, textarea, select") ||
        target.isContentEditable
      );

    if (
      event.key === "/" &&
      !editing &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const search = document.getElementById("searchInput");

      if (search) {
        event.preventDefault();
        search.focus();
      }
    }

    // Escape 離開搜尋框
    if (event.key === "Escape") {
      if (document.activeElement?.id === "searchInput") {
        document.activeElement.blur();
      }
    }
  });

  // ===== 更新頁尾年份 =====
  document.querySelectorAll("#year").forEach(element => {
    element.textContent = new Date().getFullYear();
  });
})();
