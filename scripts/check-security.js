/* WebToolbox security checks — no third-party Node packages required. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pages = ['index.html', ...['qr','password','text','json','resize','convert','compress','crop','watermark','stitch','composer','pdf'].map(x => `tools/${x}.html`)];
const errors = [];
const warnings = [];
const fail = (file, reason) => errors.push(`${file}: ${reason}`);
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

for (const rel of pages) {
  if (!fs.existsSync(path.join(root, rel))) { fail(rel, '找不到 HTML'); continue; }
  const html = read(rel);
  const csp = html.match(/<meta\s+[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i);
  if (!csp) fail(rel, '缺少 CSP meta 標籤');
  else {
    if (!/script-src\s+[^;]*'self'/i.test(csp[0])) fail(rel, 'CSP 缺少 script-src self');
    if (/script-src\s+[^;]*'unsafe-inline'/i.test(csp[0])) fail(rel, 'CSP 的 script-src 不應含 unsafe-inline');
    if (!/object-src\s+'none'/i.test(csp[0])) fail(rel, 'CSP 缺少 object-src none');
  }
  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html)) fail(rel, '發現內嵌 script，可能被 CSP 阻擋');
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
  for (const s of scripts) {
    const attrs = s[1];
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || !/^https?:\/\//i.test(src)) continue;
    if (!/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\//i.test(src)) fail(rel, `未列入白名單的外部腳本來源：${src}`);
    if (!/\bintegrity\s*=\s*["']sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}["']/i.test(attrs)) fail(rel, `CDN 腳本缺少有效格式的 SRI：${src}`);
    if (!/\bcrossorigin\s*=\s*["']anonymous["']/i.test(attrs)) fail(rel, `CDN 腳本缺少 crossorigin=anonymous：${src}`);
  }
}

let tracked;
try {
  // NUL-separated paths avoid parsing issues with spaces or non-ASCII filenames.
  tracked = cp.execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
} catch { tracked = null; warnings.push('無法執行 git ls-files；略過已追蹤檔案檢查'); }
if (tracked) for (const rel of tracked) {
  if (/(^|\/)(\.env(?:\..*)?|\.npmrc|id_rsa|id_ed25519|.*\.pem|.*\.p12|.*\.pfx|.*\.bak|.*\.before-csp-v2\.bak)$/i.test(rel)) fail(rel, '敏感或備份檔案被 Git 追蹤');
}
const sourceFiles = tracked ? tracked.filter(x => /\.(?:html|js|json|ya?ml|css|md|txt|svg)$/i.test(x)) : [...pages, ...fs.readdirSync(path.join(root, 'js')).filter(x=>x.endsWith('.js')).map(x=>'js/'+x)];
const signatures = [
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['Private key', /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
];
for (const rel of sourceFiles) {
  if (!fs.existsSync(path.join(root,rel)) || !fs.statSync(path.join(root,rel)).isFile()) continue;
  if (rel === 'scripts/check-security.js') continue; // Pattern examples in this checker are not secrets.
  const data = read(rel);
  for (const [name, regex] of signatures) if (regex.test(data)) fail(rel, `疑似${name}（請人工確認，不要直接公開內容）`);
}
console.log(`檢查 HTML：${pages.length} 頁；檢查文字檔：${sourceFiles.length} 份`);
for (const msg of warnings) console.warn('警告：' + msg);
for (const msg of errors) console.error('失敗：' + msg);
if (errors.length) { console.error(`安全檢查未通過：${errors.length} 項`); process.exitCode = 1; }
else console.log('安全靜態檢查通過（不等於完整安全保證，也未掃描 Git 歷史）');
