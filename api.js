// Cliente de la API en línea (Netlify Functions). Misma interfaz que el api.js del prototipo.
import { sanitizeReport, validateReport } from './shared.js';
import { buildReportPdf } from './report-pdf.js';

const base = new URL('.', import.meta.url).href;
const API = new URL('api/', base).href;

async function call(method, path, body, token) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });
  if (r.status === 401 && token !== undefined && path !== 'login') throw new Error('NO_AUTH');
  const d = await r.json().catch(() => ({}));
  return { status: r.status, d };
}

let assetsP;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function b64(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  let s = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function assets() {
  if (!assetsP) assetsP = (async () => {
    if (!window.jspdf) await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    const [logo, regular, bold] = await Promise.all([
      b64(base + 'assets/logo-gecelca.png').then(x => 'data:image/png;base64,' + x).catch(() => null),
      b64(base + 'assets/fonts/Carlito-Regular.ttf').catch(() => null),
      b64(base + 'assets/fonts/Carlito-Bold.ttf').catch(() => null)
    ]);
    return { jsPDF: window.jspdf.jsPDF, logo, fonts: regular && bold ? { regular, bold } : null };
  })().catch(e => { assetsP = null; throw e; });
  return assetsP;
}
export async function renderPdf(report) {
  return new Blob([buildReportPdf(report, await assets())], { type: 'application/pdf' });
}
export function preloadPdfAssets() { assets().catch(() => {}); }

export async function submitReport(raw) {
  const data = sanitizeReport(raw);
  const errors = validateReport(data);
  if (Object.keys(errors).length) return { ok: false, errors };
  if (JSON.stringify(data).length > 5500000) return { ok: false, errors: { _: 'Las fotos ocupan demasiado espacio. Quita algunas e intenta de nuevo.' } };
  const { d } = await call('POST', 'reportes', data);
  if (!d.ok) return { ok: false, errors: d.errors || { _: 'No fue posible generar el reporte. Intenta de nuevo.' } };
  // El servidor guarda las fotos aparte; para el PDF se usan las que ya están en el celular.
  d.report.novedades.items.forEach((it, i) => { it.fotos = (data.novedades.items[i] || {}).fotos || []; });
  const pdf = await renderPdf(d.report);
  return { ok: true, codigo: d.codigo, report: d.report, pdf };
}
// Envía el PDF ya generado al correo designado. Devuelve 'sent' | 'skipped' | 'failed'.
export async function emailReport(codigo, pdfBlob) {
  try {
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(pdfBlob); });
    const { status, d } = await call('POST', 'reportes/' + encodeURIComponent(codigo) + '/correo', { pdf: b64 });
    return d.skipped ? 'skipped' : status === 200 && d.ok ? 'sent' : 'failed';
  } catch (e) { return 'failed'; }
}
export async function login(user) {
  const { d } = await call('POST', 'login', { user: String(user == null ? '' : user) });
  return d.ok ? { ok: true, token: d.token } : { ok: false, error: d.error || 'Usuario no autorizado.' };
}
export async function logout() {}
export async function checkSession(token) {
  if (!token) return false;
  try { const { d } = await call('GET', 'session', null, token); return !!d.ok; } catch (e) { return false; }
}
export async function listReports(token, f = {}) {
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { d } = await call('GET', 'reportes' + (qs ? '?' + qs : ''), null, token);
  return Array.isArray(d) ? d : [];
}
export async function getReport(token, codigo) {
  const { status, d } = await call('GET', 'reportes/' + encodeURIComponent(codigo), null, token);
  return status === 200 ? d : null;
}
export async function deleteReport(token, codigo) {
  const { status, d } = await call('DELETE', 'reportes/' + encodeURIComponent(codigo), null, token);
  return status === 200 && !!d.ok;
}
export async function getReportPdf(token, codigo) {
  const r = await getReport(token, codigo);
  return r ? renderPdf(r) : null;
}
