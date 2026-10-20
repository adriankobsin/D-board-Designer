// Copies the built website (../public) into www/ for the Android and iPhone apps.
// Adds the Capacitor runtime and the public site address (calls to the Worker API and links in emails use it).
// Set DBD_SITE to your own domain if the site moves:  DBD_SITE=https://app.example.com node prepare-www.mjs
import { cpSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'public'), out = join(here, 'www');
const site = (process.env.DBD_SITE || 'https://d-board-designer.adriankobsin.workers.dev').replace(/\/+$/, '');
if (!/^https:\/\/[^\s"'<>]+$/.test(site)) throw new Error('DBD_SITE must be an https address');
if (!existsSync(join(src, 'index.html'))) throw new Error('Run ../build.sh first (public/index.html is missing)');
rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });
rmSync(join(out, 'sw.js'), { force: true });   // the app ships its files; no offline service worker needed
cpSync(join(here, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js'), join(out, 'capacitor.js'));
let html = readFileSync(join(out, 'index.html'), 'utf8');
const inject = `<script>window.DBD_SITE=${JSON.stringify(site)};</script>\n<script src="capacitor.js"></script>\n`;
const at = html.indexOf('<script');
if (at < 0) throw new Error('index.html has no <script> tag');
html = html.slice(0, at) + inject + html.slice(at);
// In the store apps the page sits inside the safe area (the system draws the status and navigation bars around it),
// so the page must not ask to extend underneath them.
html = html.replace(/,\s*viewport-fit=cover/, '');
writeFileSync(join(out, 'index.html'), html);
const callPage = join(out, 'call.html');
if (existsSync(callPage)) writeFileSync(callPage, readFileSync(callPage, 'utf8').replace(/,\s*viewport-fit=cover/, ''));
console.log('www/ ready for', site);
