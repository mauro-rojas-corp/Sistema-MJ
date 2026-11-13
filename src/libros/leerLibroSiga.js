// Lectura de los libros IVA (compras y ventas) exportados de SIGA en Excel
// («Exportar Consulta») o CSV. Formato de los ejemplos (Ley 125/91):
//
//   LIBRO COMPRAS LEY 125/91          ← título (compras o ventas)
//   VOLÉO S.R.L  /  Razón Social: …   ← cliente
//   Sucursal: …   MES: Mayo   AÑO: 2025
//   DIA | DOCUMENTO NRO | R. SOCIAL… | RUC | GRAV 10% | … | TOTAL | …   ← títulos
//   … un comprobante por fila …
//   TOTAL... | … totales del mes …    ← fin del detalle
//   (después, resúmenes por tipo de comprobante y rubros: no se importan)
//
// Las columnas se reconocen por su título (no por posición), así que tolera
// que SIGA agregue, quite u ordene distinto alguna columna.

import { MESES } from '../iva/ivaCore.js';

// Columnas conocidas: clave → título para mostrar y si es un importe.
export const COLUMNAS = {
  dia: { titulo: 'Día', importe: false },
  documento: { titulo: 'Documento', importe: false },
  comprobDel: { titulo: 'Comprob. del', importe: false },
  comprobAl: { titulo: 'Comprob. al', importe: false },
  timbrado: { titulo: 'Timbrado', importe: false },
  razonSocial: { titulo: 'Razón social / Nombre', importe: false },
  ruc: { titulo: 'RUC', importe: false },
  grav10: { titulo: 'Grav. 10%', importe: true },
  grav5: { titulo: 'Grav. 5%', importe: true },
  iva10: { titulo: 'IVA 10%', importe: true },
  iva5: { titulo: 'IVA 5%', importe: true },
  noImputa10: { titulo: 'No imputa 10%', importe: true },
  noImputa5: { titulo: 'No imputa 5%', importe: true },
  exentas: { titulo: 'Exentas', importe: true },
  total: { titulo: 'Total', importe: true },
  baseImponible: { titulo: 'Base imponible', importe: true },
  retenciones: { titulo: 'Retenciones', importe: true },
  tipoComprobante: { titulo: 'Tipo', importe: false },
};

const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normTitulo = (s) => sinAcentos(s).toUpperCase().replace(/[.º°/]/g, ' ').replace(/\s+/g, ' ').trim();

function claveDeTitulo(raw) {
  const t = normTitulo(raw);
  if (!t) return null;
  if (t === 'DIA' || t === 'FECHA') return 'dia';
  if (/^COMPROB(ANTE)? DEL$/.test(t)) return 'comprobDel';
  if (/^COMPROB(ANTE)? AL$/.test(t)) return 'comprobAl';
  if (t.startsWith('DOCUMENTO') || t === 'NRO COMPROBANTE') return 'documento';
  if (t === 'TIMBRADO') return 'timbrado';
  if (t.startsWith('R SOCIAL') || t.includes('RAZON SOCIAL') || t.includes('APELLIDO')) return 'razonSocial';
  if (t === 'RUC' || t === 'R U C') return 'ruc';
  if (/^GRAV(ADA|ADO)?S? 10 ?%$/.test(t)) return 'grav10';
  if (/^GRAV(ADA|ADO)?S? 5 ?%$/.test(t) || /^GRAV(ADA|ADO)?S? 05 ?%$/.test(t)) return 'grav5';
  if (/^IVA 10 ?%$/.test(t)) return 'iva10';
  if (/^IVA 0?5 ?%$/.test(t)) return 'iva5';
  if (/^NO IMPUTA 10 ?%$/.test(t)) return 'noImputa10';
  if (/^NO IMPUTA 0?5 ?%$/.test(t)) return 'noImputa5';
  if (t.startsWith('EXENTA')) return 'exentas';
  if (t === 'TOTAL') return 'total';
  if (t.includes('BASE IMPONIBLE')) return 'baseImponible';
  if (t.startsWith('RETENCION')) return 'retenciones';
  if (t.startsWith('TIP') && t.includes('COMPROBANTE')) return 'tipoComprobante';
  return null;
}

// Importe: número de Excel o texto «1.234.567» / «1.234,5».
export function aNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').trim();
  if (!s) return 0;
  const negativo = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()\s-]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/[.,](?=\d{3}(\D|$))/g, '');
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? (negativo ? -n : n) : 0;
}

// Texto: documentos y RUC pueden venir como número (572348816030).
function aTexto(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).replace(/\s+/g, ' ').trim();
}

const esVacia = (fila) => !fila || fila.every((c) => c === null || c === undefined || String(c).trim() === '');

// filas: matriz de celdas (hoja tal cual). Devuelve el libro o lanza un Error
// con un mensaje para la persona.
export function interpretarLibro(filas, nombreArchivo = '') {
  const idxTitulos = filas.findIndex((f) => {
    if (!f) return false;
    const claves = f.map(claveDeTitulo);
    return claves.includes('dia') && claves.includes('total') && (claves.includes('documento') || claves.includes('razonSocial'));
  });
  if (idxTitulos < 0) {
    throw new Error('No se encontraron las columnas del libro (DIA, DOCUMENTO, … TOTAL). ¿Es un libro de compras o ventas exportado de SIGA?');
  }
  const columnas = [];
  filas[idxTitulos].forEach((c, i) => {
    const clave = claveDeTitulo(c);
    if (clave && !columnas.some((x) => x.clave === clave)) columnas.push({ clave, i });
  });

  // Cabecera: tipo, cliente, mes y año.
  const textosCabecera = filas.slice(0, idxTitulos).flatMap((f) => (f || []).filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim()));
  const todo = sinAcentos(textosCabecera.join(' | ')).toUpperCase();
  const claves = columnas.map((c) => c.clave);
  let tipo = /LIBRO\s+(DE\s+)?COMPRA/.test(todo) ? 'compras' : /LIBRO\s+(DE\s+)?VENTA/.test(todo) ? 'ventas' : '';
  if (!tipo) tipo = claves.includes('noImputa10') || claves.includes('baseImponible') ? 'compras' : claves.includes('timbrado') || claves.includes('retenciones') ? 'ventas' : '';
  if (!tipo) {
    const n = sinAcentos(nombreArchivo).toUpperCase();
    tipo = n.includes('COMPRA') ? 'compras' : n.includes('VENTA') ? 'ventas' : '';
  }

  let razonSocial = '';
  for (const t of textosCabecera) {
    const m = t.match(/^Raz[oó]n\s+Social\s*:?\s*(.*)$/i);
    if (m && m[1].trim()) { razonSocial = m[1].trim(); break; }
  }
  if (!razonSocial) {
    razonSocial = textosCabecera.find((t) => !/LIBRO|LEY|SUCURSAL|DIRECCI|MES|A[ÑN]O|:/i.test(sinAcentos(t)) && /[A-Za-z]/.test(t)) || '';
  }
  razonSocial = razonSocial.replace(/\s+/g, ' ').trim();

  const mMes = todo.match(/MES\s*:?\s*([A-Z]+)/);
  const mesIdx = mMes ? MESES.findIndex((m) => sinAcentos(m).toUpperCase() === mMes[1]) : -1;
  const mAnio = todo.match(/A[NÑ]O\s*:?\s*(\d{4})/);
  const anio = mAnio ? Number(mAnio[1]) : null;

  // Detalle: hasta la fila «TOTAL…» (o hasta el primer bloque vacío).
  const detalle = [];
  let totalesArchivo = null;
  for (let r = idxTitulos + 1; r < filas.length; r += 1) {
    const f = filas[r] || [];
    if (esVacia(f)) {
      if (detalle.length) break;
      continue;
    }
    const textos = f.filter((c) => typeof c === 'string').map((c) => normTitulo(c));
    const dia = f[columnas.find((c) => c.clave === 'dia').i];
    if ((dia === null || dia === undefined || String(dia).trim() === '') && textos.some((t) => /^TOTAL/.test(t))) {
      totalesArchivo = {};
      columnas.forEach(({ clave, i }) => { if (COLUMNAS[clave].importe) totalesArchivo[clave] = aNumero(f[i]); });
      break;
    }
    const comp = {};
    columnas.forEach(({ clave, i }) => {
      comp[clave] = COLUMNAS[clave].importe ? aNumero(f[i]) : aTexto(f[i]);
    });
    if (!comp.documento && !comp.razonSocial && !comp.total) continue;
    detalle.push(comp);
  }
  if (!detalle.length) throw new Error('El archivo no tiene comprobantes en el detalle.');

  const totales = {};
  columnas.forEach(({ clave }) => { if (COLUMNAS[clave].importe) totales[clave] = 0; });
  detalle.forEach((c) => Object.keys(totales).forEach((k) => { totales[k] += c[k] || 0; }));
  const diferencias = totalesArchivo
    ? Object.keys(totales).filter((k) => Math.abs((totalesArchivo[k] || 0) - totales[k]) >= 1)
    : [];
  const anulados = detalle.filter((c) => /ANULAD/i.test(c.razonSocial)).length;

  return {
    tipo,
    razonSocial,
    mes: mesIdx >= 0 ? mesIdx + 1 : null,
    anio,
    columnas: columnas.map((c) => c.clave),
    comprobantes: detalle,
    totales,
    totalesArchivo,
    coinciden: totalesArchivo ? diferencias.length === 0 : null,
    diferencias,
    anulados,
  };
}

// Lee un File (Excel o CSV) en el navegador.
export async function leerArchivoLibro(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
  } catch {
    throw new Error('No se pudo leer el archivo. Exportalo de SIGA en Excel (.xlsx o .xls) o CSV.');
  }
  let ultimoError = null;
  for (const nombre of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: true });
    try {
      return interpretarLibro(filas, file.name);
    } catch (e) {
      ultimoError = e;
    }
  }
  throw ultimoError || new Error('El archivo está vacío.');
}

// Para guardar: columnas + filas compactas (sólo valores).
export function libroADatos(libro) {
  return {
    columnas: libro.columnas,
    filas: libro.comprobantes.map((c) => libro.columnas.map((k) => c[k] ?? (COLUMNAS[k].importe ? 0 : ''))),
  };
}

// De lo guardado a objetos { clave: valor }.
export function datosAComprobantes(datos) {
  const cols = (datos && datos.columnas) || [];
  return ((datos && datos.filas) || []).map((f) => Object.fromEntries(cols.map((k, i) => [k, f[i]])));
}

const normNombre = (s) => sinAcentos(s).toUpperCase()
  .replace(/\b(S\s*\.?\s*R\s*\.?\s*L|S\s*\.?\s*A\s*\.?\s*E?|E\s*\.?\s*I\s*\.?\s*R\s*\.?\s*L|SOCIEDAD|ANONIMA|LTDA|SRL|SA)\b\.?/g, ' ')
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Cliente de la lista más parecido al nombre del archivo (o null).
export function sugerirCliente(razonSocial, clientes) {
  const objetivo = normNombre(razonSocial);
  if (!objetivo) return null;
  const palabras = new Set(objetivo.split(' ').filter((p) => p.length > 1));
  let mejor = null;
  let puntaje = 0;
  for (const c of clientes) {
    const n = normNombre(c.nombre);
    if (!n) continue;
    if (n === objetivo) return c;
    const ps = n.split(' ').filter((p) => p.length > 1);
    const comunes = ps.filter((p) => palabras.has(p)).length;
    const p = comunes / Math.max(palabras.size, ps.length);
    if (p > puntaje) { puntaje = p; mejor = c; }
  }
  return puntaje >= 0.5 ? mejor : null;
}
