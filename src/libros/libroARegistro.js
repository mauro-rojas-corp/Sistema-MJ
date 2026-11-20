// Pasa un libro de compras o ventas (SIGA o Marangatu) al registro de
// comprobantes, para que el IVA del mes se pueda armar con él.

import { dvRuc, normalizar } from '../comprobantes/comprobantesCore.js';

const num = (v) => Number(v) || 0;
const pad = (n) => String(n).padStart(2, '0');
const conDv = (r) => {
  const s = String(r || '').trim().toUpperCase();
  return /^\d{5,9}$/.test(s) ? `${s}-${dvRuc(s)}` : s;
};

// «02», «2/10/2026», «2026-10-02» o número de serie de Excel → AAAA-MM-DD.
function fecha(dia, anio, mes) {
  if (typeof dia === 'number' && dia > 20000) return new Date(Math.round((dia - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(dia ?? '').trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})$/);
  return m && anio && mes ? `${anio}-${pad(mes)}-${pad(m[1])}` : '';
}

// Gravado con IVA incluido: el libro puede traer la base (sin IVA) o el
// monto con IVA; se decide por la proporción entre gravado e IVA.
function conIva(grav, iva, tasa) {
  const g = Math.abs(num(grav));
  const i = Math.abs(num(iva));
  if (!g) return 0;
  if (!i) return g;
  const r = g / i;
  const base = tasa === 10 ? 10 : 20;
  return Math.abs(r - base) < Math.abs(r - (base + 1)) ? g + i : g;
}

export function libroAComprobantes(libro, tipo, anio, mes) {
  const op = tipo === 'compras' ? 'compra' : 'venta';
  if (libro.registro) {
    const periodo = `${anio}-${pad(mes)}`;
    return libro.registro.comprobantes
      .filter((c) => c.op === op && c.fecha.slice(0, 7) === periodo)
      .map(({ _iva, _total, _tipoOriginal, ...c }) => normalizar(c)); // eslint-disable-line no-unused-vars
  }
  return (libro.comprobantes || []).map((f) => {
    const nc = /CRED/i.test(String(f.tipoComprobante || '')) || num(f.total) < 0;
    const notas = [];
    if (num(f.noImputa10) || num(f.noImputa5)) notas.push(`No imputa: ${Math.abs(num(f.noImputa10)) + Math.abs(num(f.noImputa5))}`);
    if (f.tipoComprobante && !/^(FACTURA|NOTA DE CR)/i.test(String(f.tipoComprobante))) notas.push(String(f.tipoComprobante));
    return normalizar({
      op,
      tipo: nc ? 'nc' : 'factura',
      fecha: fecha(f.dia, anio, mes),
      numero: f.documento || f.comprobDel || '',
      timbrado: f.timbrado,
      ruc: conDv(f.ruc),
      nombre: f.razonSocial,
      g10: conIva(f.grav10, f.iva10, 10),
      g5: conIva(f.grav5, f.iva5, 5),
      ex: Math.abs(num(f.exentas)),
      imputa: { iva: true, ire: false, irp: false },
      nota: notas.join(' · '),
    });
  }).filter((c) => c.fecha && (c.g10 || c.g5 || c.ex));
}
