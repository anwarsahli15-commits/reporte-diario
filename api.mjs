// Netlify Function: API del reporte diario. Base de datos: Netlify Blobs (sin configuración adicional).
// Rutas: POST /api/reportes · POST /api/login · GET /api/session · GET /api/reportes · GET /api/reportes/:codigo · DELETE /api/reportes/:codigo
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { sanitizeReport, validateReport } from '../../public/shared.js';

const ADMIN_USER = process.env.ADMIN_USER || 'colombia_solar';
const SESSION_MS = 8 * 3600 * 1000;
const store = () => getStore({ name: 'reporte-diario', consistency: 'strong' });

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

// Secreto para firmar sesiones: variable SESSION_SECRET o uno generado y guardado una sola vez.
let secretP;
function secret(st) {
  if (process.env.SESSION_SECRET) return Promise.resolve(process.env.SESSION_SECRET);
  if (!secretP) secretP = (async () => {
    await st.set('config/secret', crypto.randomBytes(32).toString('hex'), { onlyIfNew: true });
    return st.get('config/secret', { type: 'text' });
  })();
  return secretP;
}
async function sign(st, obj) {
  const p = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', await secret(st)).update(p).digest('base64url');
}
async function verify(st, tok) {
  if (typeof tok !== 'string' || !tok.includes('.')) return null;
  const [p, s] = tok.split('.');
  const good = crypto.createHmac('sha256', await secret(st)).update(p).digest('base64url');
  if (!s || s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch (e) { return null; }
}
async function isAdmin(st, req) {
  const h = req.headers.get('authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const o = await verify(st, t);
  return !!(o && o.admin);
}

// Consecutivo por fecha: se "reclama" la clave codigo/AAAAMMDD-NNN con escritura condicional (onlyIfNew).
// Si otra persona la tomó primero, la escritura no se aplica y se intenta con el siguiente número.
async function claimCode(st, fecha) {
  const ymd = fecha.replace(/-/g, '');
  const { blobs } = await st.list({ prefix: 'codigo/' + ymd + '-' });
  let n = blobs.reduce((m, b) => Math.max(m, parseInt(b.key.slice(-3), 10) || 0), 0) + 1;
  for (let i = 0; i < 50 && n <= 999; i++, n++) {
    const codigo = ymd + '-' + String(n).padStart(3, '0');
    const r = await st.set('codigo/' + codigo, new Date().toISOString(), { onlyIfNew: true });
    if (r && r.modified) return { codigo, n };
  }
  return null;
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default async (req) => {
  const st = store();
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  try {
    if (req.method === 'POST' && parts[0] === 'reportes' && parts.length === 1) {
      const text = await req.text();
      if (text.length > 5800000) return json(413, { ok: false, errors: { _: 'El reporte es demasiado grande.' } });
      let body; try { body = JSON.parse(text); } catch (e) { return json(400, { ok: false, errors: { _: 'Datos no válidos.' } }); }
      const data = sanitizeReport(body);
      const errors = validateReport(data);
      if (Object.keys(errors).length) return json(422, { ok: false, errors });
      const c = await claimCode(st, data.fecha);
      if (!c) return json(409, { ok: false, errors: { fecha: 'Se alcanzó el máximo de 999 reportes para esta fecha.' } });
      // Las fotos se guardan como blobs aparte (foto/CODIGO/novedad-n) para que el listado siga siendo liviano.
      for (const [i, it] of data.novedades.items.entries()) {
        it.fotos = await Promise.all(it.fotos.filter(f => f.src).map(async (f, j) => {
          const key = 'foto/' + c.codigo + '/' + i + '-' + j;
          await st.set(key, f.src);
          return { key, w: f.w, h: f.h };
        }));
      }
      const record = { ...data, codigo: c.codigo, consecutivo: c.n, creadoEn: new Date().toISOString() };
      await st.set('reporte/' + c.codigo, JSON.stringify(record));
      return json(201, { ok: true, codigo: c.codigo, report: record });
    }
    if (req.method === 'POST' && parts[0] === 'login') {
      const body = await req.json().catch(() => ({}));
      const user = String(body.user == null ? '' : body.user);
      await new Promise(r => setTimeout(r, 300));
      const ok = user.length === ADMIN_USER.length && crypto.timingSafeEqual(Buffer.from(user), Buffer.from(ADMIN_USER));
      if (!ok) return json(401, { ok: false, error: 'Usuario no autorizado.' });
      return json(200, { ok: true, token: await sign(st, { admin: true, exp: Date.now() + SESSION_MS }) });
    }
    if (req.method === 'GET' && parts[0] === 'session') {
      return json(200, { ok: await isAdmin(st, req) });
    }
    if (req.method === 'GET' && parts[0] === 'reportes') {
      if (!(await isAdmin(st, req))) return json(401, { ok: false });
      if (parts[1]) {
        const r = await st.get('reporte/' + parts[1].replace(/[^\d-]/g, ''), { type: 'json' });
        if (!r) return json(404, { ok: false });
        for (const it of (r.novedades && r.novedades.items) || []) {
          it.fotos = (await Promise.all((it.fotos || []).map(async f => {
            const src = f.key ? await st.get(f.key, { type: 'text' }) : f.src;
            return src ? { src, w: f.w, h: f.h } : null;
          }))).filter(Boolean);
        }
        return json(200, r);
      }
      const { blobs } = await st.list({ prefix: 'reporte/' });
      const all = (await Promise.all(blobs.map(b => st.get(b.key, { type: 'json' })))).filter(Boolean);
      const q = Object.fromEntries(['codigo', 'fecha', 'gestor', 'sector'].map(k => [k, url.searchParams.get(k) || '']));
      const list = all.filter(r => (!q.codigo || r.codigo.includes(q.codigo.replace(/\s/g, '')))
        && (!q.fecha || r.fecha === q.fecha)
        && (!q.gestor || norm(r.gestor).includes(norm(q.gestor)))
        && (!q.sector || norm(r.sector + ' ' + r.acomp.ubicacion).includes(norm(q.sector))))
        .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
      return json(200, list);
    }
    // Envío del PDF por correo (Resend). Solo una vez por reporte, y solo si existe RESEND_API_KEY.
    if (req.method === 'POST' && parts[0] === 'reportes' && parts[1] && parts[2] === 'correo') {
      const key = process.env.RESEND_API_KEY;
      const to = (process.env.MAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!key || !to.length) return json(200, { ok: false, skipped: true });
      const codigo = parts[1].replace(/[^\d-]/g, '');
      const r = await st.get('reporte/' + codigo, { type: 'json' });
      if (!r) return json(404, { ok: false });
      const text = await req.text();
      if (text.length > 5800000) return json(413, { ok: false });
      let pdf = ''; try { pdf = String(JSON.parse(text).pdf || ''); } catch (e) {}
      if (!/^[A-Za-z0-9+/]+=*$/.test(pdf) || !Buffer.from(pdf.slice(0, 8), 'base64').toString('latin1').startsWith('%PDF')) return json(400, { ok: false });
      const lock = await st.set('correo/' + codigo, new Date().toISOString(), { onlyIfNew: true });
      if (!(lock && lock.modified)) return json(200, { ok: true, already: true });
      const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const nov = r.novedades.tipo === 'con' ? r.novedades.items.length + (r.novedades.items.length === 1 ? ' novedad' : ' novedades') : 'Sin novedades';
      const fecha = r.fecha.split('-').reverse().join('/');
      const payload = {
        from: process.env.MAIL_FROM || 'Reporte diario <onboarding@resend.dev>',
        to,
        subject: 'Reporte diario ' + codigo + ' · ' + r.gestor + ' · ' + r.sector,
        html: '<p>Se generó un nuevo reporte diario.</p><table cellpadding="4" style="font-family:Arial,sans-serif;font-size:14px">'
          + '<tr><td><b>Código</b></td><td>' + esc(codigo) + '</td></tr><tr><td><b>Fecha</b></td><td>' + esc(fecha) + '</td></tr>'
          + '<tr><td><b>Gestor(a)</b></td><td>' + esc(r.gestor) + '</td></tr><tr><td><b>Sector / vereda / punto</b></td><td>' + esc(r.sector) + '</td></tr>'
          + '<tr><td><b>Novedades</b></td><td>' + esc(nov) + '</td></tr></table><p>El PDF va adjunto.</p>',
        attachments: [{ filename: 'Reporte-diario-' + codigo + '.pdf', content: pdf }]
      };
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!resp.ok) { console.error('Resend', resp.status, await resp.text()); await st.delete('correo/' + codigo); return json(502, { ok: false }); }
      return json(200, { ok: true });
    }
    if (req.method === 'DELETE' && parts[0] === 'reportes' && parts[1]) {
      if (!(await isAdmin(st, req))) return json(401, { ok: false });
      const codigo = parts[1].replace(/[^\d-]/g, '');
      const { blobs } = await st.list({ prefix: 'foto/' + codigo + '/' });
      await Promise.all(blobs.map(b => st.delete(b.key)));
      await st.delete('reporte/' + codigo);
      // Se conserva codigo/<codigo> para que el número no se vuelva a asignar.
      return json(200, { ok: true });
    }
    return json(404, { ok: false });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false, errors: { _: 'No fue posible procesar la solicitud. Intenta de nuevo.' } });
  }
};

export const config = { path: '/api/*' };
