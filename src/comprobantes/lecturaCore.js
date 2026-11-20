// Lectura de documentos: preparar cada archivo (lo que se puede leer en la
// app se lee acá; el resto va a Claude por Apps Script) y convertir lo leído
// en comprobantes del registro, decidiendo de qué cliente es y si es venta o
// compra según el RUC del emisor y del receptor.

import { calcular, dvRuc, normalizar, revisar } from './comprobantesCore.js';
import { esRegistroMarangatu, interpretarRegistroMarangatu } from './leerRegistroMarangatu.js';

const MAX_PDF = 15 * 1024 * 1024;
const MAX_LADO_IMAGEN = 2000;
export const ACEPTA = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.xlsx,.xls,.csv,.txt,.xml';

const sinDv = (r) => String(r || '').toUpperCase().split('-')[0].replace(/[^0-9A-Z]/g, '');
const ext = (n) => (String(n).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

function aBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Fotos: se achican a 2000 px de lado mayor y se pasan a JPEG (menos peso y
// menos costo de lectura, sin perder legibilidad).
async function imagenAJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('No se pudo abrir la imagen. Si es una foto de iPhone (HEIC), convertila a JPG.'));
      i.src = url;
    });
    const escala = Math.min(1, MAX_LADO_IMAGEN / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Devuelve { local: { origen, comprobantes, informante } } si se pudo leer en
// la app, o { ia: { nombre, tipo, base64 } | { nombre, texto } } para Claude.
export async function prepararArchivo(file) {
  const e = ext(file.name);
  const tipo = (file.type || '').toLowerCase();
  if (['xlsx', 'xls', 'csv'].includes(e)) {
    const XLSX = await import('xlsx');
    let wb;
    try {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
    } catch {
      throw new Error('No se pudo abrir la planilla.');
    }
    const partes = [];
    for (const nombre of wb.SheetNames) {
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: false });
      if (esRegistroMarangatu(filas)) {
        const reg = interpretarRegistroMarangatu(filas);
        return { local: { origen: 'Detalle de comprobantes de Marangatu', informante: reg.informante, comprobantes: reg.comprobantes } };
      }
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[nombre], { blankrows: false });
      if (csv.trim()) partes.push(`### Hoja «${nombre}»\n${csv}`);
    }
    const texto = partes.join('\n\n');
    if (!texto.trim()) throw new Error('La planilla está vacía.');
    if (texto.length > 180000) throw new Error('La planilla es muy grande para leerla de una vez: dividila en partes (por mes, por ejemplo).');
    return { ia: { nombre: file.name, texto } };
  }
  if (['txt', 'xml'].includes(e)) {
    const texto = await file.text();
    if (texto.length > 180000) throw new Error('El archivo es muy grande para leerlo de una vez.');
    return { ia: { nombre: file.name, texto } };
  }
  if (e === 'pdf' || tipo === 'application/pdf') {
    if (file.size > MAX_PDF) throw new Error('El PDF pesa más de 15 MB: dividilo en partes.');
    return { ia: { nombre: file.name, tipo: 'application/pdf', base64: aBase64(await file.arrayBuffer()) } };
  }
  if (tipo.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(e)) {
    return { ia: { nombre: file.name, tipo: 'image/jpeg', base64: await imagenAJpeg(file) } };
  }
  throw new Error('Ese tipo de archivo no se puede leer. Usá PDF, foto (JPG/PNG), Excel o CSV.');
}

const conDv = (r) => {
  const s = String(r || '').trim().toUpperCase();
  return /^\d{5,9}$/.test(s) ? `${s}-${dvRuc(s)}` : s;
};

// Un documento leído por Claude → comprobante del registro + a qué cliente va.
// clientes = [{ ruc, dv, nombre }]; preferido = ruc del cliente elegido en
// pantalla (si lo hay); rucEstudio = RUC del estudio (honorarios).
export function documentoAComprobante(doc, { clientes, preferido = '', rucEstudio = '' }) {
  const buscar = (r) => (sinDv(r) ? clientes.find((c) => c.ruc === sinDv(r)) || null : null);
  const em = buscar(doc.emisor_ruc);
  const re = buscar(doc.receptor_ruc);
  const avisos = [];
  const esEstudio = rucEstudio && sinDv(doc.emisor_ruc) === sinDv(rucEstudio);
  let cliente = null;
  let lado = ''; // 'emisor' = el cliente emitió (venta / cobró); 'receptor' = el cliente recibió (compra / pagó)
  if (em && re) {
    const pref = [em, re].find((c) => c.ruc === preferido);
    cliente = pref || em;
    lado = cliente === em ? 'emisor' : 'receptor';
  } else if (esEstudio && re) {
    cliente = re; lado = 'estudio';
  } else if (em) {
    cliente = em; lado = 'emisor';
  } else if (re) {
    cliente = re; lado = 'receptor';
  } else {
    cliente = clientes.find((c) => c.ruc === preferido) || null;
    lado = 'receptor';
    avisos.push(cliente
      ? 'Ni el emisor ni el receptor están en la cartera: se asignó al cliente elegido como compra. Revisalo.'
      : 'Ni el emisor ni el receptor están en la cartera: elegí el cliente.');
  }
  const otro = lado === 'emisor' ? { ruc: doc.receptor_ruc, nombre: doc.receptor_nombre } : { ruc: doc.emisor_ruc, nombre: doc.emisor_nombre };
  const moneda = doc.moneda === 'USD' ? 'USD' : 'PYG';
  if (doc.moneda === 'otra') avisos.push('Está en otra moneda: revisá los montos.');
  if (moneda === 'USD' && !(doc.cambio > 0)) avisos.push('Está en dólares y falta el tipo de cambio.');

  let c;
  if (doc.clase === 'recibo') {
    c = normalizar({
      tipo: 'recibo',
      emisor: lado === 'estudio' ? 'estudio' : lado === 'emisor' ? 'cliente' : 'tercero',
      fecha: doc.fecha,
      numero: doc.numero,
      moneda,
      cambio: doc.cambio,
      ruc: conDv(otro.ruc),
      nombre: otro.nombre,
      monto: doc.monto || doc.total,
      concepto: doc.concepto,
      facturas: doc.facturas,
      formaPago: /transf/i.test(doc.forma_pago) ? 'transferencia' : /cheq/i.test(doc.forma_pago) ? 'cheque' : /tarj/i.test(doc.forma_pago) ? 'tarjeta' : doc.forma_pago ? 'efectivo' : 'efectivo',
      detallePago: /efectivo|transf|cheq|tarj/i.test(doc.forma_pago || '') ? '' : doc.forma_pago,
      nota: doc.observaciones,
    });
  } else {
    const notas = [];
    if (!['factura', 'nota_credito'].includes(doc.clase)) notas.push(doc.clase.replace('_', ' '));
    if (doc.cdc) notas.push('CDC ' + doc.cdc);
    let { gravado10: g10, gravado5: g5, exento: ex } = doc;
    if (!g10 && !g5 && !ex && doc.total) { ex = doc.total; avisos.push('No se distinguió la tasa: se cargó todo como exento.'); }
    c = normalizar({
      op: lado === 'emisor' ? 'venta' : 'compra',
      tipo: doc.clase === 'nota_credito' ? 'nc' : 'factura',
      fecha: doc.fecha,
      numero: doc.numero,
      timbrado: doc.timbrado,
      condicion: doc.condicion === 'credito' ? 'credito' : 'contado',
      moneda,
      cambio: doc.cambio,
      ruc: conDv(otro.ruc),
      nombre: otro.nombre,
      g10, g5, ex,
      imputa: { iva: true, ire: false, irp: false },
      asociado: doc.comprobante_asociado,
      nota: notas.join(' · '),
    });
    // El IVA calculado con los montos debe coincidir con el del documento.
    const ivaDoc = (Number(doc.iva10) || 0) + (Number(doc.iva5) || 0);
    const ivaApp = moneda === 'USD' ? null : calcular(c).iva;
    if (ivaDoc && ivaApp !== null && Math.abs(ivaApp - ivaDoc) > 2) avisos.push(`El IVA del documento (${ivaDoc.toLocaleString('es-PY')}) no coincide con el calculado (${ivaApp.toLocaleString('es-PY')}).`);
    const totalApp = moneda === 'USD' ? null : calcular(c).total;
    if (doc.total && totalApp !== null && Math.abs(totalApp - doc.total) > 2) avisos.push(`El total del documento (${Number(doc.total).toLocaleString('es-PY')}) no coincide con la suma de montos.`);
  }
  if (doc.confianza === 'baja') avisos.unshift('Lectura dudosa: revisá todos los datos.');
  else if (doc.confianza === 'media') avisos.unshift('Algún dato puede estar mal leído.');
  if (doc.observaciones) avisos.push(doc.observaciones);
  return { comprobante: c, ruc: cliente ? cliente.ruc : '', avisos };
}

// Comprobantes ya leídos en la app (Marangatu): sólo falta el cliente.
export function localAComprobantes(local, { clientes, preferido = '' }) {
  const informante = local.informante && local.informante.ruc ? clientes.find((c) => c.ruc === local.informante.ruc) : null;
  const ruc = informante ? informante.ruc : preferido;
  return local.comprobantes.map((x) => {
    const { _iva, _total, _tipoOriginal, ...resto } = x; // eslint-disable-line no-unused-vars
    const avisos = [];
    if (!informante) avisos.push(`El RUC del archivo (${local.informante && local.informante.ruc}) no está en la cartera${ruc ? ': se asignó al cliente elegido' : ''}.`);
    return { comprobante: normalizar(resto), ruc, avisos };
  });
}

// Revisión final de un ítem (para marcar en amarillo antes de guardar).
export function problemas(item, lista) {
  const r = revisar(item.comprobante, lista);
  // Acá `lista` son los demás documentos subidos, no el registro.
  const errores = r.errores.map((t) => (/ya está cargado|Ya hay un recibo/.test(t) ? 'Está repetido entre los documentos que subiste: quitá uno o corregí el número.' : t));
  return { errores: [...(item.ruc ? [] : ['Falta el cliente.']), ...errores], avisos: [...item.avisos, ...r.avisos] };
}
