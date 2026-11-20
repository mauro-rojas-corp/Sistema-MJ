import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCode2,
  Loader2,
  Printer,
  RefreshCw,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { parseXmlToKudeMultiple } from './utils/xmlParser';
import { KudeDocument } from './components/KudeDocument';
import { api } from '../api';
import { descargarDirectoPedir, descargarDirectoEstado, descargarDirectoResultados, mensajeDeError } from '../marangatu';
import UseAnimations from 'react-useanimations';
import downloadCloud from 'react-useanimations/lib/downloadCloud';
import './xml.css';

// Herramienta XML / KuDE (mínimo viable): carga archivos XML SIFEN ya
// descargados (p. ej. desde eKuatia), los parsea EN EL NAVEGADOR con el
// parser existente (src/xml/utils/xmlParser) y permite revisar e imprimir
// el KuDE. Nada se sube al servidor: los archivos quedan solo en memoria
// mientras la pestaña está abierta.
//
// A diferencia del parser original, acá solo se aceptan documentos
// válidos para imprimir: DTE SIFEN (rDE/DE), CDC de exactamente 44
// dígitos, sin errores de parseo y con al menos un ítem. Los XML
// rechazados se informan con su motivo y nunca llegan a la vista KuDE.
const CDC_RE = /^\d{44}$/;

// --- Sesión local de trabajo (IndexedDB, 30 minutos) -----------------------
// Complemento de continuidad: guarda en ESTE navegador los XML en pantalla
// para recuperarlos al volver sin gastar tokens. No sube nada a la red.
const SESION_TTL_MS = 30 * 60 * 1000;
const SESION_DB = 'mjXmlSesionV1';

function sesionAbrirDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = window.indexedDB.open(SESION_DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (err) { reject(err); }
  });
}

async function sesionGuardar(valor) {
  try {
    const db = await sesionAbrirDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(valor, 'actual');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch { return false; }
}

async function sesionLeer() {
  try {
    const db = await sesionAbrirDb();
    const valor = await new Promise((resolve, reject) => {
      const req = db.transaction('kv', 'readonly').objectStore('kv').get('actual');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return valor;
  } catch { return null; }
}

async function sesionBorrar() {
  try {
    const db = await sesionAbrirDb();
    await new Promise((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete('actual');
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();
  } catch { /* sin almacenamiento disponible */ }
}

function pareceSifen(texto) {
  return /<(?:[A-Za-z_][\w.-]*:)?rDE(?:\s|>)/.test(texto)
    || /<(?:[A-Za-z_][\w.-]*:)?DE(?:\s|>)/.test(texto);
}

function motivoRechazo(doc) {
  if (!doc) return 'No se pudo parsear el documento.';
  if (doc.parseErrors && doc.parseErrors.length > 0) return doc.parseErrors[0];
  if (!CDC_RE.test(String(doc.cdc || ''))) return 'El CDC no tiene exactamente 44 dígitos.';
  if (!doc.items || doc.items.length === 0) return 'El documento no tiene ítems.';
  return '';
}

function formatMoney(doc, val) {
  const n = Number(val) || 0;
  if (doc.totales?.moneda === 'PYG') return `₲ ${Math.round(n).toLocaleString('es-PY')}`;
  return `US$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function XmlToolModule({ withDesktopSidebar = false }) {
  const [docs, setDocs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [printing, setPrinting] = useState(false);
  const [printAll, setPrintAll] = useState(false);
  const fileInputRef = useRef(null);

  const selected = docs.find((d) => d.id === selectedId) || docs[0] || null;

  useEffect(() => {
    if (!selectedId) return;
    const el = railItemRefs.current[selectedId];
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  // --- Visualizador: navegación entre facturas (botones y teclado) ---
  const selIndex = selected ? docs.findIndex((d) => d.id === selected.id) : -1;
  const irA = (idx) => {
    if (docs.length > 0) setSelectedId(docs[((idx % docs.length) + docs.length) % docs.length].id);
  };
  const verAnterior = () => irA(selIndex - 1);
  const verSiguiente = () => irA(selIndex + 1);

  useEffect(() => {
    const onKey = (e) => {
      if (printing) return;
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); verAnterior(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); verSiguiente(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const [lotesSistema, setLotesSistema] = useState([]);
  const [loteSistemaSel, setLoteSistemaSel] = useState('');
  const [trayendo, setTrayendo] = useState(false);
  const [directa, setDirecta] = useState(null); // spike: descarga directa vía extensión
  const [directaResumen, setDirectaResumen] = useState(null); // tiempos de la última descarga directa
  const [sesionExpiraEn, setSesionExpiraEn] = useState(null); // sesión local de 30 min
  const [ahoraTick, setAhoraTick] = useState(() => Date.now());
  const sesionRestauradaRef = useRef(false);
  const procesarRef = useRef(null);
  useEffect(() => { procesarRef.current = procesarTextos; });
  const [actualizando, setActualizando] = useState(false);
  const railItemRefs = useRef({});
  const contenidosCacheRef = useRef(new Map());
  const [errorLotes, setErrorLotes] = useState('');

  // Núcleo de carga: recibe textos XML ya leídos (de archivos locales o
  // traídos del sistema) y aplica siempre la misma validación. Devuelve
  // el resumen para que cada entrada informe a su manera.
  function procesarTextos(textos) {
    const aceptados = [];
    const rechazados = [];
    let duplicados = 0;
    const cdcsVistos = new Set(docs.map((d) => d.cdc));

    for (const file of textos) {
      try {
        const contenido = String(file.content || '').trim();
        if (!contenido) {
          rechazados.push(`${file.name}: archivo vacío.`);
          continue;
        }
        if (!pareceSifen(contenido)) {
          rechazados.push(`${file.name}: no es un DTE SIFEN (no se encontró rDE/DE).`);
          continue;
        }
        const parseados = parseXmlToKudeMultiple(contenido, file.name);
        if (!parseados || parseados.length === 0) {
          rechazados.push(`${file.name}: no se pudo parsear el documento.`);
          continue;
        }
        for (const doc of parseados) {
          const motivo = motivoRechazo(doc);
          if (motivo) {
            rechazados.push(`${file.name}: ${motivo}`);
            continue;
          }
          if (cdcsVistos.has(doc.cdc)) {
            duplicados += 1;
            continue;
          }
          cdcsVistos.add(doc.cdc);
          aceptados.push(doc);
        }
      } catch (err) {
        rechazados.push(`${file.name}: ${err?.message || 'error al leer el archivo.'}`);
      }
    }

    if (aceptados.length > 0) {
      setDocs((prev) => [...prev, ...aceptados]);
      setSelectedId(aceptados[0].id);
    }
    return { cargados: aceptados.length, duplicados, rechazados };
  }

  function informarCarga({ cargados, duplicados, rechazados }, notas = []) {
    const partes = [];
    if (cargados > 0) partes.push(`Se cargaron ${cargados} documento(s) válido(s).`);
    if (duplicados > 0) partes.push(`${duplicados} factura(s) ya estaban cargadas (mismo CDC) y no se agregaron de nuevo.`);
    partes.push(...notas);
    setAviso(partes.join(' '));
    if (rechazados.length > 0) setError(rechazados.join(' '));
  }

  async function procesarArchivos(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0 || procesando) return;
    setProcesando(true);
    setError('');
    setAviso('');
    try {
      const textos = [];
      for (const file of files) {
        textos.push({ name: file.name, content: await file.text() });
      }
      informarCarga(procesarTextos(textos));
    } catch (err) {
      setError(err?.message || 'No se pudieron leer los archivos.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setProcesando(false);
  }

  // Trae los XML de un lote del sistema (el worker los sube a Drive al
  // descargarlos). Entran por la misma validación que los archivos.
  async function actualizarLotesSistema() {
    setActualizando(true);
    try {
      setErrorLotes('');
      const lotes = await api.cdc.listarLotes();
      const conDescargas = lotes.filter((l) => (l.descargados || 0) > 0 || l.estado === 'en_proceso' || l.estado === 'en_cola');
      setLotesSistema(conDescargas);
      if (conDescargas.length > 0) {
        setLoteSistemaSel((prev) => {
          if (prev && conDescargas.some((l) => l.loteId === prev)) return prev;
          // Por defecto, el lote más nuevo QUE YA TENGA descargas: si se
          // elige uno en cola sin XML, "Traer" no tiene nada que traer.
          const conXml = conDescargas.find((l) => (l.descargados || 0) > 0);
          return (conXml || conDescargas[0]).loteId;
        });
      }
    } catch (err) {
      setErrorLotes(err?.message || 'No se pudo consultar la lista de lotes.');
    }
    setActualizando(false);
  }

  // EL botón Actualizar del flujo: refresca la lista de lotes y su
  // progreso. Traer o descargar XML es exclusivo de sus botones.
  async function refrescarSistema() {
    if (actualizando || trayendo || directa) return;
    // Este es el único refresco del flujo: también descarta la copia
    // cacheada que usa el panel de Configuración, para que no pinte viejo.
    try { window.sessionStorage.removeItem('cdcLotesCacheV1'); } catch { /* sin storage */ }
    await actualizarLotesSistema();
  }

  useEffect(() => { actualizarLotesSistema(); }, []);

  // Sesión local de trabajo (IndexedDB): guarda los XML en pantalla por
  // 30 minutos para recuperarlos al volver, sin red y sin tokens. Es una
  // capa agregada: no cambia cómo se descargan ni se traen las facturas.
  useEffect(() => {
    if (sesionRestauradaRef.current) return;
    sesionRestauradaRef.current = true;
    (async () => {
      const reg = await sesionLeer();
      if (!reg) return;
      if (!reg.expiraEn || Date.now() > reg.expiraEn || !Array.isArray(reg.textos) || reg.textos.length === 0) {
        await sesionBorrar();
        return;
      }
      const r = procesarRef.current(reg.textos);
      if (r.cargados > 0) {
        setSesionExpiraEn(reg.expiraEn);
        setAviso(`Sesión recuperada: ${r.cargados} factura(s) que estaban guardadas en este equipo.`);
      } else {
        await sesionBorrar();
      }
    })();
  }, []);

  useEffect(() => {
    if (!sesionRestauradaRef.current) return undefined;
    // Pantalla vacía (p. ej. tras Vaciar): el guardado NO se borra; queda
    // hasta expirar para poder recuperar sin gastar tokens.
    if (docs.length === 0) return undefined;
    const t = setTimeout(async () => {
      const expiraEn = Date.now() + SESION_TTL_MS;
      const ok = await sesionGuardar({
        expiraEn,
        textos: docs.map((d) => ({ name: d.fileName, content: d.xmlRaw })),
      });
      if (ok) setSesionExpiraEn(expiraEn);
    }, 400);
    return () => clearTimeout(t);
  }, [docs]);

  // Vencimiento en pantalla: al expirar se descarta el guardado (lo que se
  // está viendo no se toca; simplemente ya no se recupera al salir).
  useEffect(() => {
    if (!sesionExpiraEn) return undefined;
    const t = setInterval(() => {
      setAhoraTick(Date.now());
      if (Date.now() > sesionExpiraEn) {
        sesionBorrar();
        setSesionExpiraEn(null);
      }
    }, 20000);
    return () => clearInterval(t);
  }, [sesionExpiraEn]);

  async function traerDelSistema() {
    if (!loteSistemaSel || trayendo || procesando) return;
    setTrayendo(true);
    setError('');
    setAviso('');
    try {
      const items = await api.cdc.obtenerItems(loteSistemaSel);
      const descargados = items.filter((i) => i.estado === 'descargado');
      const conXml = descargados.filter((i) => i.tieneXml);
      // Traída en paralelo (de a 4) y con caché por CDC: lo que ya está
      // en pantalla no se vuelve a bajar al Actualizar.
      const textos = [];
      const cache = contenidosCacheRef.current;
      let cursor = 0;
      const bajar = async () => {
        while (cursor < conXml.length) {
          const it = conXml[cursor];
          cursor += 1;
          let contenido = cache.get(it.cdc);
          if (!contenido) {
            contenido = await api.cdc.obtenerXml(loteSistemaSel, it.cdc);
            if (contenido) cache.set(it.cdc, contenido);
          }
          if (contenido) textos.push({ name: `${it.cdc}.xml`, content: contenido });
        }
      };
      await Promise.all([bajar(), bajar(), bajar(), bajar()]);
      const notas = [];
      const sinSubir = descargados.length - conXml.length;
      if (descargados.length === 0) {
        notas.push('Ese lote todavía no tiene CDCs descargados.');
      } else if (sinSubir > 0) {
        notas.push(`${sinSubir} descargado(s) aún no están subidos al sistema. Para lotes viejos, en la PC del worker: npm run cola -- --subir-lote=${loteSistemaSel}`);
      }
      informarCarga(procesarTextos(textos), notas);
    } catch (err) {
      setError(err?.message || 'No se pudieron traer los XML del sistema.');
    }
    setTrayendo(false);
  }

  // --- Descarga directa por la extensión ---------------------------------
  // La extensión baja los XML de eKuatia por API y los entrega por el canal
  // externo, sin pasar por el worker ni por Drive. Acá se pide el trabajo,
  // se sigue el avance y al final los XML entran por la validación común.
  async function descargarDirecta(cdcsEntrada) {
    if (!loteSistemaSel || directa || trayendo || procesando) return;
    setError('');
    setAviso('');
    setDirecta({ hechos: 0, total: 0 });
    const t0Directa = performance.now();
    try {
      const est0 = await descargarDirectoEstado();
      if (!est0?.ok) {
        throw new Error('No se encontró la extensión Ekuatia Login (o falta actualizarla a la v2.11). Revisá que esté instalada y activa en este Chrome.');
      }
      if (est0.corriendo) throw new Error('Ya hay una descarga directa en curso en la extensión. Esperá a que termine.');
      let cdcs = Array.isArray(cdcsEntrada) ? cdcsEntrada : null;
      if (!cdcs) {
        const items = await api.cdc.obtenerItems(loteSistemaSel);
        const enPantalla = new Set(docs.map((d) => d.cdc));
        cdcs = [...new Set(items.map((i) => i.cdc).filter((c) => /^\d{44}$/.test(c) && !enPantalla.has(c)))];
      }
      if (cdcs.length === 0) {
        setAviso('Ese lote no tiene CDCs nuevos para descargar directo (ya están todos en pantalla).');
        return;
      }
      // Caché primero: lo que ya esté en la sesión local se recupera sin
      // gastar tokens; a la extensión solo va lo que falta.
      let textosPrevios = [];
      let cdcsParaBajar = cdcs;
      const regSesion = await sesionLeer();
      if (regSesion && regSesion.expiraEn > Date.now() && Array.isArray(regSesion.textos)) {
        const porCdc = new Map();
        for (const t of regSesion.textos) {
          const m = String(t.content || '').match(/Id="(\d{44})"/) || String(t.name || '').match(/(\d{44})/);
          if (m && !porCdc.has(m[1])) porCdc.set(m[1], t);
        }
        cdcsParaBajar = [];
        for (const c of cdcs) {
          const hit = porCdc.get(c);
          if (hit) textosPrevios.push(hit); else cdcsParaBajar.push(c);
        }
      }
      if (cdcsParaBajar.length === 0) {
        const notasCache = [`${textosPrevios.length} factura(s) recuperadas de la sesión local, sin gastar tokens.`];
        informarCarga(procesarTextos(textosPrevios), notasCache);
        return;
      }
      const inicio = await descargarDirectoPedir(cdcsParaBajar);
      if (!inicio?.ok) throw new Error(mensajeDeError(inicio?.error) || 'La extensión no aceptó el trabajo.');
      setDirecta({ hechos: 0, total: cdcsParaBajar.length });
      cdcs = cdcsParaBajar;
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        const estado = await descargarDirectoEstado();
        if (!estado?.ok) throw new Error('Se perdió contacto con la extensión durante la descarga.');
        setDirecta({ hechos: estado.hechos || 0, total: estado.total || cdcs.length });
        if (!estado.corriendo) break;
      }
      const { resultados } = await descargarDirectoResultados();
      const textos = [...textosPrevios, ...(resultados || [])
        .filter((r) => r.ok && r.xml)
        .map((r) => ({ name: `${r.cdc}.xml`, content: r.xml }))];
      const fallidos = (resultados || []).filter((r) => !r.ok).length;
      const duracionSeg = (performance.now() - t0Directa) / 1000;
      const okItems = (resultados || []).filter((r) => r.ok);
      const sumaSeg = okItems.reduce((acc, r) => acc + (r.segTotal || 0), 0);
      setDirectaResumen({ duracionSeg, sumaSeg, items: resultados || [] });
      const okCant = textos.length;
      const notas = [`Descarga directa por la extensión: ${okCant} XML (descarga efectiva ${sumaSeg.toFixed(0)} s${okCant ? `, ${(sumaSeg / okCant).toFixed(1)} s por factura` : ''}; corrida total ${duracionSeg.toFixed(0)} s).`];
      if (fallidos > 0) notas.push(`${fallidos} CDC(s) no se pudieron descargar directo.`);
      if (textosPrevios.length > 0) notas.push(`${textosPrevios.length} factura(s) venían de la sesión local (sin tokens).`);
      informarCarga(procesarTextos(textos), notas);
    } catch (err) {
      setError(err?.message || 'No se pudo completar la descarga directa.');
    } finally {
      setDirecta(null);
    }
  }

  const loteSelObj = lotesSistema.find((l) => l.loteId === loteSistemaSel) || null;
  const loteEnCurso = !!loteSelObj && (loteSelObj.estado === 'en_proceso'
    || (loteSelObj.estado === 'en_cola' && (loteSelObj.descargados || 0) > 0));

  // Mientras un lote se está descargando, el progreso se refresca solo.
  useEffect(() => {
    if (!loteEnCurso) return undefined;
    const t = setInterval(() => { actualizarLotesSistema(); }, 5000);
    return () => clearInterval(t);
  }, [loteEnCurso, loteSistemaSel]);

  // Sin traída automática al abrir: el módulo arranca limpio y las
  // facturas se traen con el botón Traer (o con Actualizar, que retrae).

  function quitarDoc(id) {
    setDocs((prev) => {
      const next = prev.filter((d) => d.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  }

  // Impresión aislada: se imprime solo el KuDE seleccionado mediante un
  // portal fuera de #root (mismo patrón que Marcaciones).
  useEffect(() => {
    if (!printing) return undefined;
    document.body.classList.add('xml-printing');
    const terminar = () => setPrinting(false);
    window.addEventListener('afterprint', terminar, { once: true });
    const t = setTimeout(() => window.print(), 80);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', terminar);
      document.body.classList.remove('xml-printing');
    };
  }, [printing]);

  return (
    <main className={`real-exec-screen xml-root ${withDesktopSidebar ? 'has-desktop-sidebar' : ''}`}>
      <header className="xml-head">
        <div>
          <h1>Visualizador de facturas</h1>
          <p>Traé un lote descargado o cargá archivos XML: pasá de factura en factura con las flechas ← → e imprimí desde acá. Todo se procesa en este equipo.</p>
        </div>
      </header>

      <section className="xml-panel">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.XML,text/xml,application/xml"
          multiple
          hidden
          onChange={(e) => procesarArchivos(e.target.files)}
        />
        <div
          className={`xml-drop ${arrastrando ? 'is-drag' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
          onMouseEnter={() => setDropHover(true)}
          onMouseLeave={() => setDropHover(false)}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={(e) => { e.preventDefault(); setArrastrando(false); }}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); procesarArchivos(e.dataTransfer.files); }}
        >
          {procesando
            ? <Loader2 size={26} className="spin" />
            : (
              <UseAnimations
                key={dropHover || arrastrando ? 'play' : 'idle'}
                animation={downloadCloud}
                size={32}
                autoplay={dropHover || arrastrando}
                loop
                aria-hidden="true"
              />
            )}
          <strong>{procesando ? 'Parseando archivos…' : 'Arrastrá y soltá archivos XML aquí'}</strong>
          <span>o hacé clic para elegirlos (se pueden seleccionar varios a la vez)</span>
        </div>

        {error && (
          <p className="xml-msg error" role="alert">
            <AlertCircle size={15} /> <span>{error}</span>
          </p>
        )}
        {aviso && (
          <p className="xml-msg ok" role="status">
            <CheckCircle2 size={15} /> <span>{aviso}</span>
          </p>
        )}
      </section>

      <section className="xml-panel">
        <div className="xml-sistema">
          <div className="xml-sistema-text">
            <h2>Lotes del sistema</h2>
            <p>
              {lotesSistema.length > 0
                ? 'Elegí un lote: «Traer» usa los XML ya descargados (vía Drive) y «Descarga directa» los baja ahora por la extensión. «Actualizar» es el refresco de la lista.'
                : 'Todavía no aparecen lotes. Tocá Actualizar; si ya creaste uno y sigue vacío, revisamos la instalación paso a paso.'}
            </p>
            {errorLotes && <p>No se pudo consultar el backend: {errorLotes}</p>}
          </div>

          {lotesSistema.length > 0 && (
            <div className="xml-lote-row">
              <label>
                <span>Lote</span>
                <select
                  className="xml-select"
                  value={loteSistemaSel}
                  onChange={(e) => setLoteSistemaSel(e.target.value)}
                  aria-label="Lote del sistema"
                  disabled={!!directa || trayendo}
                >
                  {lotesSistema.map((l) => (
                    <option key={l.loteId} value={l.loteId}>
                      {l.loteId} · {l.descargados}/{l.totalItems ?? l.total} descargados
                    </option>
                  ))}
                </select>
              </label>
              {loteSelObj && (
                <span className="xml-chip">{({ en_cola: 'En cola', en_proceso: 'Descargando…', completado: 'Completado', completado_con_errores: 'Completado con errores' })[loteSelObj.estado] || loteSelObj.estado}</span>
              )}
            </div>
          )}

<div className="xml-acciones">
            <button type="button" className="xml-btn" onClick={traerDelSistema} disabled={trayendo || actualizando || !!directa || !loteSistemaSel}>
              {trayendo ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
              <span>{trayendo ? 'Trayendo…' : 'Traer XML del lote'}</span>
            </button>
            <button type="button" className="xml-btn" onClick={() => descargarDirecta()} disabled={!!directa || trayendo || actualizando || !loteSistemaSel} title="La extensión descarga los XML de eKuatia por API directa, sin worker ni Drive">
              {directa ? <Loader2 size={16} className="spin" /> : <Zap size={15} />}
              <span>{directa ? `Descargando… ${directa.hechos}/${directa.total || '…'}` : 'Descarga directa'}</span>
            </button>
            <button type="button" className="xml-btn" onClick={refrescarSistema} disabled={trayendo || actualizando || !!directa}>
              <RefreshCw size={15} className={actualizando ? 'spin' : ''} />
              <span>{actualizando ? 'Actualizando…' : 'Actualizar'}</span>
            </button>
          </div>

          {directa ? (
            <div className="xml-progreso" role="status">
              <div className="xml-progreso-head">
                <span>Descarga directa: {directa.hechos} de {directa.total || '…'} facturas</span>
                <span>{directa.total ? `${Math.round(100 * directa.hechos / Math.max(1, directa.total))}%` : ''}</span>
              </div>
              <div className="xml-progreso-bar">
                <div style={{ width: `${directa.total ? Math.min(100, Math.round(100 * directa.hechos / Math.max(1, directa.total))) : 4}%` }} />
              </div>
              <small>La extensión está bajando los XML de eKuatia. Dejá esta pestaña abierta.</small>
            </div>
          ) : loteSelObj && (
            <div className="xml-progreso" role="status">
              <div className="xml-progreso-head">
                <span>{loteSelObj.descargados || 0} de {loteSelObj.totalItems ?? loteSelObj.total ?? 0} facturas descargadas</span>
                <span>{({ en_cola: 'En cola', en_proceso: 'Descargando…', completado: 'Completado', completado_con_errores: 'Completado con errores' })[loteSelObj.estado] || loteSelObj.estado}</span>
              </div>
              <div className="xml-progreso-bar">
                <div style={{ width: `${Math.min(100, Math.round(100 * (loteSelObj.descargados || 0) / Math.max(1, loteSelObj.totalItems ?? loteSelObj.total ?? 1)))}%` }} />
              </div>
              {((loteSelObj.pendientes || 0) > 0 || (loteSelObj.conError || 0) > 0) && (
                <small>{loteSelObj.pendientes || 0} pendiente(s) · {loteSelObj.conError || 0} con error</small>
              )}
            </div>
          )}

        </div>
      </section>

      {sesionExpiraEn && docs.length > 0 && (
        <p className="xml-sesion-chip" role="status">
          Sesión guardada en este equipo · se borra sola en {Math.max(0, Math.ceil((sesionExpiraEn - ahoraTick) / 60000))} min. Lo que ves no se pierde si salís y volvés antes.
        </p>
      )}
      {docs.length > 0 && (
        <div className="xml-explorer">
        <section className="xml-panel xml-rail">
          <div className="xml-list-head">
            <h2>Documentos cargados ({docs.length})</h2>
            <button
              type="button"
              className="xml-btn ghost"
              onClick={() => { setDocs([]); setSelectedId(null); setAviso(''); setError(''); }}
            >
              <Trash2 size={14} />
              <span>Vaciar</span>
            </button>
          </div>
          <ul className="xml-list">
            {docs.map((doc) => (
              <li key={doc.id} ref={(el) => { if (el) railItemRefs.current[doc.id] = el; }} className={selected?.id === doc.id ? 'is-active' : ''}>
                <button type="button" className="xml-list-main" onClick={() => setSelectedId(doc.id)}>
                  <FileCode2 size={17} />
                  <span className="xml-list-text">
                    <strong>{doc.tipoDocumentoNombre} N° {doc.numeroCompleto}</strong>
                    <small>
                      {doc.emisor?.razonSocial} → {doc.receptor?.razonSocial} · {doc.fechaEmision} · {formatMoney(doc, doc.totales?.totalPagar)}
                    </small>
                    <small className="xml-cdc">CDC {doc.cdcFormatted || doc.cdc}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="xml-list-remove"
                  title={`Quitar ${doc.fileName}`}
                  aria-label={`Quitar ${doc.fileName}`}
                  onClick={() => quitarDoc(doc.id)}
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>

      {selected ? (
        <section className="xml-kude-wrap">
          <div className="xml-viewer-bar">
            <button type="button" className="xml-btn xml-nav" onClick={verAnterior} disabled={docs.length < 2} aria-label="Factura anterior">
              <ChevronLeft size={18} />
              <span>Anterior</span>
            </button>
            <div className="xml-viewer-info">
              <strong>Factura {selIndex + 1} de {docs.length}</strong>
              <small>{selected.tipoDocumentoNombre} N° {selected.numeroCompleto} · {formatMoney(selected, selected.totales?.totalPagar)}</small>
            </div>
            <button type="button" className="xml-btn primary xml-print-btn" onClick={() => { setPrintAll(false); setPrinting(true); }}>
              <Printer size={17} />
              <span>Imprimir</span>
            </button>
            <button type="button" className="xml-btn" onClick={() => { setPrintAll(true); setPrinting(true); }} disabled={docs.length < 2}>
              <Printer size={15} />
              <span>Imprimir todo</span>
            </button>
            <button type="button" className="xml-btn xml-nav" onClick={verSiguiente} disabled={docs.length < 2} aria-label="Factura siguiente">
              <span>Siguiente</span>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="xml-kude-scroll">
            <KudeDocument document={selected} id="kude-screen-doc" />
          </div>
          <p className="xml-foot">
            Archivo: {selected.fileName}. La impresión usa solo los datos parseados de este documento válido.
          </p>
        </section>
      ) : (
        <p className="xml-empty">Todavía no cargaste ningún XML válido.</p>
      )}
        </div>
      )}
      {docs.length === 0 && (
        <p className="xml-empty">{trayendo ? 'Trayendo las facturas del lote…' : 'Todavía no cargaste ningún XML válido.'}</p>
      )}

      {directaResumen && (
        <details className="xml-directa-resumen">
          <summary className="xml-directa-head">
            <span>Última descarga directa: {directaResumen.items.filter((r) => r.ok).length}/{directaResumen.items.length} en {directaResumen.duracionSeg.toFixed(0)} s</span>
            <span>{directaResumen.items.filter((r) => r.ok).length ? `${((directaResumen.sumaSeg || 0) / directaResumen.items.filter((r) => r.ok).length).toFixed(1)} s/factura · detalle por CDC` : 'detalle por CDC'}</span>
          </summary>
          <ul>
            {directaResumen.items.map((r) => (
              <li key={r.cdc}>
                <span>…{String(r.cdc).slice(-8)}</span>
                {r.ok
                  ? <span>{r.segTotal} s (token {r.segToken} s) · {(r.bytes / 1024).toFixed(1)} KB</span>
                  : <span className="mal">{r.error || 'Error'}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {printing && selected && createPortal(
        <div className="xml-print">
          {printAll
            ? docs.map((d) => (
              <div className="xml-print-page" key={d.id}>
                <KudeDocument document={d} id={`kude-print-${d.id}`} />
              </div>
            ))
            : <KudeDocument document={selected} id="kude-print-doc" />}
        </div>,
        document.body,
      )}
    </main>
  );
}
