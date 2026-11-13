import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { api } from '../api';
import { useClientsData, useClientsMeta } from '../context/ClientsContext';
import { MESES, gs, splitRuc } from '../iva/ivaCore.js';
import { compactHeader } from '../utils';
import { COLUMNAS, datosAComprobantes, leerArchivoLibro, libroADatos, sugerirCliente } from './leerLibroSiga.js';
import './libros.css';

// Libros IVA: compras y ventas exportados de SIGA, uno por cliente + mes.
// Todos ven e importan; sólo ADMINISTRADOR y SUPERUSUARIO eliminan.

const TIPOS = { compras: 'Compras', ventas: 'Ventas' };
const mesNombre = (m) => (MESES[m - 1] ? MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1) : '');
const per = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}`;
const perTexto = (p) => {
  const [a, m] = String(p || '').split('-').map(Number);
  return a && m ? `${mesNombre(m)} ${a}` : p;
};
const fechaHora = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Importes a mostrar en el resumen (los que tenga el libro).
const RESUMEN = ['grav10', 'iva10', 'grav5', 'iva5', 'exentas', 'total'];

function findDvColumn(headers) {
  return headers.find((h) => ['dv', 'digitoverificador', 'digito'].includes(compactHeader(h))) || null;
}

// ── Selector de cliente con búsqueda ─────────────────────────────────────
function ClienteSelect({ clientes, valor, onChange, id, placeholder = 'Buscar cliente por nombre o RUC…' }) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  const elegido = clientes.find((c) => c.ruc === valor) || null;
  const q = sinAcentos(texto.trim());
  const lista = useMemo(
    () => clientes.filter((c) => !q || sinAcentos(c.nombre).includes(q) || c.ruc.includes(q.replace(/\D/g, '') || '¬')).slice(0, 60),
    [clientes, q]
  );
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);
  return (
    <div className="lb-cliente" ref={caja}>
      <div className="lb-cliente-input">
        <Search size={15} aria-hidden="true" />
        <input
          id={id}
          value={abierto ? texto : elegido ? `${elegido.nombre} · ${elegido.ruc}` : texto}
          placeholder={placeholder}
          onFocus={() => { setAbierto(true); setTexto(''); }}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && lista[0]) { onChange(lista[0].ruc); setAbierto(false); e.currentTarget.blur(); }
            if (e.key === 'Escape') { setAbierto(false); e.currentTarget.blur(); }
          }}
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
          autoComplete="off"
        />
        {elegido && !abierto && (
          <button type="button" className="lb-cliente-quitar" onClick={() => onChange('')} aria-label="Quitar cliente">
            <X size={14} />
          </button>
        )}
      </div>
      {abierto && (
        <ul className="lb-cliente-lista" role="listbox">
          {lista.length === 0 && <li className="lb-vacio-li">Sin coincidencias</li>}
          {lista.map((c) => (
            <li key={c.ruc}>
              <button
                type="button"
                role="option"
                aria-selected={c.ruc === valor}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(c.ruc); setAbierto(false); setTexto(''); }}
              >
                <strong>{c.nombre}</strong>
                <small>RUC {c.ruc}{c.libros ? ` · ${c.libros} ${c.libros === 1 ? 'libro' : 'libros'}` : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Importar ──────────────────────────────────────────────────────────────
function Importador({ clientes, preset, onCerrar, onGuardado }) {
  const [paso, setPaso] = useState({ estado: 'elegir', error: '' });
  const [libro, setLibro] = useState(null);
  const [archivo, setArchivo] = useState('');
  const [ruc, setRuc] = useState(preset?.ruc || '');
  const [mes, setMes] = useState(preset?.mes || new Date().getMonth() + 1);
  const [anio, setAnio] = useState(preset?.anio || new Date().getFullYear());
  const [tipo, setTipo] = useState(preset?.tipo || '');
  const [existente, setExistente] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef(null);

  const leer = async (file) => {
    if (!file) return;
    setPaso({ estado: 'leyendo', error: '' });
    setExistente(null);
    try {
      const l = await leerArchivoLibro(file);
      setLibro(l);
      setArchivo(file.name);
      if (l.mes) setMes(l.mes);
      if (l.anio) setAnio(l.anio);
      if (l.tipo) setTipo(l.tipo);
      if (!preset?.ruc) {
        const s = sugerirCliente(l.razonSocial, clientes);
        setRuc(s ? s.ruc : '');
      }
      setPaso({ estado: 'revisar', error: '' });
    } catch (e) {
      setLibro(null);
      setPaso({ estado: 'elegir', error: e.message || 'No se pudo leer el archivo.' });
    }
  };

  const cliente = clientes.find((c) => c.ruc === ruc) || null;
  const puede = libro && cliente && tipo && mes && anio && paso.estado !== 'guardando';

  const guardar = async (reemplazar = false) => {
    if (!puede) return;
    setPaso({ estado: 'guardando', error: '' });
    try {
      const r = await api.libros.guardar({
        tipo, ruc, cliente: cliente.nombre, periodo: per(anio, mes), archivo,
        totales: libro.totales, datos: libroADatos(libro), reemplazar,
      });
      onGuardado({ id: r.id, ruc, periodo: per(anio, mes), tipo, reemplazado: r.reemplazado });
    } catch (e) {
      if (e.code === 'LIBRO_EXISTE' && e.details && e.details.existente) {
        setExistente(e.details.existente);
        setPaso({ estado: 'revisar', error: '' });
      } else {
        setPaso({ estado: 'revisar', error: e.message || 'No se pudo guardar.' });
      }
    }
  };

  const muestra = libro ? libro.comprobantes.slice(0, 5) : [];
  return (
    <div className="lb-modal-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && paso.estado !== 'guardando') onCerrar(); }}>
      <div className="lb-modal" role="dialog" aria-modal="true" aria-labelledby="lb-imp-titulo">
        <div className="lb-modal-head">
          <h2 id="lb-imp-titulo"><Upload size={18} aria-hidden="true" /> Importar libro de SIGA</h2>
          <button type="button" className="lb-icono" onClick={onCerrar} aria-label="Cerrar" disabled={paso.estado === 'guardando'}><X size={18} /></button>
        </div>

        <div className="lb-modal-body">
          {(paso.estado === 'elegir' || paso.estado === 'leyendo') && (
            <>
              <label
                className={`lb-drop ${arrastrando ? 'is-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => { e.preventDefault(); setArrastrando(false); leer(e.dataTransfer.files && e.dataTransfer.files[0]); }}
              >
                <FileSpreadsheet size={34} aria-hidden="true" />
                <strong>{paso.estado === 'leyendo' ? 'Leyendo el archivo…' : 'Elegí o arrastrá el libro exportado'}</strong>
                <span>Libro IVA Compra o Venta de SIGA, en Excel (.xlsx, .xls) o CSV.</span>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={(e) => leer(e.target.files && e.target.files[0])}
                  disabled={paso.estado === 'leyendo'}
                />
              </label>
              <p className="lb-ayuda">En SIGA: <b>Libro Iva Compra/Venta</b> → elegí el mes → marcá <b>Exportar Consulta</b> → <b>Confirmar</b>.</p>
            </>
          )}

          {paso.error && (
            <div className="lb-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {paso.error}</div>
          )}

          {libro && paso.estado !== 'elegir' && paso.estado !== 'leyendo' && (
            <>
              <div className="lb-archivo">
                <FileSpreadsheet size={18} aria-hidden="true" />
                <span><strong>{archivo}</strong><small>{libro.comprobantes.length} comprobantes{libro.anulados ? ` (${libro.anulados} anulados)` : ''} · en el archivo: {libro.razonSocial || 'sin nombre'}{libro.mes ? ` · ${mesNombre(libro.mes)} ${libro.anio || ''}` : ''}</small></span>
                <button type="button" className="lb-link" onClick={() => { setLibro(null); setPaso({ estado: 'elegir', error: '' }); setExistente(null); }}>Cambiar archivo</button>
              </div>

              {libro.coinciden === true && (
                <div className="lb-ok"><CheckCircle2 size={16} aria-hidden="true" /> Los totales leídos coinciden con la fila TOTAL del archivo (Gs. {gs(libro.totales.total)}).</div>
              )}
              {libro.coinciden === false && (
                <div className="lb-error"><AlertTriangle size={16} aria-hidden="true" /> Los totales leídos no coinciden con los del archivo en: {libro.diferencias.map((k) => COLUMNAS[k].titulo).join(', ')}. Revisá el archivo antes de importarlo.</div>
              )}
              {libro.coinciden === null && (
                <div className="lb-aviso"><AlertTriangle size={16} aria-hidden="true" /> El archivo no trae la fila TOTAL: no se pudieron comparar los totales.</div>
              )}

              <div className="lb-form">
                <div className="lb-campo lb-campo-ancho">
                  <label htmlFor="lb-imp-cliente">Cliente</label>
                  <ClienteSelect id="lb-imp-cliente" clientes={clientes} valor={ruc} onChange={(v) => { setRuc(v); setExistente(null); }} />
                  {!ruc && <small className="lb-falta">Elegí a qué cliente corresponde.</small>}
                  {ruc && libro.razonSocial && cliente && sugerirCliente(libro.razonSocial, [cliente]) === null && (
                    <small className="lb-falta">Ojo: el archivo dice «{libro.razonSocial}».</small>
                  )}
                </div>
                <div className="lb-campo">
                  <label htmlFor="lb-imp-tipo">Libro</label>
                  <select id="lb-imp-tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setExistente(null); }}>
                    <option value="">Elegir…</option>
                    <option value="compras">Compras</option>
                    <option value="ventas">Ventas</option>
                  </select>
                </div>
                <div className="lb-campo">
                  <label htmlFor="lb-imp-mes">Mes</label>
                  <select id="lb-imp-mes" value={mes} onChange={(e) => { setMes(Number(e.target.value)); setExistente(null); }}>
                    {MESES.map((m, i) => <option key={m} value={i + 1}>{mesNombre(i + 1)}</option>)}
                  </select>
                </div>
                <div className="lb-campo">
                  <label htmlFor="lb-imp-anio">Año</label>
                  <input id="lb-imp-anio" type="number" min="2000" max="2100" value={anio} onChange={(e) => { setAnio(Number(e.target.value)); setExistente(null); }} />
                </div>
              </div>

              <div className="lb-tabla-wrap lb-muestra">
                <table className="lb-tabla">
                  <thead><tr>{libro.columnas.map((k) => <th key={k} className={COLUMNAS[k].importe ? 'num' : ''}>{COLUMNAS[k].titulo}</th>)}</tr></thead>
                  <tbody>
                    {muestra.map((c, i) => (
                      <tr key={i}>{libro.columnas.map((k) => <td key={k} className={COLUMNAS[k].importe ? 'num' : ''}>{COLUMNAS[k].importe ? gs(c[k]) : c[k]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {libro.comprobantes.length > 5 && <p className="lb-ayuda">… y {libro.comprobantes.length - 5} comprobantes más.</p>}

              {existente && (
                <div className="lb-aviso lb-existe" role="alert">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>
                    Ya hay un libro de <b>{TIPOS[existente.tipo]}</b> de <b>{perTexto(existente.periodo)}</b> para este cliente
                    ({existente.cantidad} comprobantes, importado por {existente.importadoPor} el {fechaHora(existente.importadoEl)}). ¿Reemplazarlo por este?
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="lb-modal-pie">
          <button type="button" className="rx-btn rx-btn-outline" onClick={onCerrar} disabled={paso.estado === 'guardando'}>Cancelar</button>
          {libro && paso.estado !== 'elegir' && (
            existente ? (
              <button type="button" className="rx-btn rx-btn-primary lb-peligro" onClick={() => guardar(true)} disabled={!puede}>
                {paso.estado === 'guardando' ? 'Guardando…' : 'Sí, reemplazar'}
              </button>
            ) : (
              <button type="button" className="rx-btn rx-btn-primary" onClick={() => guardar(false)} disabled={!puede}>
                {paso.estado === 'guardando' ? 'Guardando…' : `Importar ${libro.comprobantes.length} comprobantes`}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ver un libro ──────────────────────────────────────────────────────────
function VisorLibro({ meta, otro, esAdmin, onVolver, onAbrir, onReemplazar, onEliminado }) {
  const [estado, setEstado] = useState({ id: null, libro: null, error: '' });
  const [buscar, setBuscar] = useState('');
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    let vigente = true;
    api.libros.leer(meta.id)
      .then((l) => { if (vigente) setEstado({ id: meta.id, libro: l, error: '' }); })
      .catch((e) => { if (vigente) setEstado({ id: meta.id, libro: null, error: e.message || 'No se pudo abrir el libro.' }); });
    return () => { vigente = false; };
  }, [meta.id]);

  const cargando = estado.id !== meta.id;
  const libro = cargando ? null : estado.libro;
  const comprobantes = useMemo(() => (libro ? datosAComprobantes(libro.datos) : []), [libro]);
  const columnas = useMemo(() => (libro && libro.datos && libro.datos.columnas) || [], [libro]);
  const q = sinAcentos(buscar.trim());
  const visibles = useMemo(
    () => comprobantes.filter((c) => !q || sinAcentos(c.razonSocial).includes(q) || String(c.ruc || '').includes(q) || String(c.documento || '').includes(q)),
    [comprobantes, q]
  );
  const totales = useMemo(() => {
    const t = {};
    columnas.forEach((k) => { if (COLUMNAS[k] && COLUMNAS[k].importe) t[k] = 0; });
    visibles.forEach((c) => Object.keys(t).forEach((k) => { t[k] += Number(c[k]) || 0; }));
    return t;
  }, [visibles, columnas]);

  const descargar = async () => {
    const XLSX = await import('xlsx');
    const titulo = `Libro de ${TIPOS[meta.tipo]} · ${meta.cliente} · ${perTexto(meta.periodo)}`;
    const filas = [
      [titulo],
      [],
      columnas.map((k) => COLUMNAS[k] ? COLUMNAS[k].titulo : k),
      ...comprobantes.map((c) => columnas.map((k) => c[k])),
      columnas.map((k, i) => (i === 0 ? 'TOTAL' : COLUMNAS[k] && COLUMNAS[k].importe ? comprobantes.reduce((s, c) => s + (Number(c[k]) || 0), 0) : '')),
    ];
    const ws = XLSX.utils.aoa_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, TIPOS[meta.tipo]);
    const nombre = `Libro_${TIPOS[meta.tipo]}_${meta.cliente}_${meta.periodo}`.replace(/[^\w-]+/g, '_');
    XLSX.writeFile(wb, `${nombre}.xlsx`);
  };

  const eliminar = async () => {
    setBorrando(true);
    try {
      await api.libros.eliminar(meta.id);
      onEliminado(meta);
    } catch (e) {
      setEstado((s) => ({ ...s, error: e.message || 'No se pudo eliminar.' }));
      setBorrando(false);
      setConfirmarBorrar(false);
    }
  };

  return (
    <section className="lb-visor">
      <div className="lb-visor-head">
        <button type="button" className="rx-btn rx-btn-outline" onClick={onVolver}><ArrowLeft size={16} aria-hidden="true" /> Volver</button>
        <div className="lb-visor-titulo">
          <h2>{meta.cliente}</h2>
          <p>Libro de <b>{TIPOS[meta.tipo]}</b> · {perTexto(meta.periodo)}</p>
        </div>
        <div className="lb-tipos" role="tablist" aria-label="Tipo de libro">
          {['compras', 'ventas'].map((t) => {
            const m = t === meta.tipo ? meta : otro;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={t === meta.tipo}
                className={t === meta.tipo ? 'is-active' : ''}
                disabled={!m}
                title={m ? '' : `No hay libro de ${TIPOS[t]} cargado para este mes`}
                onClick={() => m && t !== meta.tipo && onAbrir(m)}
              >
                {TIPOS[t]}
              </button>
            );
          })}
        </div>
      </div>

      <p className="lb-meta">
        {meta.cantidad} comprobantes · archivo {meta.archivo || '—'} · importado por {meta.importadoPor} el {fechaHora(meta.importadoEl)}
      </p>

      {estado.error && !cargando && <div className="lb-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {estado.error}</div>}
      {cargando && <div className="lb-cargando"><RefreshCw size={16} className="animate-spin" aria-hidden="true" /> Abriendo el libro…</div>}

      {libro && (
        <>
          <div className="lb-resumen">
            {RESUMEN.filter((k) => k in totales).map((k) => (
              <div key={k} className={`lb-tarjeta ${k === 'total' ? 'is-total' : ''}`}>
                <span>{COLUMNAS[k].titulo}</span>
                <strong>Gs. {gs(totales[k])}</strong>
              </div>
            ))}
          </div>

          <div className="lb-barra">
            <div className="lb-buscar">
              <Search size={15} aria-hidden="true" />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={meta.tipo === 'compras' ? 'Buscar proveedor, RUC o documento…' : 'Buscar cliente, RUC o documento…'} aria-label="Buscar en el libro" />
            </div>
            <span className="lb-contador">{visibles.length === comprobantes.length ? `${comprobantes.length} comprobantes` : `${visibles.length} de ${comprobantes.length}`}</span>
            <button type="button" className="rx-btn rx-btn-outline" onClick={descargar}><Download size={15} aria-hidden="true" /> Excel</button>
            <button type="button" className="rx-btn rx-btn-outline" onClick={() => onReemplazar(meta)}><Upload size={15} aria-hidden="true" /> Reemplazar</button>
            {esAdmin && !confirmarBorrar && (
              <button type="button" className="rx-btn rx-btn-outline lb-btn-borrar" onClick={() => setConfirmarBorrar(true)}><Trash2 size={15} aria-hidden="true" /> Eliminar</button>
            )}
            {esAdmin && confirmarBorrar && (
              <span className="lb-confirmar">
                ¿Eliminar este libro?
                <button type="button" className="rx-btn rx-btn-outline lb-peligro" onClick={eliminar} disabled={borrando}>{borrando ? 'Eliminando…' : 'Sí, eliminar'}</button>
                <button type="button" className="rx-btn rx-btn-outline" onClick={() => setConfirmarBorrar(false)} disabled={borrando}>No</button>
              </span>
            )}
          </div>

          <div className="lb-tabla-wrap">
            <table className="lb-tabla">
              <thead>
                <tr>{columnas.map((k) => <th key={k} className={COLUMNAS[k] && COLUMNAS[k].importe ? 'num' : ''}>{COLUMNAS[k] ? COLUMNAS[k].titulo : k}</th>)}</tr>
              </thead>
              <tbody>
                {visibles.map((c, i) => (
                  <tr key={i} className={/ANULAD/i.test(c.razonSocial) ? 'is-anulado' : ''}>
                    {columnas.map((k) => (
                      <td key={k} className={COLUMNAS[k] && COLUMNAS[k].importe ? 'num' : k === 'razonSocial' ? 'nombre' : ''}>
                        {COLUMNAS[k] && COLUMNAS[k].importe ? gs(c[k]) : c[k]}
                      </td>
                    ))}
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr><td colSpan={columnas.length} className="lb-vacio-td">Ningún comprobante coincide con la búsqueda.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  {columnas.map((k, i) => (
                    <td key={k} className={COLUMNAS[k] && COLUMNAS[k].importe ? 'num' : ''}>
                      {i === 0 ? 'Total' : k in totales ? gs(totales[k]) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// ── Sección ───────────────────────────────────────────────────────────────
export default function LibrosModule({ withDesktopSidebar = false }) {
  const { year, headers, nameKey, rucKey, userRole } = useClientsMeta();
  const { assignedRows } = useClientsData();
  const esAdmin = userRole === 'ADMINISTRADOR' || userRole === 'SUPERUSUARIO';

  const [indice, setIndice] = useState({ cargado: false, error: '', libros: [] });
  const [ruc, setRuc] = useState('');
  const [anio, setAnio] = useState(() => Number(year) || new Date().getFullYear());
  const [abierto, setAbierto] = useState(null);
  const [importar, setImportar] = useState(null); // preset | null
  const [aviso, setAviso] = useState('');
  const avisoTimer = useRef(null);

  const mostrarAviso = useCallback((t) => {
    setAviso(t);
    clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(''), 3500);
  }, []);
  useEffect(() => () => clearTimeout(avisoTimer.current), []);

  const cargarIndice = useCallback(() => api.libros.listar()
    .then((libros) => setIndice({ cargado: true, error: '', libros }))
    .catch((e) => setIndice((s) => ({
      ...s,
      cargado: true,
      error: e.code === 'UNKNOWN_ACTION'
        ? 'El backend todavía no tiene el módulo de Libros IVA: pegá AppsScript-Libros.gs y el AppsScript-Avisos.gs nuevo y publicá una nueva versión.'
        : e.message || 'No se pudieron cargar los libros.',
    }))), []);
  useEffect(() => { cargarIndice(); }, [cargarIndice]);

  // Clientes: los de la hoja del mes + los que ya tienen libros (por si no
  // están en esta hoja). Identificados por RUC sin DV.
  const clientes = useMemo(() => {
    const dvKey = findDvColumn(headers || []);
    const m = new Map();
    (assignedRows || []).forEach((row) => {
      const { ruc: r } = rucKey ? splitRuc(row[rucKey], dvKey ? row[dvKey] : '') : { ruc: '' };
      const nombre = String((nameKey && row[nameKey]) || '').trim();
      if (r && nombre && !m.has(r)) m.set(r, { ruc: r, nombre, libros: 0 });
    });
    indice.libros.forEach((l) => {
      if (!m.has(l.ruc)) m.set(l.ruc, { ruc: l.ruc, nombre: l.cliente || `RUC ${l.ruc}`, libros: 0 });
      m.get(l.ruc).libros += 1;
    });
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [assignedRows, headers, nameKey, rucKey, indice.libros]);

  const cliente = clientes.find((c) => c.ruc === ruc) || null;
  const delCliente = useMemo(() => indice.libros.filter((l) => l.ruc === ruc), [indice.libros, ruc]);
  const anios = useMemo(() => {
    const s = new Set([Number(year) || new Date().getFullYear(), anio]);
    delCliente.forEach((l) => s.add(Number(l.periodo.slice(0, 4))));
    return [...s].filter(Boolean).sort((a, b) => b - a);
  }, [delCliente, year, anio]);
  const buscarLibro = (tipo, p) => delCliente.find((l) => l.tipo === tipo && l.periodo === p) || null;

  // Clientes con libros (para la vista sin cliente elegido).
  const conLibros = useMemo(() => {
    const m = new Map();
    indice.libros.forEach((l) => {
      const x = m.get(l.ruc) || { ruc: l.ruc, nombre: l.cliente, cantidad: 0, ultimo: '' };
      x.cantidad += 1;
      if (l.periodo > x.ultimo) x.ultimo = l.periodo;
      m.set(l.ruc, x);
    });
    return [...m.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [indice.libros]);

  const alGuardar = async ({ ruc: r, periodo, tipo, reemplazado }) => {
    setImportar(null);
    const libros = await api.libros.listar().catch(() => null);
    if (libros) setIndice({ cargado: true, error: '', libros });
    setRuc(r);
    setAnio(Number(periodo.slice(0, 4)));
    const nuevo = libros && libros.find((l) => l.ruc === r && l.periodo === periodo && l.tipo === tipo);
    if (nuevo) setAbierto(nuevo);
    mostrarAviso(reemplazado ? 'Libro reemplazado' : 'Libro importado');
  };

  return (
    <main className={`real-exec-screen lb-screen ${withDesktopSidebar ? 'has-desktop-sidebar' : ''}`}>
      <header className="lb-head">
        <div>
          <span className="lb-eyebrow"><BookOpen size={14} aria-hidden="true" /> Libros IVA</span>
          <h1>Compras y ventas</h1>
          <p>Libros exportados de SIGA, por cliente y mes.</p>
        </div>
        <button type="button" className="rx-btn rx-btn-primary lb-importar" onClick={() => setImportar(ruc ? { ruc } : {})}>
          <Upload size={16} aria-hidden="true" /> Importar libro
        </button>
      </header>

      {indice.error && <div className="lb-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {indice.error}</div>}

      {abierto ? (
        <VisorLibro
          key={abierto.id}
          meta={abierto}
          otro={buscarLibro(abierto.tipo === 'compras' ? 'ventas' : 'compras', abierto.periodo)}
          esAdmin={esAdmin}
          onVolver={() => setAbierto(null)}
          onAbrir={setAbierto}
          onReemplazar={(m) => setImportar({ ruc: m.ruc, tipo: m.tipo, anio: Number(m.periodo.slice(0, 4)), mes: Number(m.periodo.slice(5)) })}
          onEliminado={(m) => {
            setIndice((s) => ({ ...s, libros: s.libros.filter((l) => l.id !== m.id) }));
            setAbierto(null);
            mostrarAviso('Libro eliminado');
          }}
        />
      ) : (
        <>
          <section className="lb-filtros">
            <div className="lb-campo lb-campo-ancho">
              <label htmlFor="lb-cliente">Cliente</label>
              <ClienteSelect id="lb-cliente" clientes={clientes} valor={ruc} onChange={setRuc} />
            </div>
            {cliente && (
              <div className="lb-campo">
                <label htmlFor="lb-anio">Año</label>
                <select id="lb-anio" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
                  {anios.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            )}
          </section>

          {!indice.cargado && <div className="lb-cargando"><RefreshCw size={16} className="animate-spin" aria-hidden="true" /> Cargando libros…</div>}

          {indice.cargado && !cliente && (
            conLibros.length ? (
              <section className="lb-panel">
                <h2>Clientes con libros cargados</h2>
                <ul className="lb-lista-clientes">
                  {conLibros.map((c) => (
                    <li key={c.ruc}>
                      <button type="button" onClick={() => { setRuc(c.ruc); setAnio(Number(c.ultimo.slice(0, 4))); }}>
                        <strong>{c.nombre}</strong>
                        <small>RUC {c.ruc} · {c.cantidad} {c.cantidad === 1 ? 'libro' : 'libros'} · último: {perTexto(c.ultimo)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : !indice.error && (
              <section className="lb-panel lb-vacio">
                <FileSpreadsheet size={36} aria-hidden="true" />
                <h2>Todavía no hay libros cargados</h2>
                <p>Exportá de SIGA el Libro IVA Compra o Venta de un cliente y tocá <b>Importar libro</b>.</p>
              </section>
            )
          )}

          {cliente && (
            <section className="lb-meses" aria-label={`Libros de ${cliente.nombre} en ${anio}`}>
              {MESES.map((_, i) => {
                const p = per(anio, i + 1);
                return (
                  <div key={p} className="lb-mes">
                    <h3>{mesNombre(i + 1)}</h3>
                    {['compras', 'ventas'].map((t) => {
                      const l = buscarLibro(t, p);
                      return l ? (
                        <button key={t} type="button" className="lb-chip is-cargado" onClick={() => setAbierto(l)}>
                          <span>{TIPOS[t]}</span>
                          <small>{l.cantidad} · Gs. {gs(l.totales && l.totales.total)}</small>
                        </button>
                      ) : (
                        <button key={t} type="button" className="lb-chip" onClick={() => setImportar({ ruc, tipo: t, anio, mes: i + 1 })} title={`Importar el libro de ${TIPOS[t]} de ${mesNombre(i + 1)} ${anio}`}>
                          <span>{TIPOS[t]}</span>
                          <small>Sin cargar</small>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      {importar && (
        <Importador
          clientes={clientes}
          preset={importar}
          onCerrar={() => setImportar(null)}
          onGuardado={alGuardar}
        />
      )}
      {aviso && <div className="lb-toast" role="status">{aviso}</div>}
    </main>
  );
}
