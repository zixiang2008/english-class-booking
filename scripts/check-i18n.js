/**
 * scripts/check-i18n.js — static i18n audit.
 *
 * Loads the browser i18n engine in a VM, then verifies that every key used by
 * the HTML templates (data-i18n) and the front-end scripts (I18N.t / v3_* key
 * literals) exists in the English dictionary. Also reports coverage for the
 * other languages so untranslated strings are visible (they fall back to en).
 *
 * Run: node scripts/check-i18n.js
 * Exit code 1 when a referenced key is missing entirely.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const jsDir = path.join(root, 'public', 'js');
const htmlDir = path.join(root, 'public');

const store = {};
const sandbox = {
  console,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  },
  navigator: { language: 'en' },
  document: { documentElement: {}, addEventListener() {} },
  Intl, Date, Math, JSON, Object, Array, String, Number, RegExp
};
vm.createContext(sandbox);
for (const f of ['i18n.js', 'i18n-v3.js']) {
  vm.runInContext(fs.readFileSync(path.join(jsDir, f), 'utf8'), sandbox, { filename: f });
}
const I18N = vm.runInContext('I18N', sandbox);

const referenced = new Map(); // key -> Set(file)
function note(key, file) {
  if (!key) return;
  if (!referenced.has(key)) referenced.set(key, new Set());
  referenced.get(key).add(file);
}

const htmlFiles = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html'));
for (const f of htmlFiles) {
  const src = fs.readFileSync(path.join(htmlDir, f), 'utf8');
  for (const m of src.matchAll(/data-i18n(?:-placeholder|-title)?\s*=\s*"([^"]+)"/g)) {
    note(m[1], f);
  }
  // Inline <script> blocks also translate strings.
  for (const m of src.matchAll(/\bI18N\.t\(\s*['"]([^'"]+)['"]/g)) note(m[1], f);
}

const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && f !== 'i18n.js' && f !== 'i18n-v3.js');
for (const f of jsFiles) {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  for (const m of src.matchAll(/\bI18N\.t\(\s*['"]([^'"]+)['"]/g)) note(m[1], f);
  for (const m of src.matchAll(/\bApp\.t\(\s*['"]([^'"]+)['"]/g)) note(m[1], f);
  // statusText() maps and similar key-only literals
  for (const m of src.matchAll(/['"](v3_[A-Za-z0-9_]+)['"]/g)) note(m[1], f);
}

const en = I18N.translations.en;
const missing = [...referenced.keys()].filter(k => !(k in en)).sort();
const langs = Object.keys(I18N.languages);
const v3Keys = Object.keys(en).filter(k => k.startsWith('v3_'));

console.log('i18n audit');
console.log('  referenced keys :', referenced.size);
console.log('  english strings :', Object.keys(en).length, '(v3:', v3Keys.length + ')');
for (const lang of langs) {
  const have = Object.keys(I18N.translations[lang] || {}).length;
  const v3 = Object.keys(I18N.translations[lang] || {}).filter(k => k.startsWith('v3_')).length;
  console.log(`  ${lang.padEnd(3)} strings       : ${String(have).padStart(4)}  (v3: ${String(v3).padStart(3)}/${v3Keys.length})`);
}

if (missing.length) {
  console.log('\n❌ Missing English keys (these render as raw key names):');
  for (const k of missing) console.log(`   ${k}  ← ${[...referenced.get(k)].join(', ')}`);
  process.exit(1);
}
console.log('\n✅ Every referenced i18n key exists in English.');
