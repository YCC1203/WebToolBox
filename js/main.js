
"use strict";


/* ===== WebToolbox 統一 SVG 圖示 ===== */

const toolIcons = {
  qr: `
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <path d="M6 6h1v1H6z"/>
    <path d="M17 6h1v1h-1z"/>
    <path d="M6 17h1v1H6z"/>
    <path d="M14 14h3v3h-3z"/>
    <path d="M21 14v3h-2"/>
    <path d="M14 21h3v-2"/>
    <path d="M20 20h1v1h-1z"/>
  `,

  password: `
    <circle cx="7.5" cy="15.5" r="5.5"/>
    <path d="M12 12l8-8 2 2-2 2 2 2-3 3-2-2-3 3"/>
    <circle cx="6.5" cy="16.5" r="1"/>
  `,

  text: `
    <path d="M4 6h16"/>
    <path d="M4 10h12"/>
    <path d="M4 14h16"/>
    <path d="M4 18h9"/>
  `,

  json: `
    <path d="M9 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2"/>
    <path d="M3 11a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2"/>
    <path d="M15 3h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2"/>
    <path d="M21 11a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2"/>
  `,

  resize: `
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M8 16l8-8"/>
    <path d="M10 8h6v6"/>
    <path d="M8 12v4h4"/>
  `,

  convert: `
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <path d="M7 9h10l-3-3"/>
    <path d="M17 9l-3 3"/>
    <path d="M17 15H7l3 3"/>
    <path d="M7 15l3-3"/>
  `,

  crop: `
    <path d="M4 4v12a4 4 0 0 0 4 4h12"/>
    <path d="M8 4h12v12"/>
    <path d="M4 9h15"/><path d="M9 4v16"/>
  `,
  compress: `
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <path d="M8 8l3 3"/>
    <path d="M8 11V8h3"/>
    <path d="M16 8l-3 3"/>
    <path d="M13 8h3v3"/>
    <path d="M8 16l3-3"/>
    <path d="M8 13v3h3"/>
    <path d="M16 16l-3-3"/>
    <path d="M13 16h3v-3"/>
  `,

  watermark: `
    <path d="M4 4h16v16H4z"/>
    <path d="M7 15l3-4 3 3 2-2 3 3"/>
    <circle cx="16.5" cy="8.5" r="1.5"/>
    <path d="M7 19h10"/>
  `,
  stitch: `
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 11h18M11 3v18"/>
    <path d="M6 6h2v2H6zM14 14h4v4h-4z"/>
  `,
  pdf: `
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6"/>
    <path d="M8 13h8"/>
    <path d="M8 17h5"/>
  `
};

// 產生 SVG 元素
function createToolIcon(id) {
  const SVG_NS = "http://www.w3.org/2000/svg";

  const svg = document.createElementNS(SVG_NS, "svg");

  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  // 圖示內容來自程式內固定定義，不使用外部輸入
  svg.innerHTML = toolIcons[id] || toolIcons.text;

  return svg;
}


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
    id: "crop",
    name: "圖片裁切",
    description: "自由裁切、1:1／4:3／16:9、旋轉圖片並下載 PNG。",
    category: "image",
    icon: "▧",
    color: "blue",
    ready: true,
    url: "./tools/crop.html"
  },
  {
    id: "watermark",
    name: "圖片浮水印",
    description: "文字與 Logo 浮水印、透明度、九宮格位置及 PNG 下載。",
    category: "image",
    icon: "▧",
    color: "purple",
    ready: true,
    url: "./tools/watermark.html"
  },
  {
    id: "stitch",
    name: "圖片拼接",
    description: "多張圖片直向、橫向或網格拼接，支援排序、間距與 PNG／JPG／WebP 下載。",
    category: "image",
    icon: "▦",
    color: "blue",
    ready: true,
    url: "./tools/stitch.html"
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
  if (window.WebToolboxNotify) {
    if (message.startsWith("無法")) {
      WebToolboxNotify.error(message);
    } else {
      WebToolboxNotify.success(message);
    }
    return;
  }

  // 後備提示：即使通知系統未載入也能顯示
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
  icon.appendChild(createToolIcon(tool.id));

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


// ===== 首頁最近使用工具 =====

const recentSection =
  document.getElementById("recentSection");

const recentGrid =
  document.getElementById("recentGrid");

const clearRecentButton =
  document.getElementById("clearRecent");

const RECENT_KEY = "webtoolbox-recent";

function loadRecentTools() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(RECENT_KEY) || "[]"
    );

    if (!Array.isArray(stored)) return [];

    const validIds = new Set(tools.map(tool => tool.id));

    return [
      ...new Set(
        stored.filter(
          id => typeof id === "string" &&
                validIds.has(id)
        )
      )
    ].slice(0, 4);

  } catch {
    return [];
  }
}

function renderRecentTools() {
  const recentIds = loadRecentTools();

  recentGrid.replaceChildren();

  if (recentIds.length === 0) {
    recentSection.hidden = true;
    return;
  }

  recentSection.hidden = false;

  for (const id of recentIds) {
    const tool = tools.find(item => item.id === id);
    if (!tool) continue;

    const link = document.createElement("a");
    link.className = "recent-card";
    link.href = tool.url;

    // 圖示沿用上一輪的統一 SVG
    const iconBox = document.createElement("span");
    iconBox.className = `card-icon ${tool.color}`;

    iconBox.appendChild(createToolIcon(tool.id));

    const info = document.createElement("span");
    info.className = "recent-card-info";

    const title = document.createElement("strong");
    title.textContent = tool.name;

    const description = document.createElement("small");
    description.textContent = tool.description;

    info.append(title, description);

    const arrow = document.createElement("span");
    arrow.className = "recent-arrow";
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");

    link.append(iconBox, info, arrow);
    recentGrid.appendChild(link);
  }
}

// 清除所有最近使用紀錄
clearRecentButton.addEventListener("click", () => {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch (error) {
    console.warn("無法清除使用紀錄：", error);
  }

  renderRecentTools();
});

// 從其他分頁返回時更新最近使用紀錄
window.addEventListener("pageshow", () => {
  renderRecentTools();
});


// ===== 初始化 =====

document.getElementById("year").textContent =
  new Date().getFullYear();

renderTools();
renderRecentTools();
