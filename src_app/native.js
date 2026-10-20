/* ---------- running inside the Android / iPhone app (Capacitor) ----------
   On the website everything below is inert: SA_NATIVE is false and saUrl()/saSite() return the site's own addresses.
   In the store app the page is served from the phone itself (capacitor://localhost or https://localhost), so calls to
   the Worker and links in emails must use the public site address, set at build time in window.DBD_SITE. */
const SA_NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
const SA_SITE = SA_NATIVE ? String(window.DBD_SITE || 'https://d-board-designer.adriankobsin.workers.dev').replace(/\/+$/, '') : '';
const saUrl = p => SA_SITE + p;                         // Worker API address
const saSite = () => SA_SITE || location.origin;        // public address used in email links
const saPlugin = name => { try { const C = window.Capacitor; return (C.Plugins && C.Plugins[name]) || (C.registerPlugin && C.registerPlugin(name)) || null; } catch (e) { return null; } };
if (SA_NATIVE) document.documentElement.classList.add('sa-native');

/* Save a generated file (PDF, Excel, CSV, JSON) on the phone: write it to the app's cache, then open the share sheet,
   where the person can save it to Files, send it by email or open it in another app. */
async function saNativeSave(name, data, mime){
  const FS = saPlugin('Filesystem'), Share = saPlugin('Share');
  if (!FS || !Share) throw new Error('unavailable');
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data.buffer ? data.buffer : data);
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const safe = String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(-120);
  const w = await FS.writeFile({path: safe, data: btoa(bin), directory: 'CACHE', recursive: true});
  try { await Share.share({title: safe, url: w.uri, dialogTitle: safe}); }
  catch (e) { if (!/cancel/i.test(String((e && e.message) || e))) throw e; }
}

/* Links to files (chat attachments) and other websites open in the in-app browser, which can show and save them. */
async function saNativeOpen(url){
  const B = saPlugin('Browser');
  if (B) { try { await B.open({url}); return; } catch (e) {} }
  window.open(url, '_blank');
}
if (SA_NATIVE) document.addEventListener('click', ev => {
  const a = ev.target.closest && ev.target.closest('a[href]'); if (!a) return;
  const href = a.getAttribute('href') || '';
  if (!/^https?:/i.test(href) || a.target !== '_blank' && !a.hasAttribute('download')) return;
  ev.preventDefault(); saNativeOpen(a.href);
}, true);
