
"use strict";

const lengthInput = document.getElementById("passwordLength");
const lengthValue = document.getElementById("lengthValue");

const uppercase = document.getElementById("uppercase");
const lowercase = document.getElementById("lowercase");
const numbers = document.getElementById("numbers");
const symbols = document.getElementById("symbols");

const generateBtn = document.getElementById("generatePassword");
const copyBtn = document.getElementById("copyPassword");

const passwordResult = document.getElementById("passwordResult");
const strengthLabel = document.getElementById("strengthLabel");
const strengthFill = document.getElementById("strengthFill");
const strengthNote = document.getElementById("strengthNote");
const optionError = document.getElementById("optionError");
const copyStatus = document.getElementById("copyStatus");

// 字元集合
const CHARSETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?"
};

let currentPassword = "";

// 安全的隨機整數：0 到 max - 1
// 使用拒絕取樣避免取餘數造成分布偏差
function secureRandomInt(max) {
  if (!Number.isSafeInteger(max) || max < 1 || max > 65536) {
    throw new RangeError("無效的隨機數範圍");
  }

  const range = 65536;
  const limit = Math.floor(range / max) * max;
  const buffer = new Uint16Array(1);

  let value;

  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return value % max;
}

// 從字元集合隨機挑選一個字元
function randomCharacter(charset) {
  return charset[secureRandomInt(charset.length)];
}

// Fisher-Yates 安全洗牌
function secureShuffle(characters) {
  for (let i = characters.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);

    [characters[i], characters[j]] =
      [characters[j], characters[i]];
  }

  return characters;
}

// 取得目前勾選的字元類型
function getSelectedCharsets() {
  const selected = [];

  if (uppercase.checked) selected.push(CHARSETS.uppercase);
  if (lowercase.checked) selected.push(CHARSETS.lowercase);
  if (numbers.checked) selected.push(CHARSETS.numbers);
  if (symbols.checked) selected.push(CHARSETS.symbols);

  return selected;
}

// 更新密碼強度（估計值）
function updateStrength(length, poolSize) {
  const bits = length * Math.log2(poolSize);

  let label;
  let width;
  let color;

  if (bits < 50) {
    label = "較弱";
    width = "25%";
    color = "#f07676";
  } else if (bits < 75) {
    label = "普通";
    width = "50%";
    color = "#edb75a";
  } else if (bits < 100) {
    label = "良好";
    width = "75%";
    color = "#59bdeb";
  } else {
    label = "強";
    width = "100%";
    color = "#5cdeb2";
  }

  strengthLabel.textContent = label;
  strengthFill.style.width = width;
  strengthFill.style.background = color;

  strengthNote.textContent =
    `約 ${Math.floor(bits)} bits（依長度與字元集合估算）。` +
    "請避免重複使用密碼，並為重要帳號啟用雙重驗證。";
}

// 產生密碼
function generatePassword() {
  optionError.textContent = "";
  copyStatus.textContent = "";

  const selected = getSelectedCharsets();
  const length = Number(lengthInput.value);

  if (selected.length === 0) {
    currentPassword = "";
    passwordResult.textContent = "請至少選擇一種字元類型";
    strengthLabel.textContent = "尚未產生";
    strengthFill.style.width = "0%";
    strengthNote.textContent = "請選擇字元類型後再產生密碼。";
    optionError.textContent = "請至少勾選一個選項。";
    return;
  }

  if (!window.crypto || !crypto.getRandomValues) {
    currentPassword = "";
    passwordResult.textContent = "瀏覽器不支援安全隨機數";
    strengthFill.style.width = "0%";
    strengthLabel.textContent = "無法產生";
    strengthNote.textContent = "請使用更新版本的瀏覽器。";
    return;
  }

  try {
    const allCharacters = selected.join("");
    const result = [];

    // 每個選取的類型至少產生一個字元
    for (const charset of selected) {
      result.push(randomCharacter(charset));
    }

    // 補足剩餘字元
    while (result.length < length) {
      result.push(randomCharacter(allCharacters));
    }

    // 隨機打亂排列
    secureShuffle(result);

    currentPassword = result.join("");
    passwordResult.textContent = currentPassword;

    updateStrength(length, allCharacters.length);

  } catch (error) {
    console.error("密碼產生失敗：", error);
    currentPassword = "";
    passwordResult.textContent = "密碼產生失敗";
    strengthLabel.textContent = "無法產生";
    strengthFill.style.width = "0%";
    strengthNote.textContent = "請重新嘗試。";
  }
}

// 複製密碼
async function copyPassword() {
  if (!currentPassword) {
    copyStatus.textContent = "請先產生密碼。";
    return;
  }

  try {
    await navigator.clipboard.writeText(currentPassword);
    copyStatus.textContent = "✓ 已複製到剪貼簿";

  } catch (error) {
    console.error("複製失敗：", error);
    copyStatus.textContent =
      "無法自動複製，請手動選取密碼。";
  }
}

// 滑桿數值同步
lengthInput.addEventListener("input", () => {
  lengthValue.textContent = lengthInput.value;
  generatePassword();
});

// 字元選項改變
[uppercase, lowercase, numbers, symbols].forEach(input => {
  input.addEventListener("change", generatePassword);
});

// 按鈕事件
generateBtn.addEventListener("click", generatePassword);
copyBtn.addEventListener("click", copyPassword);

// 頁尾年份
document.getElementById("year").textContent =
  new Date().getFullYear();

// 開啟網頁時產生第一組密碼
generatePassword();
