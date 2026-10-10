
"use strict";

// ===== 工具資料 =====

const tools = [
  {
    id: "qr",
    name: "QR Code 產生器",
    description: "將網址或文字轉成 QR Code，支援顏色及 PNG 下載。",
    category: "text",
    icon: "▦",
    color: "purple",
    ready: true,
    url: "./tools/qr.html"
  },
  {
    id: "password",
    name: "密碼產生器",
    description: "產生安全隨機密碼，自訂長度與字元類型。",
    category: "text",
    icon: "🔑",
    color: "blue",
    ready: true,
    url: "./tools/password.html"
  },
  {
    id: "text",
    name: "文字處理器",
    description: "字數統計、文字轉換、清理與 TXT 下載。",
    category: "text",
    icon: "≡",
    color: "green",
    ready: true,
    url: "./tools/text.html"
  },
  {
    id: "json",
    name: "JSON 格式化",
    description: "JSON 美化、壓縮、語法驗證及檔案下載。",
    category: "dev",
    icon: "{ }",
    color: "purple",
    ready: true,
    url: "./tools/json.html"
  },
  {
    id: "resize",
    name: "圖片尺寸調整",
    description: "批次調整圖片尺寸、鎖定比例、預覽與 ZIP 下載。",
    category: "image",
    icon: "▧",
    color: "blue",
    ready: true,
    url: "./tools/resize.html"
  },
  {
    id: "convert",
    name: "圖片格式轉換",
    description: "JPG、PNG、WebP 批次轉換、品質設定與 ZIP 下載。",
    category: "image",
    icon: "◈",
    color: "orange",
    ready: true,
    url: "./tools/convert.html"
  },
  {
    id: "compress",
    name: "高品質圖片壓縮",
    description: "智慧品質選擇、保留解析度、圖片比較與批次 ZIP 下載。",
    category: "image",
    icon: "▤",
    color: "green",
    ready: true,
    url: "./tools/compress.html"
  },
  {
    id: "pdf",
    name: "PDF 工具",
    description: "PDF 合併、分割、擷取、刪除及頁面排序。",
    category: "file",
    icon: "▣",
    color: "orange",
    ready: true,
    url: "./tools/pdf.html"
  },
];

// ===== 網頁元素 =====

const grid = document.getElementById("toolsGrid");
const searchInput = document.getElementById("searchInput");
const filters = document.getElementById("filters");
const toolCount = document.getElementById("toolCount");
const emptyMessage = document.getElementById("emptyMessage");
const toast = document.getElementById("toast");

let currentCategory = "all";
let showFavorites = false;
let toastTimer;

// ===== 收藏資料 =====

const STORAGE_KEY = "webtoolbox-favorites";

function loadFavorites() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    if (!Array.isArray(stored)) return new Set();

    const validIds = new Set(tools.map(tool => tool.id));

    return new Set(
      stored.filter(id =>
        typeof id === "string" && validIds.has(id)
      )
    );
  } catch {
    return new Set();
  }
}

const favorites = loadFavorites();

function saveFavorites() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...favorites])
    );
    return true;
  } catch {
    return false;
  }
}

function toggleFavorite(id) {
  const wasFavorite = favorites.has(id);

  if (wasFavorite) {
    favorites.delete(id);
  } else {
    favorites.add(id);
  }

  if (!saveFavorites()) {
    // 儲存失敗時還原原本狀態
    if (wasFavorite) favorites.add(id);
    else favorites.delete(id);

    showToast("無法儲存收藏，請檢查瀏覽器設定。");
    return;
  }

  renderTools();

  showToast(
    wasFavorite ? "已取消收藏" : "已加入我的收藏"
  );
}

// ===== 提示訊息 =====

function showToast(message) {
  clearTimeout(toastTimer);

  toast.textContent = message;
  toast.classList.add("show");

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// ===== 建立工具卡片 =====

function createToolCard(tool) {
  const card = document.createElement("article");
  card.className = "tool-card";

  // 工具開啟按鈕
  const openButton = document.createElement("button");
  openButton.className = "card-open";
  openButton.type = "button";
  openButton.setAttribute(
    "aria-label",
    `${tool.name}${tool.ready ? "，立即使用" : "，即將推出"}`
  );

  const top = document.createElement("div");
  top.className = "card-top";

  const icon = document.createElement("span");
  icon.className = `card-icon ${tool.color}`;
  icon.textContent = tool.icon;

  const arrow = document.createElement("span");
  arrow.className = "card-arrow";
  arrow.textContent = "↗";

  top.append(icon, arrow);

  const title = document.createElement("h3");
  title.textContent = tool.name;

  const description = document.createElement("p");
  description.textContent = tool.description;

  const bottom = document.createElement("span");
  bottom.className = "card-bottom";
  bottom.textContent = tool.ready
    ? "立即使用 →"
    : "即將推出";

  openButton.append(top, title, description, bottom);

  openButton.addEventListener("click", () => {
    if (!tool.ready || !tool.url) {
      showToast(`${tool.name} 尚未推出`);
      return;
    }

    window.location.href = tool.url;
  });

  // 獨立收藏按鈕
  const favoriteButton = document.createElement("button");
  const isFavorite = favorites.has(tool.id);

  favoriteButton.type = "button";
  favoriteButton.className =
    `favorite-btn${isFavorite ? " is-favorite" : ""}`;

  favoriteButton.textContent = isFavorite ? "★" : "☆";

  favoriteButton.setAttribute(
    "aria-label",
    `${isFavorite ? "取消收藏" : "收藏"}${tool.name}`
  );

  favoriteButton.setAttribute(
    "aria-pressed",
    String(isFavorite)
  );

  favoriteButton.title = isFavorite ? "取消收藏" : "加入收藏";

  favoriteButton.addEventListener("click", () => {
    toggleFavorite(tool.id);
  });

  card.append(openButton, favoriteButton);

  return card;
}

// ===== 建立收藏分類按鈕 =====

const favoritesFilter = document.createElement("button");

favoritesFilter.type = "button";
favoritesFilter.className = "filter-btn";
favoritesFilter.textContent = "☆ 我的收藏";
favoritesFilter.setAttribute("aria-pressed", "false");

filters.appendChild(favoritesFilter);

favoritesFilter.addEventListener("click", () => {
  showFavorites = !showFavorites;
  renderTools();
});

// ===== 更新分類按鈕外觀 =====

function updateFilterButtons() {
  filters.querySelectorAll("[data-category]").forEach(button => {
    const active = button.dataset.category === currentCategory;

    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  favoritesFilter.classList.toggle(
    "favorites-active",
    showFavorites
  );

  favoritesFilter.setAttribute(
    "aria-pressed",
    String(showFavorites)
  );

  favoritesFilter.textContent =
    `${showFavorites ? "★" : "☆"} 我的收藏 (${favorites.size})`;
}

// ===== 更新工具卡片 =====

function renderTools() {
  const keyword = searchInput.value
    .trim()
    .toLocaleLowerCase();

  const filtered = tools.filter(tool => {
    const categoryMatches =
      currentCategory === "all" ||
      tool.category === currentCategory;

    const keywordMatches =
      tool.name.toLocaleLowerCase().includes(keyword) ||
      tool.description.toLocaleLowerCase().includes(keyword);

    const favoriteMatches =
      !showFavorites || favorites.has(tool.id);

    return categoryMatches &&
      keywordMatches &&
      favoriteMatches;
  });

  const cards = filtered.map(createToolCard);

  grid.replaceChildren(...cards);

  toolCount.textContent =
    `顯示 ${filtered.length} / ${tools.length} 個工具`;

  emptyMessage.hidden = filtered.length !== 0;

  if (filtered.length === 0) {
    emptyMessage.textContent = showFavorites
      ? "收藏中沒有符合條件的工具，試試其他分類。"
      : "找不到符合條件的工具，試試其他關鍵字。";
  }

  updateFilterButtons();
}

// ===== 搜尋與分類 =====

searchInput.addEventListener("input", renderTools);

filters.addEventListener("click", event => {
  const button = event.target.closest("[data-category]");

  if (!button) return;

  currentCategory = button.dataset.category;
  renderTools();
});

// ===== 初始化 =====

document.getElementById("year").textContent =
  new Date().getFullYear();

renderTools();
