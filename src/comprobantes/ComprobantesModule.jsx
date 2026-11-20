import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Copy, Download, FilePlus2, FileText, Pencil, Printer, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useClientsData, useClientsMeta } from '../context/ClientsContext';
import { ClienteSelect } from '../comun/ClienteSelect';
import { clientesDeFilas, sinAcentos } from '../comun/clientes';
import { MESES, firma, gs, periodoFiscalDeHoja } from '../iva/ivaCore.js';
import { getIvaConfig } from '../iva/ivaConfigCache';
import FormComprobante from './FormComprobante';
import LeerDocumentos from './LeerDocumentos';
import AvisoCambioIva from '../iva/AvisoCambioIva';
import { EMISORES, FORMAS_PAGO, IMPUESTOS, TIPOS, calcular, comprobanteVacio, esRecibo, normalizar, periodoDe, reciboEmitido, totales } from './comprobantesCore.js';
import { descargarReciboPdf } from './reciboPdf';
import '../libros/libros.css';
import './comprobantes.css';

// Registro de comprobantes por cliente y mes. Lo imputado a IVA se pasa al
// Formulario 120 desde Vencimientos IVA (botón «Traer del registro»).

const mesNombre = (m) => (MESES[m - 1] ? MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1) : '');
const perTexto = (p) => {
  const [a, m] = String(p || '').split('-').map(Number);
  return a && m ? `${mesNombre(m)} ${a}` : p;
};
const fechaCorta = (f) => (f ? f.split('-').reverse().join('/') : '');
const hoyIso = () => new Date().toISOString().slice(0, 10);
const CONTRAPARTES_KEY = 'ctc:contrapartes:v1:';

function leerContrapartes(ruc) {
  try { return JSON.parse(localStorage.getItem(CONTRAPARTES_KEY + ruc) || '[]'); } catch { return []; }
}
function recordarContraparte(ruc, c) {
  if (!c.ruc || !c.nombre) return;
  try {
    const lista = leerContrapartes(ruc).filter((x) => x.ruc !== c.ruc);
    lista.unshift({ ruc: c.ruc, nombre: c.nombre });
    localStorage.setItem(CONTRAPARTES_KEY + ruc, JSON.stringify(lista.slice(0, 400)));
  } catch { /* opcional */ }
}

const EMISOR_KEY = 'ctc:emisor-recibo:v1:';
function leerEmisor(ruc) {
  try { return JSON.parse(localStorage.getItem(EMISOR_KEY + ruc) || '{}') || {}; } catch { return {}; }
}
function recordarEmisor(ruc, datos) {
  try { localStorage.setItem(EMISOR_KEY + ruc, JSON.stringify({ direccion: datos.direccion || '', telefono: datos.telefono || '', ciudad: datos.ciudad || '' })); } catch { /* opcional */ }
}

export default function ComprobantesModule({ withDesktopSidebar = false }) {
  const { year, month, headers, nameKey, rucKey } = useClientsMeta();
  const { assignedRows } = useClientsData();

  const [indice, setIndice] = useState({ cargado: false, error: '', registros: [] });
  const [ruc, setRuc] = useState('');
  const [periodo, setPeriodo] = useState(() => periodoFiscalDeHoja(year, month) || hoyIso().slice(0, 7));
  const [reg, setReg] = useState({ clave: '', lista: [], error: '' });
  const [filtro, setFiltro] = useState('todos');
  const [buscar, setBuscar] = useState('');
  const [form, setForm] = useState(null); // { key, inicial, periodoAnterior }
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [borrar, setBorrar] = useState(null);
  const [importando, setImportando] = useState(false);
  const [avisoIva, setAvisoIva] = useState(null); // [{ cliente, periodo }]
  const [aviso, setAviso] = useState('');
  const [contrapartesVer, setContrapartesVer] = useState(0);
  const avisoTimer = useRef(null);
  const avisoPendiente = useRef('');
  const formSeq = useRef(0); // key de cada formulario nuevo (se monta de cero)
  const [config, setConfig] = useState(null);
  useEffect(() => { let v = true; getIvaConfig().then((c) => { if (v) setConfig(c); }); return () => { v = false; }; }, []);
  const estudio = useMemo(() => (config ? { nombre: firma(config), ...(config.estudio || {}) } : { nombre: firma(null) }), [config]);

  const mostrarAviso = useCallback((t) => {
    setAviso(t);
    clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(''), 3200);
  }, []);
  useEffect(() => () => clearTimeout(avisoTimer.current), []);

  const cargarIndice = useCallback(() => api.comprobantes.listar()
    .then((registros) => setIndice({ cargado: true, error: '', registros }))
    .catch((e) => setIndice((s) => ({
      ...s,
      cargado: true,
      error: e.code === 'UNKNOWN_ACTION'
        ? 'El backend todavía no tiene el registro de comprobantes: pegá AppsScript-Comprobantes.gs y el AppsScript-Avisos.gs nuevo y publicá una nueva versión.'
        : e.message || 'No se pudo cargar el registro.',
    }))), []);
  useEffect(() => { cargarIndice(); }, [cargarIndice]);

  const clientes = useMemo(() => {
    const m = clientesDeFilas(assignedRows, headers, nameKey, rucKey);
    indice.registros.forEach((r) => {
      if (!m.has(r.ruc)) m.set(r.ruc, { ruc: r.ruc, dv: '', nombre: r.cliente || `RUC ${r.ruc}` });
    });
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [assignedRows, headers, nameKey, rucKey, indice.registros]);
  const cliente = clientes.find((c) => c.ruc === ruc) || null;

  const clave = ruc && periodo ? `${ruc}|${periodo}` : '';
  const cargarMes = useCallback((r, p) => {
    if (!r || !p) return Promise.resolve();
    const k = `${r}|${p}`;
    return api.comprobantes.leer(r, p)
      .then((x) => setReg({ clave: k, lista: (x && x.comprobantes) || [], error: '' }))
      .catch((e) => setReg({ clave: k, lista: [], error: e.message || 'No se pudo abrir el mes.' }));
  }, []);
  useEffect(() => { cargarMes(ruc, periodo); }, [ruc, periodo, cargarMes]);
  const cargando = !!clave && reg.clave !== clave;
  const lista = useMemo(() => (cargando ? [] : reg.lista), [cargando, reg.lista]);

  const contrapartes = useMemo(() => {
    const vistas = new Map();
    lista.forEach((c) => { if (c.ruc && c.nombre && !vistas.has(c.ruc)) vistas.set(c.ruc, { ruc: c.ruc, nombre: c.nombre }); });
    if (ruc) leerContrapartes(ruc).forEach((x) => { if (!vistas.has(x.ruc)) vistas.set(x.ruc, x); });
    return [...vistas.values()];
    // contrapartesVer: refresca después de guardar (localStorage).
  }, [lista, ruc, contrapartesVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useMemo(() => totales(lista), [lista]);
  const q = sinAcentos(buscar.trim());
  const visibles = useMemo(() => lista
    .filter((c) => filtro === 'todos' || (filtro === 'recibo' ? esRecibo(c) : !esRecibo(c) && c.op === filtro))
    .filter((c) => !q || sinAcentos(c.nombre).includes(q) || String(c.ruc).toLowerCase().includes(q) || String(c.numero).includes(q) || String(c.timbrado).includes(q))
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.numero || '').localeCompare(b.numero || '')),
  [lista, filtro, q]);

  const [anio, mes] = periodo.split('-').map(Number);
  const anios = useMemo(() => {
    const s = new Set([Number(year) || new Date().getFullYear(), anio, new Date().getFullYear()]);
    indice.registros.filter((r) => r.ruc === ruc).forEach((r) => s.add(Number(r.periodo.slice(0, 4))));
    return [...s].filter(Boolean).sort((a, b) => b - a);
  }, [indice.registros, ruc, year, anio]);
  const mesesConDatos = useMemo(() => new Map(indice.registros.filter((r) => r.ruc === ruc).map((r) => [r.periodo, r.cantidad])), [indice.registros, ruc]);

  const conRegistro = useMemo(() => {
    const m = new Map();
    indice.registros.forEach((r) => {
      const x = m.get(r.ruc) || { ruc: r.ruc, nombre: r.cliente, cantidad: 0, ultimo: '' };
      x.cantidad += r.cantidad;
      if (r.periodo > x.ultimo) x.ultimo = r.periodo;
      m.set(r.ruc, x);
    });
    return [...m.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [indice.registros]);

  const abrirNuevo = (base = {}) => {
    const dentro = (f) => f && periodoDe(f) === periodo;
    const fecha = dentro(base.fecha) ? base.fecha : dentro(hoyIso()) ? hoyIso() : `${periodo}-01`;
    setErrorForm('');
    setForm({ key: `n${++formSeq.current}`, inicial: { ...comprobanteVacio({ ...base, fecha }), emisorDatos: leerEmisor(ruc) }, periodoAnterior: '' });
  };
  const abrirEditar = (c) => {
    setErrorForm('');
    setForm({ key: c.id, inicial: { ...comprobanteVacio(), emisorDatos: leerEmisor(ruc), ...c, cambio: c.cambio || '', g10: c.g10 || '', g5: c.g5 || '', ex: c.ex || '', monto: c.monto || '' }, periodoAnterior: periodoDe(c.fecha) });
  };
  const duplicar = (c) => {
    setErrorForm('');
    setForm({ key: `n${++formSeq.current}`, inicial: { ...comprobanteVacio(), emisorDatos: leerEmisor(ruc), ...c, id: '', numero: '', g10: c.g10 || '', g5: c.g5 || '', ex: c.ex || '', monto: c.monto || '' }, periodoAnterior: '' });
  };

  // Datos de quien emite el recibo, tal como se imprimen.
  const datosEmisor = (c) => {
    if (c.emisor === 'estudio') return { nombre: estudio.nombre, ruc: estudio.ruc || '', direccion: estudio.direccion || '', telefono: estudio.telefono || '', ciudad: estudio.ciudad || '' };
    const d = c.emisorDatos || {};
    return { ...d, nombre: cliente ? cliente.nombre : d.nombre || '', ruc: cliente ? cliente.ruc + (cliente.dv ? '-' + cliente.dv : '') : d.ruc || '' };
  };
  const imprimir = async (c) => {
    try {
      await descargarReciboPdf(c, c.emisorDatos && c.emisorDatos.nombre ? c.emisorDatos : datosEmisor(c));
    } catch (e) {
      mostrarAviso(e.message || 'No se pudo armar el PDF.');
    }
  };

  const guardar = async (c, otro, conPdf = false) => {
    setGuardando(true);
    setErrorForm('');
    try {
      if (esRecibo(c) && c.emisor === 'cliente') recordarEmisor(ruc, c.emisorDatos || {});
      const limpio = normalizar(esRecibo(c) && reciboEmitido(c) ? { ...c, emisorDatos: datosEmisor(c) } : c); // a los nuevos les pone un id
      const r = await api.comprobantes.guardar({ ruc, cliente: cliente ? cliente.nombre : '', comprobante: limpio, periodoAnterior: form.periodoAnterior });
      recordarContraparte(ruc, limpio);
      setContrapartesVer((v) => v + 1);
      const destino = r.periodo || periodoDe(limpio.fecha);
      if (destino === periodo) {
        setReg((s) => {
          const sin = s.lista.filter((x) => x.id !== r.comprobante.id);
          return { ...s, lista: [...sin, r.comprobante] };
        });
      } else {
        setReg((s) => ({ ...s, lista: s.lista.filter((x) => x.id !== r.comprobante.id) }));
      }
      cargarIndice();
      const que = esRecibo(c) ? `Recibo${r.comprobante.numero ? ' N° ' + r.comprobante.numero : ''}` : 'Comprobante';
      mostrarAviso(destino === periodo ? `${que} ${c.id ? 'actualizado' : 'guardado'}` : `Guardado en ${perTexto(destino)}`);
      if (conPdf) imprimir(r.comprobante);
      if (otro) {
        setForm({
          key: `n${++formSeq.current}`,
          inicial: { ...comprobanteVacio({ op: c.op, tipo: c.tipo, emisor: c.emisor, formaPago: c.formaPago, fecha: c.fecha, condicion: c.condicion, moneda: c.moneda, cambio: c.cambio, imputa: c.imputa }), emisorDatos: c.emisorDatos },
          periodoAnterior: '',
        });
      } else {
        setForm(null);
      }
    } catch (e) {
      setErrorForm(e.code === 'COMPROBANTE_DUPLICADO'
        ? (esRecibo(c) ? 'Ya hay un recibo con ese número en ese mes.' : 'Ese comprobante (mismo número, timbrado y RUC) ya está cargado en ese mes.')
        : e.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (c) => {
    setBorrar({ id: c.id, estado: 'borrando' });
    try {
      await api.comprobantes.eliminar(ruc, periodoDe(c.fecha) || periodo, c.id);
      setReg((s) => ({ ...s, lista: s.lista.filter((x) => x.id !== c.id) }));
      cargarIndice();
      mostrarAviso('Comprobante eliminado');
      setBorrar(null);
    } catch (e) {
      setBorrar(null);
      mostrarAviso(e.message || 'No se pudo eliminar.');
    }
  };

  const descargar = async () => {
    const XLSX = await import('xlsx');
    const cab = ['Operación', 'Tipo', 'Fecha', 'Número', 'Timbrado', 'Condición', 'RUC', 'Nombre', 'Moneda', 'Cambio',
      'Gravado 10%', 'IVA 10%', 'Gravado 5%', 'IVA 5%', 'Exento', 'Total Gs.', 'Imputa IVA', 'Imputa IRE', 'Imputa IRP', 'Comprobante asociado', 'Concepto / nota', 'Forma de pago'];
    const filas = visibles.map((c) => {
      const k = calcular(c);
      const s = c.tipo === 'nc' ? -1 : 1;
      if (esRecibo(c)) {
        return [EMISORES[c.emisor] || 'Recibo', TIPOS.recibo, fechaCorta(c.fecha), c.numero, '', '', c.ruc, c.nombre, c.moneda, c.moneda === 'USD' ? c.cambio : '',
          '', '', '', '', '', k.total, '', '', '', c.facturas || '', [c.concepto, c.nota].filter(Boolean).join(' · '), [FORMAS_PAGO[c.formaPago], c.detallePago].filter(Boolean).join(' - ')];
      }
      return [c.op === 'compra' ? 'Compra' : 'Venta', TIPOS[c.tipo], fechaCorta(c.fecha), c.numero, c.timbrado, c.condicion === 'credito' ? 'Crédito' : 'Contado',
        c.ruc, c.nombre, c.moneda, c.moneda === 'USD' ? c.cambio : '', s * k.g10, s * k.iva10, s * k.g5, s * k.iva5, s * k.ex, s * k.total,
        c.imputa.iva ? 'S' : 'N', c.imputa.ire ? 'S' : 'N', c.imputa.irp ? 'S' : 'N', c.asociado || '', c.nota || '', ''];
    });
    const ws = XLSX.utils.aoa_to_sheet([[`Registro de comprobantes · ${cliente ? cliente.nombre : ruc} · ${perTexto(periodo)}`], [], cab, ...filas]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comprobantes');
    XLSX.writeFile(wb, `Comprobantes_${(cliente ? cliente.nombre : ruc).replace(/[^\w-]+/g, '_')}_${periodo}.xlsx`);
  };

  return (
    <main className={`real-exec-screen lb-screen cp-screen ${withDesktopSidebar ? 'has-desktop-sidebar' : ''}`}>
      <header className="lb-head">
        <div>
          <span className="lb-eyebrow"><FileText size={14} aria-hidden="true" /> Comprobantes</span>
          <h1>Registro de comprobantes</h1>
          <p>Facturas, notas de crédito y recibos de cada cliente, por mes. Lo imputado a IVA pasa al Formulario 120.</p>
        </div>
        <div className="cp-head-acciones">
          <button type="button" className="rx-btn rx-btn-outline cp-importar" onClick={() => setImportando(true)}>
            <Sparkles size={16} aria-hidden="true" /> Subir documentos
          </button>
          <button type="button" className="rx-btn rx-btn-primary cp-nuevo" onClick={() => abrirNuevo()} disabled={!cliente || cargando}>
            <FilePlus2 size={16} aria-hidden="true" /> Nuevo comprobante
          </button>
        </div>
      </header>

      {indice.error && <div className="lb-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {indice.error}</div>}

      <section className="lb-filtros">
        <div className="lb-campo lb-campo-ancho">
          <label htmlFor="cp-cliente">Cliente</label>
          <ClienteSelect id="cp-cliente" clientes={clientes} valor={ruc} onChange={setRuc} />
        </div>
        <div className="lb-campo">
          <label htmlFor="cp-mes">Mes</label>
          <select id="cp-mes" value={mes} onChange={(e) => setPeriodo(`${anio}-${String(e.target.value).padStart(2, '0')}`)}>
            {MESES.map((m, i) => {
              const p = `${anio}-${String(i + 1).padStart(2, '0')}`;
              const n = mesesConDatos.get(p);
              return <option key={m} value={i + 1}>{mesNombre(i + 1)}{n ? ` (${n})` : ''}</option>;
            })}
          </select>
        </div>
        <div className="lb-campo">
          <label htmlFor="cp-anio">Año</label>
          <select id="cp-anio" value={anio} onChange={(e) => setPeriodo(`${e.target.value}-${String(mes).padStart(2, '0')}`)}>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </section>

      {!cliente && indice.cargado && (
        conRegistro.length ? (
          <section className="lb-panel">
            <h2>Clientes con comprobantes cargados</h2>
            <ul className="lb-lista-clientes">
              {conRegistro.map((c) => (
                <li key={c.ruc}>
                  <button type="button" onClick={() => { setRuc(c.ruc); setPeriodo(c.ultimo); }}>
                    <strong>{c.nombre}</strong>
                    <small>RUC {c.ruc} · {c.cantidad} comprobantes · último: {perTexto(c.ultimo)}</small>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : !indice.error && (
          <section className="lb-panel lb-vacio">
            <FileText size={36} aria-hidden="true" />
            <h2>Elegí un cliente para empezar</h2>
            <p>Cargá sus facturas y notas de crédito del mes con <b>Nuevo comprobante</b>.</p>
          </section>
        )
      )}
      {!indice.cargado && <div className="lb-cargando"><RefreshCw size={16} className="animate-spin" aria-hidden="true" /> Cargando…</div>}

      {cliente && (
        <>
          {reg.error && !cargando && <div className="lb-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {reg.error}</div>}
          {cargando && <div className="lb-cargando"><RefreshCw size={16} className="animate-spin" aria-hidden="true" /> Abriendo {perTexto(periodo)}…</div>}

          {!cargando && (
            <>
              <div className="lb-resumen cp-resumen">
                <div className="lb-tarjeta"><span>Ventas ({t.venta.cantidad})</span><strong>Gs. {gs(t.venta.total)}</strong><small>IVA {gs(t.venta.iva)}</small></div>
                <div className="lb-tarjeta"><span>Compras ({t.compra.cantidad})</span><strong>Gs. {gs(t.compra.total)}</strong><small>IVA {gs(t.compra.iva)}</small></div>
                {(t.recibos.emitidos.cantidad > 0 || t.recibos.recibidos.cantidad > 0) && (
                  <div className="lb-tarjeta">
                    <span>Recibos ({t.recibos.emitidos.cantidad + t.recibos.recibidos.cantidad})</span>
                    <strong>Gs. {gs(t.recibos.emitidos.total)}</strong>
                    <small>emitidos{t.recibos.recibidos.cantidad ? ` · recibidos Gs. ${gs(t.recibos.recibidos.total)}` : ''}</small>
                  </div>
                )}
                <div className={`lb-tarjeta is-total ${t.saldoIva < 0 ? 'is-favor' : ''}`}>
                  <span>IVA del mes (imputado)</span>
                  <strong>{t.saldoIva >= 0 ? 'A pagar' : 'A favor'} Gs. {gs(Math.abs(t.saldoIva))}</strong>
                  <small>Sin saldos de meses anteriores ni retenciones</small>
                </div>
              </div>

              <div className="lb-barra">
                <div className="lb-tipos" role="tablist" aria-label="Operación">
                  {[['todos', 'Todos'], ['venta', 'Ventas'], ['compra', 'Compras'], ['recibo', 'Recibos']].map(([v, l]) => (
                    <button key={v} type="button" role="tab" aria-selected={filtro === v} className={filtro === v ? 'is-active' : ''} onClick={() => setFiltro(v)}>{l}</button>
                  ))}
                </div>
                <div className="lb-buscar">
                  <Search size={15} aria-hidden="true" />
                  <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre, RUC, número o timbrado…" aria-label="Buscar comprobantes" />
                </div>
                <button type="button" className="rx-btn rx-btn-outline" onClick={descargar} disabled={!visibles.length}><Download size={15} aria-hidden="true" /> Excel</button>
              </div>

              {lista.length === 0 ? (
                <section className="lb-panel lb-vacio">
                  <FileText size={32} aria-hidden="true" />
                  <h2>Sin comprobantes en {perTexto(periodo)}</h2>
                  <p>Tocá <b>Nuevo comprobante</b> para cargar el primero.</p>
                </section>
              ) : (
                <div className="lb-tabla-wrap cp-tabla-wrap">
                  <table className="lb-tabla cp-tabla">
                    <thead>
                      <tr>
                        <th>Fecha</th><th>Tipo</th><th>Número</th><th>Timbrado</th><th>Cliente / proveedor</th>
                        <th className="num">Grav. 10%</th><th className="num">Grav. 5%</th><th className="num">Exento</th><th className="num">Total</th>
                        <th>Imputa</th><th aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((c) => {
                        const k = calcular(c);
                        const s = c.tipo === 'nc' ? -1 : 1;
                        return (
                          <tr key={c.id} className={c.tipo === 'nc' ? 'is-nc' : ''}>
                            <td data-l="Fecha">{fechaCorta(c.fecha)}</td>
                            <td data-l="Tipo">
                              {esRecibo(c)
                                ? <><span className="cp-op cp-op-recibo">{c.emisor === 'estudio' ? 'Honorarios' : c.emisor === 'tercero' ? 'Recibido' : 'Emitido'}</span> Recibo</>
                                : <><span className={`cp-op cp-op-${c.op}`}>{c.op === 'compra' ? 'Compra' : 'Venta'}</span> {c.tipo === 'nc' ? 'NC' : 'Factura'}</>}
                            </td>
                            <td data-l="Número" className="cp-mono">{c.numero}</td>
                            <td data-l={esRecibo(c) ? 'Pago' : 'Timbrado'} className="cp-mono">{esRecibo(c) ? FORMAS_PAGO[c.formaPago] || '' : c.timbrado || '—'}</td>
                            <td data-l="Cliente / proveedor" className="nombre cp-quien">
                              <span>{c.nombre}</span>
                              {esRecibo(c) && c.concepto && <small>{c.concepto}</small>}
                              <small>{c.ruc}{c.moneda === 'USD' ? ` · USD a ${gs(c.cambio)}` : ''}</small>
                            </td>
                            <td data-l="Gravado 10%" className={`num ${k.g10 ? '' : 'cp-vacio'}`}>{k.g10 ? gs(s * k.g10) : ''}</td>
                            <td data-l="Gravado 5%" className={`num ${k.g5 ? '' : 'cp-vacio'}`}>{k.g5 ? gs(s * k.g5) : ''}</td>
                            <td data-l="Exento" className={`num ${k.ex ? '' : 'cp-vacio'}`}>{k.ex ? gs(s * k.ex) : ''}</td>
                            <td data-l="Total" className="num cp-total-td">{gs(s * k.total)}</td>
                            <td data-l="Imputa" className={esRecibo(c) ? 'cp-vacio' : ''}>
                              {Object.keys(IMPUESTOS).filter((x) => c.imputa && c.imputa[x]).map((x) => <span key={x} className="cp-tag">{IMPUESTOS[x]}</span>)}
                              {!esRecibo(c) && !(c.imputa && (c.imputa.iva || c.imputa.ire || c.imputa.irp)) && <span className="cp-tag is-no">No imputa</span>}
                            </td>
                            <td className="cp-acciones">
                              {borrar && borrar.id === c.id ? (
                                <span className="lb-confirmar">
                                  ¿Eliminar?
                                  <button type="button" className="rx-btn rx-btn-outline lb-peligro" onClick={() => eliminar(c)} disabled={borrar.estado === 'borrando'}>{borrar.estado === 'borrando' ? '…' : 'Sí'}</button>
                                  <button type="button" className="rx-btn rx-btn-outline" onClick={() => setBorrar(null)} disabled={borrar.estado === 'borrando'}>No</button>
                                </span>
                              ) : (
                                <>
                                  {reciboEmitido(c) && (
                                    <button type="button" className="lb-icono" onClick={() => imprimir(c)} aria-label={`PDF del recibo ${c.numero}`} title="Descargar el recibo en PDF"><Printer size={15} /></button>
                                  )}
                                  <button type="button" className="lb-icono" onClick={() => abrirEditar(c)} aria-label={`Editar ${c.numero}`} title="Editar"><Pencil size={15} /></button>
                                  <button type="button" className="lb-icono" onClick={() => duplicar(c)} aria-label={`Duplicar ${c.numero}`} title="Cargar otro igual"><Copy size={15} /></button>
                                  <button type="button" className="lb-icono lb-btn-borrar" onClick={() => setBorrar({ id: c.id, estado: 'confirmar' })} aria-label={`Eliminar ${c.numero}`} title="Eliminar"><Trash2 size={15} /></button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {visibles.length === 0 && (
                        <tr><td colSpan={11} className="lb-vacio-td">Ningún comprobante coincide.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {form && (
        <FormComprobante
          key={form.key}
          inicial={form.inicial}
          periodoActual={periodo}
          lista={lista}
          contrapartes={contrapartes}
          cliente={cliente}
          estudio={estudio}
          guardando={guardando}
          error={errorForm}
          onGuardar={guardar}
          onCerrar={() => setForm(null)}
        />
      )}
      {importando && (
        <LeerDocumentos
          clientes={clientes}
          preferido={ruc}
          estudio={estudio}
          onCerrar={() => setImportando(false)}
          onGuardado={({ afectados, agregados, repetidos, rucs }) => {
            setImportando(false);
            cargarIndice();
            if (ruc && rucs.includes(ruc)) cargarMes(ruc, periodo);
            else if (!ruc && rucs.length === 1) setRuc(rucs[0]);
            const msg = `Guardados ${agregados}${repetidos ? ` · ${repetidos} ya estaban` : ''}`;
            // Con aviso de IVA, el mensaje sale al cerrarlo (si no, lo tapa).
            if (afectados.length) { avisoPendiente.current = msg; setAvisoIva(afectados); } else mostrarAviso(msg);
          }}
        />
      )}
      {avisoIva && (
        <AvisoCambioIva
          pendientes={avisoIva}
          onCerrar={() => {
            setAvisoIva(null);
            if (avisoPendiente.current) { mostrarAviso(avisoPendiente.current); avisoPendiente.current = ''; }
          }}
        />
      )}
      {aviso && <div className="lb-toast" role="status">{aviso}</div>}
    </main>
  );
}
