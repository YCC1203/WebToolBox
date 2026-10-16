/* WebToolbox SEO consistency checks — Node.js built-ins only. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = 'https://ycc1203.github.io/WebToolBox/';
const failures = [];
const fail = message => failures.push(message);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

function tags(html, type) {
  return [...html.matchAll(new RegExp(`<${type}\\b[^>]*>`, 'gi'))].map(match => match[0]);
}
function attribute(tag, key) {
  const match = tag.match(new RegExp(`\\b${key}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? match[2] : null;
}
function meta(html, key, property = false) {
  const found = tags(html, 'meta').filter(tag => attribute(tag, property ? 'property' : 'name')?.toLowerCase() === key);
  if (found.length !== 1) return null;
  return attribute(found[0], 'content');
}

const sitemap = read('sitemap.xml');
const locations = [...sitemap.matchAll(/<loc>\s*(https:\/\/[^<]+)\s*<\/loc>/g)].map(m => m[1].trim());
const unique = new Set(locations);
if (locations.length !== unique.size) fail('Sitemap 存在重複網址');
if (!locations.includes(base)) fail('Sitemap 缺少首頁');
if (locations.length < 2) fail('Sitemap 未列出工具頁面');
let count = 0;
for (const url of unique) {
  if (!url.startsWith(base)) { fail(`Sitemap 出現非本站網址：${url}`); continue; }
  const suffix = url.slice(base.length);
  if (suffix && !/^tools\/[a-z0-9-]+\.html$/.test(suffix)) { fail(`Sitemap 路徑格式不符：${url}`); continue; }
  const file = suffix || 'index.html';
  if (!fs.existsSync(path.join(root, file))) { fail(`Sitemap 的網頁不存在：${file}`); continue; }
  const html = read(file);
  count++;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!title || title.length < 8) fail(`${file} 缺少有效 title`);
  const h1Count = [...html.matchAll(/<h1\b/gi)].length;
  if (h1Count !== 1) fail(`${file} 應具有一個 h1（目前 ${h1Count} 個）`);
  const description = meta(html, 'description');
  if (!description || description.trim().length < 25) fail(`${file} 缺少有效 meta description`);
  const robots = meta(html, 'robots');
  if (!robots || !/\bindex\b/i.test(robots) || /noindex/i.test(robots)) fail(`${file} robots 不可阻擋索引`);
  const canonicalLinks = tags(html, 'link').filter(tag => attribute(tag, 'rel')?.toLowerCase() === 'canonical');
  if (canonicalLinks.length !== 1 || attribute(canonicalLinks[0], 'href') !== url) fail(`${file} canonical 與 Sitemap 不一致`);
  for (const [name, property] of [['og:type', true], ['og:title', true], ['og:description', true], ['og:url', true], ['og:site_name', true], ['og:locale', true], ['twitter:card', false], ['twitter:title', false], ['twitter:description', false]]) {
    if (!meta(html, name, property)?.trim()) fail(`${file} 缺少或重複 ${name}`);
  }
  if (meta(html, 'og:url', true) !== url) fail(`${file} og:url 與 canonical 不一致`);
}

// Homepage cards are rendered by JS. Preserve an honest no-JS link fallback.
const homepage = read('index.html');
const fallback = homepage.match(/<noscript>([\s\S]*?)<\/noscript>/i)?.[1] || '';
for (const url of unique) {
  if (url === base) continue;
  const link = './' + url.slice(base.length);
  if (!fallback.includes(`href="${link}"`)) fail(`首頁 noscript 工具連結缺少 ${link}`);
}
if (failures.length) {
  for (const failure of failures) console.error('SEO 檢查失敗：' + failure);
  process.exitCode = 1;
} else {
  console.log(`SEO 檢查通過：${count} 頁、${locations.length} 個 Sitemap 網址，Canonical、描述與社群標籤一致。`);
}
