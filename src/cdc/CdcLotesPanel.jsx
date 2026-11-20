import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Loader2, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api';
import { sincronizarLotesCdc, mensajeDeError } from '../marangatu';

// Panel de lotes CDC (descarga de XML). Punto de entrada provisorio desde
// Configuración mientras el módulo tiene su pantalla propia:
//  - lista los lotes ya registrados en el backend;
//  - "Sincronizar" trae los que el recolector de Marangatu creó en la
//    extensión, los registra y le confirma a la extensión.
const FUENTE_TEXTO = {
  FUENTE_REGISTRO_VIRTUAL: 'Imputar Comprobantes',
  FUENTE_CONSULTA_REGISTRADOS: 'Consultar Registrados',
};

const ESTADO_TEXTO = {
  en_cola: 'En cola',
  en_proceso: 'Descargando…',
  completado: 'Completado',
  completado_con_errores: 'Completado con errores',
};

const ITEM_ESTADO_TEXTO = {
  pendiente: 'Pendiente',
  descargado: 'Descargado',
  captcha_fallido: 'Captcha fallido',
  error_descarga: 'Error de descarga',
  no_encontrado: 'No encontrado',
};

const ESTADOS_REINTENTABLES = ['captcha_fallido', 'error_descarga'];

const BOTON_DETALLE_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 9px',
  borderRadius: 8,
  border: '1px solid rgba(120,130,150,.45)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
};

function formatearFecha(iso) {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? String(iso || '') : fecha.toLocaleString();
}

// Última lista conocida: al reabrir el panel se muestra al instante y se
// refresca por detrás, en vez de esperar al backend con la lista vacía.
// Vive también en sessionStorage: ni recargando la página se espera.
const CDC_LOTES_STORAGE_KEY = 'cdcLotesCacheV1';
function leerCacheLotes() {
  try {
    const data = JSON.parse(window.sessionStorage.getItem(CDC_LOTES_STORAGE_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
let lotesCacheMemoria = leerCacheLotes();

export default function CdcLotesPanel() {
  const [lotes, setLotes] = useState(lotesCacheMemoria);
  const [cargando, setCargando] = useState(lotesCacheMemoria.length === 0);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [detalleAbierto, setDetalleAbierto] = useState('');
  const [itemsPorLote, setItemsPorLote] = useState({});
  const [cargandoDetalle, setCargandoDetalle] = useState('');
  const [ultimaDuracion, setUltimaDuracion] = useState(0);
  const [reintentando, setReintentando] = useState('');
  const [borrando, setBorrando] = useState('');

  const cargar = useCallback(async () => {
    if (lotesCacheMemoria.length === 0) setCargando(true);
    setError('');
    const t0 = performance.now();
    try {
      const data = await api.cdc.listarLotes();
      lotesCacheMemoria = data;
      try { window.sessionStorage.setItem(CDC_LOTES_STORAGE_KEY, JSON.stringify(data)); } catch { /* sin storage */ }
      setLotes(data);
      setUltimaDuracion(Math.round(performance.now() - t0));
    } catch (err) {
      setError(err?.message || 'No se pudieron listar los lotes.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function sincronizar() {
    if (sincronizando) return;
    setSincronizando(true);
    setError('');
    setAviso('');
    try {
      const r = await sincronizarLotesCdc((lote) => api.cdc.crearLote(lote));
      if (!r.ok) {
        setError(r.error === 'NO_EXTENSION'
          ? 'No se encontró la extensión Ekuatia Login (o falta configurar su ID).'
          : mensajeDeError(r.error));
      } else {
        setAviso(r.sincronizados
          ? `Se registraron ${r.sincronizados} lote(s) nuevo(s).`
          : 'No había lotes nuevos para sincronizar.');
        await cargar();
      }
    } catch (err) {
      setError(err?.message || 'No se pudo sincronizar.');
    } finally {
      setSincronizando(false);
    }
  }

  async function borrarLote(lote) {
    if (borrando) return;
    if (lote.estado === 'en_proceso') {
      setError('Ese lote se está descargando: esperá a que termine para borrarlo.');
      return;
    }
    const total = lote.totalItems ?? lote.total ?? 0;
    const confirmar = window.confirm(
      `¿Borrar el lote ${lote.loteId}?\n\nSe elimina el lote y sus ${total} CDC(s) del sistema. No se puede deshacer.\nLos XML que estén guardados en Drive NO se borran.`
    );
    if (!confirmar) return;
    setBorrando(lote.loteId);
    setError('');
    setAviso('');
    try {
      await api.cdc.borrarLote(lote.loteId);
      const restantes = lotes.filter((l) => l.loteId !== lote.loteId);
      lotesCacheMemoria = restantes;
      try { window.sessionStorage.setItem(CDC_LOTES_STORAGE_KEY, JSON.stringify(restantes)); } catch { /* sin storage */ }
      setLotes(restantes);
      setAviso(`Lote ${lote.loteId} borrado.`);
    } catch (err) {
      setError(err?.message || 'No se pudo borrar el lote.');
    } finally {
      setBorrando('');
    }
  }

  async function cargarDetalle(loteId) {
    setCargandoDetalle(loteId);
    setError('');
    try {
      const items = await api.cdc.obtenerItems(loteId);
      setItemsPorLote((prev) => ({ ...prev, [loteId]: items }));
    } catch (err) {
      setError(err?.message || 'No se pudo cargar el detalle del lote.');
    } finally {
      setCargandoDetalle('');
    }
  }

  async function toggleDetalle(lote) {
    if (detalleAbierto === lote.loteId) {
      setDetalleAbierto('');
      return;
    }
    setDetalleAbierto(lote.loteId);
    if (!itemsPorLote[lote.loteId]) await cargarDetalle(lote.loteId);
  }

  async function reintentar(lote, cantidad) {
    if (reintentando) return;
    const confirmado = window.confirm(
      `Se creará un lote nuevo En cola con ${cantidad} CDC(s) que fallaron en ${lote.loteId}.\n\n` +
      'No se descarga nada hasta que corras el worker. Conviene crearlo cuando la IP ya enfrió.\n\n' +
      '¿Crear el lote de reintento?'
    );
    if (!confirmado) return;

    setReintentando(lote.loteId);
    setError('');
    setAviso('');
    try {
      const r = await api.cdc.reintentarFallidos(lote.loteId);
      if (!r?.lote) {
        setAviso('No había CDCs reintentables en ese lote.');
      } else if (r.duplicado) {
        setAviso(`Ya había un lote de reintento activo: ${r.lote.loteId}. Queda en cola; no se creó otro.`);
      } else {
        setAviso(`Se creó el lote de reintento ${r.lote.loteId} con ${r.reintentados || r.lote.total || cantidad} CDC(s). Queda En cola; todavía no se descargó nada.`);
      }
      await cargar();
    } catch (err) {
      setError(err?.message || 'No se pudo crear el lote de reintento.');
    } finally {
      setReintentando('');
    }
  }

  return (
    <div className="settings-main cdc-lotes-main">
      <section className="settings-section">
        <h3 className="settings-section-title">Lotes de CDCs para descargar XML</h3>
        <p className="settings-note">
          Los lotes se crean marcando comprobantes en Marangatu con el recolector
          de la extensión. Desde acá se registran en el sistema y quedan en cola.
        </p>
        {ultimaDuracion > 0 && (
          <p className="settings-note">Backend respondió en {(ultimaDuracion / 1000).toFixed(1)} s (la lista se muestra desde caché mientras tanto).</p>
        )}
        <button type="button" className="settings-action" onClick={sincronizar} disabled={sincronizando}>
          {sincronizando ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          <span>{sincronizando ? 'Sincronizando…' : 'Sincronizar desde Marangatu'}</span>
        </button>

        {error && (
          <p className="settings-note" role="alert" style={{ color: '#b3261e', display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertCircle size={15} /> {error}
          </p>
        )}
        {aviso && (
          <p className="settings-note" style={{ color: '#146c2e', display: 'flex', gap: 6, alignItems: 'center' }}>
            <CheckCircle2 size={15} /> {aviso}
          </p>
        )}

        {cargando ? (
          <p className="settings-note" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Loader2 size={15} className="spin" /> Cargando lotes…
          </p>
        ) : lotes.length === 0 ? (
          <p className="settings-note">Todavía no hay lotes registrados.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 8 }}>
            {lotes.map((lote) => {
              const totalItems = lote.totalItems ?? lote.total ?? 0;
              const descargados = lote.descargados ?? 0;
              const porcentaje = totalItems > 0 ? Math.round((descargados / totalItems) * 100) : 0;
              const abierto = detalleAbierto === lote.loteId;
              const items = itemsPorLote[lote.loteId];
              const reintentablesDetalle = items
                ? items.filter((item) => ESTADOS_REINTENTABLES.includes(item.estado)).length
                : (lote.reintentables || 0);
              return (
                <li key={lote.loteId} style={{ border: '1px solid rgba(120,130,150,.35)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <strong>{lote.loteId}</strong>
                    <span>{ESTADO_TEXTO[lote.estado] || lote.estado}</span>
                  </div>
                  <div style={{ fontSize: 13, opacity: .8, marginTop: 4 }}>
                    {lote.total} CDC(s) · {FUENTE_TEXTO[lote.fuente] || lote.fuente} · {formatearFecha(lote.creadoEn)}
                    {lote.creadoPor ? ` · ${lote.creadoPor}` : ''}
                  </div>
                  {lote.observaciones && (
                    <div style={{ fontSize: 12, opacity: .75, marginTop: 2 }}>{lote.observaciones}</div>
                  )}
                  {totalItems > 0 && (
                    <>
                      <div style={{ fontSize: 13, marginTop: 6 }}>
                        Descargados {descargados}/{totalItems}
                        {lote.pendientes ? ` · ${lote.pendientes} pendiente(s)` : ''}
                        {lote.conError ? ` · ${lote.conError} con error` : ''}
                        {lote.reintentables ? ` · ${lote.reintentables} reintentable(s)` : ''}
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'rgba(120,130,150,.25)', marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${porcentaje}%`, background: lote.conError ? '#bf7416' : '#15906f', transition: 'width .3s ease' }} />
                      </div>
                    </>
                  )}

                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" style={BOTON_DETALLE_STYLE} onClick={() => toggleDetalle(lote)} aria-expanded={abierto}>
                      {abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      <span>{abierto ? 'Ocultar detalle' : 'Ver detalle por CDC'}</span>
                    </button>
                    <button
                      type="button"
                      style={{ ...BOTON_DETALLE_STYLE, color: '#d9534f', borderColor: 'rgba(217,83,79,.55)' }}
                      onClick={() => borrarLote(lote)}
                      disabled={borrando === lote.loteId || lote.estado === 'en_proceso'}
                      title={lote.estado === 'en_proceso' ? 'Se está descargando: no se puede borrar ahora' : 'Borrar el lote y sus CDCs del sistema'}
                    >
                      {borrando === lote.loteId ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                      <span>{borrando === lote.loteId ? 'Borrando…' : 'Borrar lote'}</span>
                    </button>
                  </div>

                  {abierto && (
                    <div style={{ marginTop: 10, borderTop: '1px solid rgba(120,130,150,.3)', paddingTop: 10 }}>
                      {cargandoDetalle === lote.loteId ? (
                        <p className="settings-note" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 0 }}>
                          <Loader2 size={14} className="spin" /> Cargando detalle…
                        </p>
                      ) : !items ? (
                        <p className="settings-note" style={{ marginTop: 0 }}>No se pudo cargar el detalle.</p>
                      ) : items.length === 0 ? (
                        <p className="settings-note" style={{ marginTop: 0 }}>Este lote no tiene CDCs registrados.</p>
                      ) : (
                        <>
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                            {items.map((item) => (
                              <li key={item.cdc} style={{ border: '1px solid rgba(120,130,150,.28)', borderRadius: 8, padding: '8px 10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                  <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{item.cdc}</code>
                                  <strong style={{ fontSize: 12 }}>{ITEM_ESTADO_TEXTO[item.estado] || item.estado}</strong>
                                </div>
                                <div style={{ fontSize: 12, opacity: .82, marginTop: 3 }}>
                                  Intentos: {item.intentos ?? 0} · {item.tieneXml
                                    ? 'XML ya está en el sistema'
                                    : item.estado === 'descargado'
                                      ? 'Descargado, pero el XML todavía no está subido'
                                      : 'Sin XML en el sistema'}
                                </div>
                                {item.error && (
                                  <div style={{ fontSize: 12, color: '#d97706', marginTop: 3 }}>
                                    Motivo: {item.error}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>

                          {reintentablesDetalle > 0 && (
                            <div style={{ marginTop: 10, border: '1px solid rgba(217,119,6,.45)', borderRadius: 8, padding: '10px' }}>
                              <p className="settings-note" style={{ marginTop: 0 }}>
                                Hay {reintentablesDetalle} CDC(s) con falla reintentable en este lote. Crear el reintento
                                solo deja un lote nuevo En cola: no descarga nada hasta que corras el worker.
                              </p>
                              <button
                                type="button"
                                className="settings-action"
                                style={{ marginTop: 8 }}
                                onClick={() => reintentar(lote, reintentablesDetalle)}
                                disabled={lote.estado === 'en_proceso' || reintentando === lote.loteId}
                              >
                                {reintentando === lote.loteId ? <Loader2 size={15} className="spin" /> : <RotateCcw size={15} />}
                                <span>
                                  {lote.estado === 'en_proceso'
                                    ? 'Descargando… esperá a que termine'
                                    : reintentando === lote.loteId
                                      ? 'Creando reintento…'
                                      : `Crear lote de reintento (${reintentablesDetalle})`}
                                </span>
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
