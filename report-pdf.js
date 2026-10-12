// Plantilla del "Reporte diario" dibujada con coordenadas (pt) medidas sobre la Matriz original (carta 612×792).
// Funciona en navegador y en Node: recibe el constructor jsPDF y los recursos (logo, fuentes) ya cargados.
import { ACTIVIDADES, ROLES, ESTADOS, fechaLarga, cleanCapacitaciones } from './shared.js';

const W = 612, H = 792, ML = 54, MR = 558, LBL = 200;
const TOP = 44, BOTTOM = 750;
const NAVY = [31, 58, 95], LBLBG = [232, 238, 245], BORDER = [154, 165, 177], INK = [0, 0, 0], MUTED = [110, 118, 128];
const FS = 10.5, LH = 13, PAD = 6;

export function buildReportPdf(report, { jsPDF, logo, fonts }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  let F = 'helvetica';
  if (fonts && fonts.regular && fonts.bold) {
    doc.addFileToVFS('Carlito-Regular.ttf', fonts.regular);
    doc.addFileToVFS('Carlito-Bold.ttf', fonts.bold);
    doc.addFont('Carlito-Regular.ttf', 'Carlito', 'normal');
    doc.addFont('Carlito-Bold.ttf', 'Carlito', 'bold');
    F = 'Carlito';
  }
  doc.setProperties({ title: 'Reporte diario ' + report.codigo, subject: 'Reporte diario', creator: 'Reporte diario – Gestión social' });
  doc.setLineHeightFactor(LH / FS);
  let y = 0;

  const font = (style, size, color) => { doc.setFont(F, style); doc.setFontSize(size); doc.setTextColor(...(color || INK)); };
  const wrap = (text, width, style) => { font(style, FS); return text ? doc.splitTextToSize(String(text), width) : []; };
  const newPage = () => { doc.addPage('letter'); y = TOP; };
  const ensure = h => { if (y + h > BOTTOM) newPage(); };

  function box(x, by, checked) {
    const s = 7.6, top = by - 7.4;
    doc.setDrawColor(...INK); doc.setLineWidth(0.6);
    doc.rect(x, top, s, s);
    if (checked) {
      doc.setLineWidth(1.1); doc.setDrawColor(...NAVY);
      doc.line(x + 1.7, top + 1.7, x + s - 1.7, top + s - 1.7);
      doc.line(x + s - 1.7, top + 1.7, x + 1.7, top + s - 1.7);
    }
  }
  function bar(title) {
    y += 12; ensure(15 + 40);
    doc.setFillColor(...NAVY); doc.rect(ML - 1, y, MR - ML + 3, 15, 'F');
    font('bold', 12, [255, 255, 255]); doc.text(title, ML + 3, y + 11.6);
    y += 15 + 5;
  }
  function caption(text) { font('bold', FS); doc.text(text, ML, y + 11); y += 15; }
  function check(label, checked, extra) {
    font('normal', FS);
    if (extra === undefined) {
      const lines = doc.splitTextToSize(label, MR - 80);
      ensure(15 + (lines.length - 1) * LH);
      box(64.5, y + 11, checked); doc.text(lines, 80, y + 11);
      y += 15 + (lines.length - 1) * LH;
      return;
    }
    // "Otra: ______" — el texto especificado va sobre la línea
    const pre = label + ': ';
    const px = 80 + doc.getTextWidth(pre);
    const lines = extra ? doc.splitTextToSize(extra, MR - px) : [''];
    ensure(15 + (lines.length - 1) * LH);
    box(64.5, y + 11, checked); doc.text(pre, 80, y + 11);
    doc.setDrawColor(...INK); doc.setLineWidth(0.5);
    lines.forEach((ln, i) => {
      const by = y + 11 + i * LH;
      const w = Math.max(158, doc.getTextWidth(ln) + 4);
      doc.line(px, by + 1.6, Math.min(px + w, MR), by + 1.6);
      if (ln) { font('normal', FS); doc.text(ln, px + 2, by); }
    });
    y += 15 + (lines.length - 1) * LH;
  }
  function cell(x, top, w, h, fill) {
    if (fill) { doc.setFillColor(...fill); doc.rect(x, top, w, h, 'F'); }
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.6); doc.rect(x, top, w, h);
  }
  // Fila etiqueta/valor; divide valores muy largos entre páginas sin cortar líneas.
  function kv(label, value, minLines) {
    const L = wrap(label, LBL - PAD * 2, 'bold');
    let V = wrap(value, MR - ML - LBL - PAD * 2, 'normal');
    const cap = Math.floor((BOTTOM - TOP - 7) / LH);
    let cont = false;
    while (true) {
      const lbl = cont ? wrap(label + ' (cont.)', LBL - PAD * 2, 'bold') : L;
      const need = Math.max(lbl.length, V.length, minLines || 1);
      const avail = Math.floor((BOTTOM - y - 7) / LH);
      if (need > avail && (need <= cap || avail < 2)) { newPage(); continue; }
      const n = Math.min(need, avail);
      const h = 7 + LH * n;
      cell(ML, y, LBL, h, LBLBG); cell(ML + LBL, y, MR - ML - LBL, h);
      font('bold', FS); doc.text(lbl.slice(0, n), ML + PAD, y + 14);
      font('normal', FS); doc.text(V.slice(0, n), ML + LBL + PAD, y + 14);
      y += h; V = V.slice(n); cont = true;
      if (!V.length) break;
      newPage();
    }
  }
  function grid(cols, rows) {
    // cols: [{title, w}] ; rows: [[...]]
    const drawRow = (vals, header) => {
      const wrapped = vals.map((v, i) => wrap(v, cols[i].w - PAD * 2, header ? 'bold' : 'normal'));
      const n = Math.max(1, ...wrapped.map(w => w.length));
      const h = 7 + LH * n;
      if (y + h > BOTTOM) { newPage(); drawRow(cols.map(c => c.title), true); }
      let x = ML;
      wrapped.forEach((lines, i) => {
        cell(x, y, cols[i].w, h, header ? LBLBG : null);
        font(header ? 'bold' : 'normal', FS); doc.text(lines, x + PAD, y + 14);
        x += cols[i].w;
      });
      y += h;
    };
    ensure(7 + LH * 2 + 7 + LH);
    drawRow(cols.map(c => c.title), true);
    rows.forEach(r => drawRow(r, false));
  }

  // ── Encabezado
  if (logo) doc.addImage(logo, 'PNG', ML, 53, 141.5, 35.1);
  font('bold', 16, NAVY); doc.text('CODIGO', 419, 86);
  font('normal', 13, INK); doc.text(report.codigo || '', 419, 104);

  // ── Información general
  y = 117;
  kv('Fecha', fechaLarga(report.fecha));
  kv('Gestor(a) que reporta', report.gestor);
  kv('Sector / vereda / punto', report.sector);

  // ── 1. Charla pre-operativa
  const c = report.charla;
  bar('1. Charla pre-operativa');
  if (!c.realizada) {
    const lbl = 'Se realizó charla pre-operativa en la jornada';
    font('normal', FS); ensure(15);
    box(64.5, y + 11, false); doc.text(lbl, 80, y + 11);
    y += 15 + 8;
  } else {
  check('Se realizó charla pre-operativa en la jornada', c.realizada);
  y += 16;
  kv('Hora', c.hora);
  kv('Responsable', c.responsable);
  kv('Asistentes (n.º)', c.asistentes);
  kv('Temas abordados', c.temas);
  kv('Total de personas en campo (n.º)', c.totalCampo);
  kv('Del total, equipo social (n.º)', c.equipoSocial);
  kv('Capacitaciones realizadas (n.º)', c.capacitacionesN);
  y += 5; ensure(15 + 20 * 3); caption('Detalle de capacitaciones (una fila por tema)');
  const caps = cleanCapacitaciones(report.capacitaciones).map(x => [x.tema, x.asistentes]);
  while (caps.length < 6) caps.push(['', '']);
  grid([{ title: 'Tema', w: 354 }, { title: 'Asistentes (n.º)', w: 150 }], caps);
  }

  // ── 2. Acompañamiento social
  const a = report.acomp;
  bar('2. Acompañamiento social a la parte técnica');
  kv('Ubicación (sector / vereda / punto)', a.ubicacion);
  y += 5; ensure(15 * (ACTIVIDADES.length + 1));
  caption('Actividad técnica acompañada (marque las que apliquen)');
  ACTIVIDADES.forEach(o => check(o, a.actividades.includes(o), o === 'Otra' ? a.actividadOtra : undefined));
  y += 8; ensure(15 * (ROLES.length + 1));
  caption('Rol del equipo social durante la actividad (marque las que apliquen)');
  ROLES.forEach(o => check(o, a.roles.includes(o), o === 'Otro' ? a.rolOtro : undefined));

  // ── 3. Novedades
  const n = report.novedades;
  bar('3. Novedades');
  check('Sin novedades: durante la jornada no se presentaron novedades (no diligenciar la tabla)', n.tipo === 'sin');
  y += 1;
  check('Con novedades (diligenciar la tabla; si hay más de una, repetirla)', n.tipo === 'con');
  if (n.tipo === 'con') {
    y += 16;
    const kvH = (l, v) => 7 + LH * Math.max(1, wrap(l, LBL - PAD * 2, 'bold').length, wrap(v, MR - ML - LBL - PAD * 2, 'normal').length);
    n.items.forEach((it, i) => {
      if (i > 0) y += 18;
      const fotos = (it.fotos || []).filter(f => f && f.src);
      const FG = 12, FW = (MR - ML - FG) / 2, FMAX = 210;
      const fd = fotos.map(f => { const r = (f.h || 3) / (f.w || 4); let w = FW, h = FW * r; if (h > FMAX) { h = FMAX; w = FMAX / r; } return { w, h }; });
      const fRow = fd.length ? Math.max(...fd.map(d => d.h)) : 0;
      const fBlock = fd.length ? 10 + 15 + fRow + 16 : 0;
      // Mantener tabla + estado en la misma página cuando el bloque cabe en una página
      const blockH = (n.items.length > 1 ? 16 : 0) + kvH('Descripción (qué ocurrió, dónde y cuándo)', it.descripcion)
        + kvH('Personas o áreas involucradas (comunidad, propietario, contratista, etc.)', it.involucrados)
        + kvH('Acciones realizadas para solucionar o avanzar', it.acciones) + kvH('Próximos pasos (acción, responsable y fecha)', it.proximos)
        + kvH('Comentarios', it.comentarios) + fBlock + 14 + 60;
      if (blockH <= BOTTOM - TOP && y + blockH > BOTTOM) newPage();
      if (n.items.length > 1) { ensure(15 + 20 * 2); font('bold', FS, NAVY); doc.text('Novedad ' + (i + 1) + ' de ' + n.items.length, ML, y + 11); y += 16; }
      kv('Descripción (qué ocurrió, dónde y cuándo)', it.descripcion);
      kv('Personas o áreas involucradas (comunidad, propietario, contratista, etc.)', it.involucrados);
      kv('Acciones realizadas para solucionar o avanzar', it.acciones);
      kv('Próximos pasos (acción, responsable y fecha)', it.proximos);
      kv('Comentarios', it.comentarios);
      if (fotos.length) {
        y += 10; ensure(15 + fRow + 16);
        caption('Registro fotográfico');
        fotos.forEach((f, j) => {
          const d = fd[j], sx = ML + j * (FW + FG), x = sx + (FW - d.w) / 2;
          try { doc.addImage(f.src, 'JPEG', x, y, d.w, d.h, undefined, 'FAST'); } catch (e) {}
          doc.setDrawColor(...BORDER); doc.setLineWidth(0.6); doc.rect(x, y, d.w, d.h);
          font('normal', 8.5, MUTED); doc.text('Foto ' + (j + 1), x, y + d.h + 11);
        });
        y += fRow + 16;
      }
      y += 14; ensure(15 * 4);
      caption('Estado de la novedad');
      ESTADOS.forEach(s => check(s, it.estado === s));
    });
  }

  // ── Pie de página: código y paginación
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    font('normal', 8, MUTED);
    doc.text('Reporte diario · ' + (report.codigo || ''), ML, H - 24);
    doc.text('Página ' + p + ' de ' + total, MR, H - 24, { align: 'right' });
  }
  return doc.output('arraybuffer');
}
