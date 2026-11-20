// ============================================================================
// RECOLECTOR CDC — INTERFAZ (UI) ★ ARCHIVO PARA PERSONALIZAR LA VISTA ★
// ----------------------------------------------------------------------------
// Acá vive SOLO la presentación y los eventos de pantalla:
//   - CONFIG_VISUAL y TEXTOS: colores, etiquetas y mensajes (a gusto).
//   - El estilo CSS, la barra de herramientas y la columna "XML".
//   - Qué pasa al hacer clic en cada botón (usando núcleo + página).
//
// Este archivo NO decide reglas: no valida CDCs (lo hace
// recolectorCdcCore.js) ni sabe cómo es Marangatu por dentro (eso está en
// recolectorCdcPagina.js). Si solo cambiás la vista, la lógica no se rompe.
//
// ⚠️ Para que todo siga enganchado NO renombres:
//   - los atributos data-cdc-ui / data-cdc-accion de los elementos;
//   - las clases eku-cdc-* usadas por los eventos.
//   Todo lo demás visual (valores de CONFIG_VISUAL, CSS, orden de botones,
//   textos) se puede modificar libremente.
// ============================================================================
(() => {
  'use strict';
  if (window !== window.top) return;
  const Core = globalThis.EkuCdcCore;
  const Pagina = globalThis.EkuCdcPagina;
  const Lotes = globalThis.EkuCdcLotes;
  if (!Core || !Pagina || !Lotes) return;

  const fuente = Core.detectarFuente(location.pathname);
  if (!fuente) return;
  if (document.querySelector('[data-cdc-ui="estilos"]')) return;

  // --- Personalización rápida -------------------------------------------------
  const CONFIG_VISUAL = {
    colorAcento: '#0b5394',
    colorColumnaFondo: '#eef6ff',
    colorFilaMarcada: '#d9eaff',
    colorBarraFondo: '#f4f9ff',
    colorBarraBorde: '#bcd7f5',
    colorTextoBarra: '#123d63',
    colorTextoSuave: '#5b7a99',
    radioBordes: '8px',
    escalaCheckbox: 1.25,
  };

  const TEXTOS = {
    etiquetaColumna: 'XML',
    tituloMaestro: 'Marcar/desmarcar los CDC de esta página',
    marcados: 'Marcados:',
    copiar: 'Copiar CDCs',
    marcarTodas: 'Marcar todas las páginas',
    cancelarRecorrido: 'Cancelar recorrido',
    limpiar: 'Limpiar',
    crearLote: 'Crear lote',
    sinMarcados: 'No hay CDCs marcados.',
    copiadosOk: (n) => `✅ ${n} CDC(s) copiados.`,
    errorCopiar: 'No se pudo copiar; revisá el permiso del portapapeles.',
    confirmarLimpiar: '¿Limpiar todos los CDCs marcados?',
    loteCreado: (n) => `✅ Lote creado con ${n} CDC(s).\nQuedó guardado en la extensión: se registra en el sistema cuando Control Clientes sincronice los lotes. La selección se limpió.`,
    loteError: (detalle) => `No se pudo crear el lote: ${detalle}`,
    confirmarTodas: (n) => `Se van a recorrer las ${n} página(s), marcando todos los CDC, y volver a la página 1. ¿Seguir?`,
    sinTotalPaginas: 'No pude leer cuántas páginas tiene el resultado. Probá con el maestro de cada página.',
    recorridoOk: (n, paginas) => `Listo: ${n} CDC(s) marcados en ${paginas} página(s).`,
    recorridoCancelado: (n) => `Recorrido cancelado. Quedaron ${n} CDC(s) marcados.`,
    recorridoError: (mensaje, n) => `El recorrido se detuvo: ${mensaje} Quedan marcados los ${n} CDC(s) ya leídos.`,
    recorriendoPagina: (p, total, n) => `Recorriendo página ${p}/${total} — marcados: ${n}`,
    nombreFuente: fuente === 'FUENTE_REGISTRO_VIRTUAL' ? 'Fuente: Imputar Comprobantes' : 'Fuente: Consultar Registrados',
  };

  // Pausas del recorrido de páginas (sensación tranquila, no ráfaga).
  const PAUSAS = { trasCargarPaginaMs: 700, entrePaginasMs: 900 };
  const STORAGE_KEY = 'ekuCdcSeleccionV1';

  // --- Estado -----------------------------------------------------------------
  const seleccion = Core.crearSeleccion({
    leer: async () => {
      const d = await chrome.storage.session.get(STORAGE_KEY);
      return d[STORAGE_KEY] || [];
    },
    escribir: async (lista) => { await chrome.storage.session.set({ [STORAGE_KEY]: lista }); },
  });

  let listo = false;
  let escaneando = false;
  let reprogramado = false;
  let temporizador = null;
  let recorriendo = false;
  let cancelarRecorrido = false;

  // --- Estilos (todo sale de CONFIG_VISUAL) ------------------------------------
  const style = document.createElement('style');
  style.setAttribute('data-cdc-ui', 'estilos');
  style.textContent = `
    .eku-cdc-th, .eku-cdc-td { text-align: center !important; vertical-align: middle !important; width: 52px; min-width: 52px; background: ${CONFIG_VISUAL.colorColumnaFondo} !important; }
    .eku-cdc-th { font-size: 11px !important; color: ${CONFIG_VISUAL.colorAcento} !important; }
    .eku-cdc-check, .eku-cdc-master { transform: scale(${CONFIG_VISUAL.escalaCheckbox}); cursor: pointer; accent-color: ${CONFIG_VISUAL.colorAcento}; }
    .eku-cdc-fila { background-color: ${CONFIG_VISUAL.colorFilaMarcada} !important; }
    #eku-cdc-barra { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0; padding: 8px 10px; border: 1px solid ${CONFIG_VISUAL.colorBarraBorde}; border-radius: ${CONFIG_VISUAL.radioBordes}; background: ${CONFIG_VISUAL.colorBarraFondo}; font-family: Arial, sans-serif; font-size: 13px; color: ${CONFIG_VISUAL.colorTextoBarra}; }
    #eku-cdc-barra button { border: 1px solid #8db8e8; background: #fff; color: ${CONFIG_VISUAL.colorAcento}; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-weight: 600; }
    #eku-cdc-barra button:hover { background: #e8f2fd; }
    #eku-cdc-barra button:disabled { opacity: .55; cursor: default; }
    #eku-cdc-barra .eku-cdc-fuente { margin-left: auto; font-size: 11px; color: ${CONFIG_VISUAL.colorTextoSuave}; }
    #eku-cdc-barra .eku-cdc-estado { font-size: 12px; color: ${CONFIG_VISUAL.colorAcento}; }
  `;
  document.head.appendChild(style);

  // --- Barra de herramientas ----------------------------------------------------
  function asegurarBarra(tabla) {
    let barra = document.querySelector('[data-cdc-ui="barra"]');
    if (barra) return barra;
    barra = document.createElement('div');
    barra.id = 'eku-cdc-barra';
    barra.setAttribute('data-cdc-ui', 'barra');
    barra.innerHTML = `
      <strong>XML:</strong> <span>${TEXTOS.marcados} <b data-cdc-ui="contador">0</b></span>
      <button type="button" data-cdc-accion="copiar">${TEXTOS.copiar}</button>
      <button type="button" data-cdc-accion="todas">${TEXTOS.marcarTodas}</button>
      <button type="button" data-cdc-accion="limpiar">${TEXTOS.limpiar}</button>
      <button type="button" data-cdc-accion="lote">${TEXTOS.crearLote}</button>
      <span class="eku-cdc-estado" data-cdc-ui="estado"></span>
      <span class="eku-cdc-fuente">${TEXTOS.nombreFuente}</span>`;
    tabla.parentElement.insertBefore(barra, tabla);

    barra.querySelector('[data-cdc-accion="copiar"]').addEventListener('click', accionCopiar);
    barra.querySelector('[data-cdc-accion="limpiar"]').addEventListener('click', accionLimpiar);
    barra.querySelector('[data-cdc-accion="lote"]').addEventListener('click', accionCrearLote);
    barra.querySelector('[data-cdc-accion="todas"]').addEventListener('click', accionMarcarTodas);
    return barra;
  }

  function dibujarBarra() {
    const barra = document.querySelector('[data-cdc-ui="barra"]');
    if (!barra) return;
    const contador = barra.querySelector('[data-cdc-ui="contador"]');
    if (contador) contador.textContent = String(seleccion.cantidad());
  }

  function ponerEstado(texto) {
    const barra = document.querySelector('[data-cdc-ui="barra"]');
    const estado = barra ? barra.querySelector('[data-cdc-ui="estado"]') : null;
    if (estado) estado.textContent = texto || '';
  }

  // --- Acciones de la barra -------------------------------------------------------
  async function accionCopiar() {
    const lista = seleccion.lista().join('\n');
    if (!lista) { alert(TEXTOS.sinMarcados); return; }
    try { await navigator.clipboard.writeText(lista); alert(TEXTOS.copiadosOk(seleccion.cantidad())); }
    catch { alert(TEXTOS.errorCopiar); }
  }

  async function accionCrearLote() {
    const total = seleccion.cantidad();
    if (!total) { alert(TEXTOS.sinMarcados); return; }
    const resp = await Lotes.crear({ fuente, cdcs: seleccion.lista() });
    if (!resp.ok) { alert(TEXTOS.loteError(resp.error || 'error desconocido.')); return; }
    await seleccion.limpiar();
    escanear();
    alert(TEXTOS.loteCreado(resp.total || total));
  }

  async function accionLimpiar() {
    if (!seleccion.cantidad() || !confirm(TEXTOS.confirmarLimpiar)) return;
    await seleccion.limpiar();
    escanear();
  }

  async function accionMarcarTodas() {
    if (recorriendo) { cancelarRecorrido = true; return; }
    const barra = document.querySelector('[data-cdc-ui="barra"]');
    const btn = barra.querySelector('[data-cdc-accion="todas"]');
    const total = Pagina.totalPaginas();
    if (!total) { alert(TEXTOS.sinTotalPaginas); return; }
    if (!confirm(TEXTOS.confirmarTodas(total))) return;

    recorriendo = true; cancelarRecorrido = false;
    btn.textContent = TEXTOS.cancelarRecorrido;
    barra.querySelectorAll('button:not([data-cdc-accion="todas"])').forEach((b) => { b.disabled = true; });
    try {
      if (Pagina.paginaActual() !== 1) {
        await Pagina.irAPagina(1, { alNavegar: escanear, estaCancelado: () => cancelarRecorrido });
      }
      for (let p = 1; p <= total; p += 1) {
        if (cancelarRecorrido) break;
        if (p > 1) await Pagina.irAPagina(p, { alNavegar: escanear, estaCancelado: () => cancelarRecorrido });
        await Pagina.dormir(PAUSAS.trasCargarPaginaMs);
        escanear();
        await seleccion.agregar(Pagina.cdcsPaginaActual());
        escanear();
        ponerEstado(TEXTOS.recorriendoPagina(p, total, seleccion.cantidad()));
        if (p < total) await Pagina.dormir(PAUSAS.entrePaginasMs);
      }
      if (total > 1) {
        try { await Pagina.irAPagina(1, { alNavegar: escanear, estaCancelado: () => false }); } catch { /* queda donde está */ }
      }
      alert(cancelarRecorrido
        ? TEXTOS.recorridoCancelado(seleccion.cantidad())
        : TEXTOS.recorridoOk(seleccion.cantidad(), total));
    } catch (e) {
      alert(TEXTOS.recorridoError(e.message, seleccion.cantidad()));
    } finally {
      recorriendo = false;
      btn.textContent = TEXTOS.marcarTodas;
      barra.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      ponerEstado('');
      escanear();
    }
  }

  // --- Dibujo de la columna en la tabla ------------------------------------------
  function dibujarFila(tr, cdc) {
    let td = tr.querySelector('[data-cdc-ui="celda"]');
    if (!td) {
      td = document.createElement('td');
      td.className = 'eku-cdc-td';
      td.setAttribute('data-cdc-ui', 'celda');
      if (cdc) {
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'eku-cdc-check';
        chk.dataset.cdcValor = cdc;
        chk.title = `CDC ${cdc}`;
        chk.addEventListener('change', () => { void seleccion.alternar(cdc, chk.checked).then(escanear); });
        td.appendChild(chk);
      }
      tr.appendChild(td);
    }
    const chk = td.querySelector('.eku-cdc-check');
    const marcado = !!cdc && seleccion.tiene(cdc);
    if (chk) chk.checked = marcado;
    tr.classList.toggle('eku-cdc-fila', marcado);
  }

  function dibujarEncabezado(tabla) {
    const filasHead = tabla.querySelectorAll('thead tr');
    const headTr = filasHead[filasHead.length - 1];
    if (!headTr) return null;
    let master = headTr.querySelector('.eku-cdc-master');
    if (!master) {
      const th = document.createElement('th');
      th.className = 'eku-cdc-th';
      th.setAttribute('data-cdc-ui', 'celda');
      master = document.createElement('input');
      master.type = 'checkbox';
      master.className = 'eku-cdc-master';
      master.title = TEXTOS.tituloMaestro;
      const label = document.createElement('div');
      label.textContent = TEXTOS.etiquetaColumna;
      th.append(master, label);
      headTr.appendChild(th);
      master.addEventListener('change', async () => {
        const cdcs = Pagina.filasConCdc(tabla).map((f) => f.cdc);
        if (master.checked) await seleccion.agregar(cdcs); else await seleccion.quitar(cdcs);
        escanear();
      });
    }
    const filas = Pagina.filasConCdc(tabla);
    const marcados = filas.filter((f) => seleccion.tiene(f.cdc)).length;
    master.checked = filas.length > 0 && marcados === filas.length;
    master.indeterminate = marcados > 0 && marcados < filas.length;
    return master;
  }

  // --- Escaneo (con freno, como quedó tras el problema de carga) ------------------
  function programarEscaneo() {
    if (temporizador) return;
    temporizador = setTimeout(() => { temporizador = null; escanear(); }, 250);
  }

  function escanear() {
    if (!listo) return;
    if (escaneando) { reprogramado = true; return; }
    escaneando = true;
    try {
      Pagina.tablasResultados().forEach((tabla) => {
        asegurarBarra(tabla);
        dibujarEncabezado(tabla);
        tabla.querySelectorAll('tbody tr').forEach((tr) => dibujarFila(tr, Pagina.cdcDeFila(tr)));
      });
      dibujarBarra();
    } finally {
      escaneando = false;
      if (reprogramado) { reprogramado = false; programarEscaneo(); }
    }
  }

  // Marangatu re-renderiza (búsqueda/paginación): el observador solo agenda.
  const obs = new MutationObserver(() => programarEscaneo());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(programarEscaneo, 1500);

  // Al cambiar la selección (marcar, limpiar, recorrido), volver a dibujar.
  seleccion.alCambiar(() => { if (listo) programarEscaneo(); });

  seleccion.cargar().then(() => { listo = true; escanear(); });
})();
