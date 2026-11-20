import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Pencil, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { gs } from '../iva/ivaCore.js';
import FormComprobante from './FormComprobante';
import { TIPOS, calcular, esRecibo, normalizar, periodoDe } from './comprobantesCore.js';
import { ACEPTA, documentoAComprobante, localAComprobantes, prepararArchivo, problemas } from './lecturaCore.js';

// «Subir documentos»: lee facturas, notas de crédito, recibos y planillas de
// cualquier formato (lo conocido en la app; el resto con Claude), muestra lo
// leído para revisar y recién al confirmar lo guarda en el registro.
// onGuardado({ afectados: [{ cliente, periodo }], resumen }) al terminar.

const fechaCorta = (f) => (f ? f.split('-').reverse().join('/') : '—');
let secuencia = 0;

// archivosIniciales: File[] para leer apenas se abre (p. ej. desde XML / KuDE).
export default function LeerDocumentos({ clientes, preferido, estudio, onCerrar, onGuardado, archivosIniciales = null }) {
  const [archivos, setArchivos] = useState([]); // { id, nombre, estado, error, origen }
  const [items, setItems] = useState([]); // { id, archivo, ruc, comprobante, avisos, incluir }
  const [leyendo, setLeyendo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [arrastrando, setArrastrando] = useState(false);

  const leer = async (lista) => {
    const nuevos = [...lista].map((f) => ({ id: `a${++secuencia}`, file: f, nombre: f.name, estado: 'esperando' }));
    if (!nuevos.length) return;
    setArchivos((xs) => [...xs, ...nuevos]);
    setLeyendo(true);
    const contexto = preferido ? (() => {
      const c = clientes.find((x) => x.ruc === preferido);
      return c ? `Cliente del estudio elegido en pantalla: ${c.nombre} (RUC ${c.ruc}${c.dv ? '-' + c.dv : ''}).` : '';
    })() : '';
    for (const a of nuevos) {
      setArchivos((xs) => xs.map((x) => (x.id === a.id ? { ...x, estado: 'leyendo' } : x)));
      try {
        const prep = await prepararArchivo(a.file);
        let leidos;
        let origen;
        if (prep.local) {
          leidos = localAComprobantes(prep.local, { clientes, preferido });
          origen = prep.local.origen;
        } else if (prep.docs) {
          leidos = prep.docs.map((d) => documentoAComprobante(d, { clientes, preferido, rucEstudio: estudio && estudio.ruc }));
          origen = prep.origen + (prep.descartados ? ` · ${prep.descartados} sin montos (remisión) no se cargan` : '');
        } else {
          const r = await api.lectura.documento({ ...prep.ia, contexto });
          leidos = (r.documentos || []).map((d) => documentoAComprobante(d, { clientes, preferido, rucEstudio: estudio && estudio.ruc }));
          origen = 'Leído con IA';
          if (!leidos.length) throw new Error(r.nota || 'No se encontraron comprobantes en el archivo.');
        }
        setItems((xs) => [...xs, ...leidos.map((l) => ({ ...l, id: `i${++secuencia}`, archivo: a.nombre, incluir: true }))]);
        setArchivos((xs) => xs.map((x) => (x.id === a.id ? { ...x, estado: 'listo', origen, cantidad: leidos.length } : x)));
      } catch (e) {
        const msg = e.code === 'UNKNOWN_ACTION'
          ? 'El backend todavía no tiene la lectura: pegá AppsScript-Lectura.gs y el AppsScript-Avisos.gs nuevo y publicá una nueva versión.'
          : e.message || 'No se pudo leer.';
        setArchivos((xs) => xs.map((x) => (x.id === a.id ? { ...x, estado: 'error', error: msg } : x)));
      }
    }
    setLeyendo(false);
  };

  const inicialLeido = useRef(false);
  useEffect(() => {
    if (inicialLeido.current || !archivosIniciales || !archivosIniciales.length) return;
    inicialLeido.current = true;
    leer(archivosIniciales);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Revisión: errores bloquean el guardado de ese ítem; avisos sólo marcan.
  const revisados = useMemo(() => items.map((it) => {
    const mismos = items.filter((x) => x.id !== it.id && x.incluir && x.ruc === it.ruc).map((x) => x.comprobante);
    return { ...it, ...problemas(it, mismos) };
  }), [items]);
  const aGuardar = revisados.filter((x) => x.incluir);
  const conErrores = aGuardar.filter((x) => x.errores.length);

  const cambiar = (id, cambio) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...cambio } : x)));

  const guardar = async () => {
    if (!aGuardar.length || conErrores.length) return;
    setGuardando(true);
    setError('');
    try {
      const porCliente = new Map();
      aGuardar.forEach((x) => { if (!porCliente.has(x.ruc)) porCliente.set(x.ruc, []); porCliente.get(x.ruc).push(x.comprobante); });
      let agregados = 0;
      let repetidos = 0;
      const afectados = new Map();
      for (const [ruc, lista] of porCliente) {
        const cli = clientes.find((c) => c.ruc === ruc);
        const facturas = lista.filter((c) => !esRecibo(c));
        const recibos = lista.filter(esRecibo);
        if (facturas.length) {
          const r = await api.comprobantes.importar(ruc, cli ? cli.nombre : '', facturas.map(normalizar));
          agregados += r.agregados || 0;
          repetidos += r.repetidos || 0;
          (r.meses || []).filter((m) => m.agregados > 0).forEach((m) => {
            if (facturas.some((c) => periodoDe(c.fecha) === m.periodo && c.imputa && c.imputa.iva)) {
              afectados.set(`${ruc}|${m.periodo}`, { cliente: { ruc, dv: cli ? cli.dv : '', nombre: cli ? cli.nombre : ruc }, periodo: m.periodo });
            }
          });
        }
        for (const c of recibos) {
          try {
            await api.comprobantes.guardar({ ruc, cliente: cli ? cli.nombre : '', comprobante: normalizar(c) });
            agregados += 1;
          } catch (e) {
            if (e.code === 'COMPROBANTE_DUPLICADO') repetidos += 1; else throw e;
          }
        }
      }
      onGuardado({ afectados: [...afectados.values()], agregados, repetidos, rucs: [...porCliente.keys()] });
    } catch (e) {
      setError(e.code === 'UNKNOWN_ACTION'
        ? 'El Apps Script publicado no tiene el registro de comprobantes: pegá AppsScript-Comprobantes.gs y el AppsScript-Avisos.gs nuevos y publicá una nueva versión.'
        : e.message || 'No se pudo guardar.');
      setGuardando(false);
    }
  };

  const ocupado = leyendo || guardando;
  const itemEditado = editando ? items.find((x) => x.id === editando) : null;

  return (
    <div className="lb-modal-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado && !items.length) onCerrar(); }}>
      <div className="lb-modal cp-leer" role="dialog" aria-modal="true" aria-labelledby="cp-leer-t">
        <div className="lb-modal-head">
          <h2 id="cp-leer-t"><Sparkles size={18} aria-hidden="true" /> Subir documentos</h2>
          <button type="button" className="lb-icono" onClick={onCerrar} aria-label="Cerrar" disabled={guardando}><X size={18} /></button>
        </div>
        <div className="lb-modal-body">
          <label
            className={`lb-drop cp-leer-drop ${arrastrando ? 'is-over' : ''} ${items.length ? 'is-compacto' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); if (!ocupado) leer(e.dataTransfer.files || []); }}
          >
            <FileUp size={items.length ? 20 : 34} aria-hidden="true" />
            <strong>{items.length ? 'Agregar más archivos' : 'Elegí o arrastrá los documentos'}</strong>
            {!items.length && <span>Facturas, notas de crédito y recibos en PDF, foto o XML de factura electrónica, planillas Excel/CSV de cualquier sistema, el detalle de Marangatu. Podés subir varios a la vez.</span>}
            <input type="file" multiple accept={ACEPTA} onChange={(e) => { leer(e.target.files || []); e.target.value = ''; }} disabled={ocupado} />
          </label>
          {!items.length && !archivos.length && (
            <p className="lb-ayuda">El XML de factura electrónica y el detalle de Marangatu se leen directo; lo demás lo lee Claude. Nada se guarda hasta que lo revises y toques «Guardar».</p>
          )}

          {archivos.length > 0 && (
            <ul className="cp-leer-archivos">
              {archivos.map((a) => (
                <li key={a.id} className={`is-${a.estado}`}>
                  {a.estado === 'leyendo' || a.estado === 'esperando' ? <RefreshCw size={14} className={a.estado === 'leyendo' ? 'animate-spin' : ''} aria-hidden="true" />
                    : a.estado === 'error' ? <AlertTriangle size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                  <span className="cp-leer-nombre">{a.nombre}</span>
                  <small>
                    {a.estado === 'esperando' && 'En espera'}
                    {a.estado === 'leyendo' && 'Leyendo…'}
                    {a.estado === 'listo' && `${a.cantidad} ${a.cantidad === 1 ? 'comprobante' : 'comprobantes'} · ${a.origen}`}
                    {a.estado === 'error' && a.error}
                  </small>
                </li>
              ))}
            </ul>
          )}

          {revisados.length > 0 && (
            <>
              <div className="cp-leer-resumen">
                <strong>{aGuardar.length} para guardar</strong>
                {conErrores.length > 0 && <span className="is-err">{conErrores.length} con datos que faltan</span>}
                {aGuardar.filter((x) => !x.errores.length && x.avisos.length).length > 0 && (
                  <span className="is-av">{aGuardar.filter((x) => !x.errores.length && x.avisos.length).length} para revisar</span>
                )}
              </div>
              <ul className="cp-leer-lista">
                {revisados.map((x) => {
                  const c = x.comprobante;
                  const k = calcular(c);
                  const marca = x.errores.length ? 'is-err' : x.avisos.length ? 'is-av' : 'is-ok';
                  return (
                    <li key={x.id} className={`cp-leer-item ${marca} ${x.incluir ? '' : 'is-fuera'}`}>
                      <label className="cp-leer-incluir" title="Incluir al guardar">
                        <input type="checkbox" checked={x.incluir} onChange={(e) => cambiar(x.id, { incluir: e.target.checked })} aria-label="Incluir" />
                      </label>
                      <div className="cp-leer-datos">
                        <div className="cp-leer-linea1">
                          <span className={`cp-op ${esRecibo(c) ? 'cp-op-recibo' : `cp-op-${c.op}`}`}>
                            {esRecibo(c) ? (c.emisor === 'estudio' ? 'Honorarios' : c.emisor === 'tercero' ? 'Recibido' : 'Emitido') : c.op === 'compra' ? 'Compra' : 'Venta'}
                          </span>
                          <b>{TIPOS[c.tipo]}</b>
                          <span className="cp-mono">{c.numero || 's/n'}</span>
                          <span>{fechaCorta(c.fecha)}</span>
                          <span className="cp-leer-total">Gs. {gs(k.total)}</span>
                        </div>
                        <div className="cp-leer-linea2">
                          {c.nombre || '—'}{c.ruc ? ` · ${c.ruc}` : ''}{!esRecibo(c) && c.timbrado ? ` · timbrado ${c.timbrado}` : ''}
                          <small> · {x.archivo}</small>
                        </div>
                        <div className="cp-leer-cliente">
                          <label htmlFor={`cp-leer-cli-${x.id}`}>Cliente</label>
                          <select id={`cp-leer-cli-${x.id}`} value={x.ruc} onChange={(e) => cambiar(x.id, { ruc: e.target.value })}>
                            <option value="">— Elegí el cliente —</option>
                            {clientes.map((cl) => <option key={cl.ruc} value={cl.ruc}>{cl.nombre} · {cl.ruc}</option>)}
                          </select>
                        </div>
                        {(x.errores.length > 0 || x.avisos.length > 0) && (
                          <ul className="cp-leer-avisos">
                            {x.errores.map((t) => <li key={t} className="is-err">{t}</li>)}
                            {x.avisos.map((t) => <li key={t}>{t}</li>)}
                          </ul>
                        )}
                      </div>
                      <div className="cp-leer-acciones">
                        <button type="button" className="lb-icono" onClick={() => setEditando(x.id)} aria-label="Revisar y corregir" title="Revisar y corregir"><Pencil size={15} /></button>
                        <button type="button" className="lb-icono lb-btn-borrar" onClick={() => setItems((xs) => xs.filter((y) => y.id !== x.id))} aria-label="Quitar" title="Quitar"><Trash2 size={15} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {error && <div className="lb-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /> {error}</div>}
        </div>
        <div className="lb-modal-pie">
          <button type="button" className="rx-btn rx-btn-outline" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          {revisados.length > 0 && (
            <button type="button" className="rx-btn rx-btn-primary" onClick={guardar} disabled={ocupado || !aGuardar.length || conErrores.length > 0}
              title={conErrores.length ? 'Completá los datos que faltan o destildá esos comprobantes' : ''}>
              {guardando ? 'Guardando…' : leyendo ? 'Leyendo…' : `Guardar ${aGuardar.length} en el registro`}
            </button>
          )}
        </div>
      </div>

      {itemEditado && (
        <FormComprobante
          key={itemEditado.id}
          inicial={{ ...itemEditado.comprobante, id: '', g10: itemEditado.comprobante.g10 || '', g5: itemEditado.comprobante.g5 || '', ex: itemEditado.comprobante.ex || '', monto: itemEditado.comprobante.monto || '', cambio: itemEditado.comprobante.cambio || '' }}
          periodoActual={periodoDe(itemEditado.comprobante.fecha)}
          lista={[]}
          contrapartes={[]}
          cliente={clientes.find((c) => c.ruc === itemEditado.ruc) || null}
          estudio={estudio}
          guardando={false}
          error=""
          onGuardar={(c) => { cambiar(itemEditado.id, { comprobante: normalizar({ ...c, id: itemEditado.comprobante.id }), avisos: [] }); setEditando(null); }}
          onCerrar={() => setEditando(null)}
          soloRevisar
        />
      )}
    </div>
  );
}
