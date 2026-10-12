// Catálogos, sanitización y validación compartidos por frontend, servidor y generador de PDF.
export const ACTIVIDADES = [
  'Montaje de estructura',
  'Montaje de módulo e inversor',
  'Canalizaciones internas',
  'Resanes',
  'Visita RETIE',
  'Visita operador de red – AIRE',
  'Cambio de medidor',
  'Otra'
];
export const ROLES = [
  'Información a vecinos',
  'Atención de inquietudes',
  'Coordinación con propietarios',
  'Seguimiento a la contratación local',
  'Verificación de afectaciones',
  'Otro'
];
export const ESTADOS = ['Resuelta', 'En proceso', 'Pendiente'];

export function emptyNovedad() {
  return { descripcion: '', involucrados: '', acciones: '', proximos: '', comentarios: '', estado: '', fotos: [] };
}
export function emptyReport() {
  return {
    fecha: '', gestor: '', sector: '',
    charla: { realizada: false, hora: '', responsable: '', asistentes: '', temas: '', totalCampo: '', equipoSocial: '', capacitacionesN: '' },
    capacitaciones: [{ tema: '', asistentes: '' }],
    acomp: { ubicacion: '', actividades: [], actividadOtra: '', roles: [], rolOtro: '' },
    novedades: { tipo: '', items: [emptyNovedad()] }
  };
}

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;
function str(v, max, multiline) {
  let s = typeof v === 'string' ? v : (v == null ? '' : String(v));
  s = s.replace(CTRL, '').replace(/\r\n?/g, '\n');
  if (!multiline) s = s.replace(/\s+/g, ' ');
  else s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return s.trim().slice(0, max);
}
function num(v) {
  const s = str(v, 6, false);
  if (s === '') return '';
  return /^\d{1,5}$/.test(s) ? String(parseInt(s, 10)) : s; // valor inválido se conserva para que la validación lo reporte
}
function pick(list, allowed) {
  return Array.isArray(list) ? allowed.filter(a => list.includes(a)) : [];
}

// Fotos de novedad: máximo 2, JPEG en base64 (ya comprimidas en el celular) o referencia guardada en el servidor.
const JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
const dim = v => Math.max(1, Math.min(8000, parseInt(v, 10) || 1));
export function cleanFotos(list) {
  return (Array.isArray(list) ? list : []).filter(f => f && ((typeof f.src === 'string' && f.src.length <= 900000 && JPEG.test(f.src))
    || (typeof f.key === 'string' && /^foto\/[\d-]+\/\d+-\d$/.test(f.key))))
    .slice(0, 2).map(f => f.src ? { src: f.src, w: dim(f.w), h: dim(f.h) } : { key: f.key, w: dim(f.w), h: dim(f.h) });
}

// Normaliza cualquier entrada (cliente o servidor) a la forma canónica del reporte.
export function sanitizeReport(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const c = r.charla || {}, a = r.acomp || {}, n = r.novedades || {};
  const realizada = c.realizada === true;
  const out = {
    fecha: str(r.fecha, 10),
    gestor: str(r.gestor, 120),
    sector: str(r.sector, 160),
    charla: realizada ? {
      realizada: true,
      hora: str(c.hora, 5),
      responsable: str(c.responsable, 120),
      asistentes: num(c.asistentes),
      temas: str(c.temas, 1500, true),
      totalCampo: num(c.totalCampo),
      equipoSocial: num(c.equipoSocial),
      capacitacionesN: num(c.capacitacionesN)
    } : { realizada: false, hora: '', responsable: '', asistentes: '', temas: '', totalCampo: '', equipoSocial: '', capacitacionesN: '' },
    capacitaciones: (Array.isArray(r.capacitaciones) ? r.capacitaciones : []).slice(0, 60)
      .map(x => ({ tema: str(x && x.tema, 300, true), asistentes: num(x && x.asistentes) })),
    acomp: {
      ubicacion: str(a.ubicacion, 160),
      actividades: pick(a.actividades, ACTIVIDADES),
      actividadOtra: '',
      roles: pick(a.roles, ROLES),
      rolOtro: ''
    },
    novedades: { tipo: n.tipo === 'sin' || n.tipo === 'con' ? n.tipo : '', items: [] }
  };
  if (out.acomp.actividades.includes('Otra')) out.acomp.actividadOtra = str(a.actividadOtra, 200);
  if (out.acomp.roles.includes('Otro')) out.acomp.rolOtro = str(a.rolOtro, 200);
  if (out.novedades.tipo === 'con') {
    out.novedades.items = (Array.isArray(n.items) ? n.items : []).slice(0, 30).map(x => ({
      descripcion: str(x && x.descripcion, 3000, true),
      involucrados: str(x && x.involucrados, 1500, true),
      acciones: str(x && x.acciones, 3000, true),
      proximos: str(x && x.proximos, 2000, true),
      comentarios: str(x && x.comentarios, 2000, true),
      estado: ESTADOS.includes(x && x.estado) ? x.estado : '',
      fotos: cleanFotos(x && x.fotos)
    }));
  }
  return out;
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 2020 && y <= 2099;
}
const isNum = v => /^\d{1,5}$/.test(v);

// Devuelve { clave: mensaje }. Clave = ruta del campo (p. ej. "charla.hora", "novedades.items.0.estado").
export function validateReport(r, step) {
  const e = {};
  const all = step == null;
  if (all || step === 0) {
    if (!r.fecha) e.fecha = 'Completa la fecha del reporte.';
    else if (!validDate(r.fecha)) e.fecha = 'La fecha no es válida.';
    if (!r.gestor) e.gestor = 'Escribe el nombre del gestor(a) que reporta.';
    if (!r.sector) e.sector = 'Indica el sector, vereda o punto.';
  }
  if (all || step === 1) {
    // Opcionales; solo se valida el formato de lo que se diligencie.
    const c = r.charla;
    if (c.realizada) {
      if (c.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.hora)) e['charla.hora'] = 'La hora no es válida.';
      ['asistentes', 'totalCampo', 'equipoSocial', 'capacitacionesN'].forEach(k => {
        if (c[k] !== '' && !isNum(c[k])) e['charla.' + k] = 'Usa solo números enteros.';
      });
      if (isNum(c.totalCampo) && isNum(c.equipoSocial) && +c.equipoSocial > +c.totalCampo)
        e['charla.equipoSocial'] = 'El equipo social no puede ser mayor que el total de personas en campo.';
    }
    r.capacitaciones.forEach((x, i) => {
      if (x.asistentes !== '' && !isNum(x.asistentes)) e['capacitaciones.' + i + '.asistentes'] = 'Usa solo números enteros.';
    });
  }
  if (all || step === 3) {
    const n = r.novedades;
    if (!n.tipo) e['novedades.tipo'] = 'Indica si hubo o no novedades en la jornada.';
    if (n.tipo === 'con' && !n.items.some(x => x.descripcion || x.involucrados || x.acciones || x.proximos || x.comentarios))
      e['novedades.items.0.descripcion'] = 'Describe al menos una novedad.';
  }
  return e;
}

export function fechaLarga(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d + '/' + m + '/' + y;
}
export function cleanCapacitaciones(list) {
  return list.filter(x => x.tema || x.asistentes !== '');
}
