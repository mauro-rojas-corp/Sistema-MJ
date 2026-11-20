// ============================================================================
// eKuatia — UI DE PRUEBA (Paso 3, MVP de 1 CDC) ★ personalizable ★
// ----------------------------------------------------------------------------
// Panel mínimo sobre la página de consultas para probar el motor con un
// CDC pegado a mano. Textos y colores arriba; la lógica de la página vive
// en ekuatiaPagina.js y las reglas en recolectorCdcCore.js.
// No renombrar data-ekuatia-ui / data-ekuatia-accion (son los enganches).
// ============================================================================
(() => {
  'use strict';
  if (window !== window.top) return;
  const Core = globalThis.EkuCdcCore;
  const Pagina = globalThis.EkuEkuatiaPagina;
  if (!Core || !Pagina) return;
  if (document.querySelector('[data-ekuatia-ui="panel"]')) return;
  // Solo en el formulario de consulta (si la página ya es un resultado, no).
  if (!Pagina.campoCdc()) return;

  const CONFIG_VISUAL = {
    acento: '#1c7c3c',
    fondo: '#ffffff',
    borde: '#bcd7c3',
    texto: '#17351f',
    radio: '10px',
  };
  const TEXTOS = {
    titulo: 'Descarga XML · prueba de 1 CDC',
    etiqueta: 'CDC de 44 dígitos',
    boton: 'Probar consulta y descargar',
    botonEstricto: 'Prueba estricta: recargar y detectar el OK',
    nota: 'La prueba estricta recarga la página, escribe el CDC apenas aparece el formulario y registra cuándo detecta el OK de CaptchaRaptor antes de tocar Consultar. Si aparece "Guardar como", tocá Guardar.',
    estadoInicial: 'Listo.',
    cdcInvalido: 'El CDC debe tener exactamente 44 dígitos.',
    escribiendo: 'Escribiendo el CDC…',
    esperandoCaptcha: 'Esperando que CaptchaRaptor resuelva (puede tardar)…',
    captchaYaEstaba: 'Captcha ya estaba OK al primer control (no se observó la transición).',
    captchaDetectado: (seg) => `OK de CaptchaRaptor detectado a los ${seg}s. Recién ahora se toca Consultar.`,
    captchaTimeout: 'El captcha no resolvió en 3 minutos. Dejé la página como está.',
    consultando: 'Captcha resuelto. Consultando…',
    sinBotonConsultar: 'No encontré el botón Consultar.',
    descargando: 'Documento encontrado. Descargando el XML…',
    listo: 'Listo: se pidió la descarga del XML. Revisá tu carpeta de Descargas.',
  };

  const style = document.createElement('style');
  style.setAttribute('data-ekuatia-ui', 'estilos');
  style.textContent = `
    [data-ekuatia-ui="panel"] { position: fixed; left: 14px; bottom: 14px; z-index: 2147483646; width: 330px; max-width: calc(100vw - 28px); background: ${CONFIG_VISUAL.fondo}; color: ${CONFIG_VISUAL.texto}; border: 1px solid ${CONFIG_VISUAL.borde}; border-radius: ${CONFIG_VISUAL.radio}; box-shadow: 0 8px 28px rgba(0,0,0,.22); padding: 12px; font-family: Arial, sans-serif; font-size: 13px; }
    [data-ekuatia-ui="panel"] h3 { margin: 0 0 8px; font-size: 13px; color: ${CONFIG_VISUAL.acento}; }
    [data-ekuatia-ui="panel"] label { display: block; font-weight: 600; margin-bottom: 4px; }
    [data-ekuatia-ui="panel"] input { width: 100%; box-sizing: border-box; padding: 7px 8px; border: 1px solid #a9c8ae; border-radius: 6px; font-size: 13px; }
    [data-ekuatia-ui="panel"] button { width: 100%; margin-top: 8px; padding: 8px 10px; border: none; border-radius: 6px; background: ${CONFIG_VISUAL.acento}; color: #fff; font-weight: 700; cursor: pointer; }
    [data-ekuatia-ui="panel"] button:disabled { opacity: .6; cursor: default; }
    [data-ekuatia-ui="panel"] .eku-estado { margin-top: 8px; font-size: 12px; min-height: 16px; }
    [data-ekuatia-ui="panel"] .eku-nota { margin-top: 6px; font-size: 11px; opacity: .75; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.setAttribute('data-ekuatia-ui', 'panel');
  panel.innerHTML = `
    <h3>${TEXTOS.titulo}</h3>
    <label for="eku-test-cdc">${TEXTOS.etiqueta}</label>
    <input id="eku-test-cdc" data-ekuatia-ui="cdc" type="text" inputmode="numeric" autocomplete="off" spellcheck="false">
    <button type="button" data-ekuatia-accion="probar">${TEXTOS.boton}</button>
    <button type="button" data-ekuatia-accion="estricta">${TEXTOS.botonEstricto}</button>
    <div class="eku-estado" data-ekuatia-ui="estado">${TEXTOS.estadoInicial}</div>
    <div class="eku-estado" data-ekuatia-ui="registro" style="white-space:pre-line;opacity:.85;"></div>
    <div class="eku-nota">${TEXTOS.nota}</div>`;
  document.body.appendChild(panel);

  const input = panel.querySelector('[data-ekuatia-ui="cdc"]');
  const boton = panel.querySelector('[data-ekuatia-accion="probar"]');
  const botonEstricto = panel.querySelector('[data-ekuatia-accion="estricta"]');
  const estado = panel.querySelector('[data-ekuatia-ui="estado"]');
  const registro = panel.querySelector('[data-ekuatia-ui="registro"]');
  const ponerEstado = (t) => { estado.textContent = t; };
  const PRUEBA_KEY = 'ekuPruebaEstrictaV1';
  let ejecutando = false;

  function registrar(t0, textoLinea) {
    const seg = ((Date.now() - t0) / 1000).toFixed(1);
    registro.textContent += `${registro.textContent ? '\n' : ''}[${seg}s] ${textoLinea}`;
  }

  async function ejecutarPrueba(cdc, { inicio = Date.now() } = {}) {
    if (ejecutando) return;
    ejecutando = true;
    boton.disabled = true;
    botonEstricto.disabled = true;
    registro.textContent = '';
    try {
      const campo = Pagina.campoCdc();
      if (!campo) throw new Error('No encontré el campo del CDC.');
      ponerEstado(TEXTOS.escribiendo);
      Pagina.escribirCdc(campo, cdc);

      const tokenInicial = Pagina.tokenCaptcha();
      registrar(inicio, tokenInicial
        ? 'CDC escrito. El captcha YA estaba resuelto al primer control.'
        : 'CDC escrito. Captcha todavía sin resolver: esperando el OK.');

      ponerEstado(TEXTOS.esperandoCaptcha);
      const yaEstabaResuelto = Pagina.captchaResuelto();
      const resuelto = await Pagina.esperarCaptcha(180000);
      if (!resuelto) { ponerEstado(TEXTOS.captchaTimeout); return; }
      ponerEstado(yaEstabaResuelto ? TEXTOS.captchaYaEstaba : TEXTOS.captchaDetectado(((Date.now() - inicio) / 1000).toFixed(1)));
      registrar(inicio, yaEstabaResuelto
        ? 'Se acepta el OK preexistente (la transición ocurrió antes del primer control).'
        : 'OK detectado en la página. El clic en Consultar viene después de esta línea.');

      // Por las dudas, el portal pudo re-dibujar el campo durante el captcha.
      const campoActual = Pagina.campoCdc();
      if (campoActual && Core.soloDigitos(campoActual.value) !== cdc) Pagina.escribirCdc(campoActual, cdc);

      const btnConsultar = Pagina.botonConsultar();
      if (!btnConsultar) { ponerEstado(TEXTOS.sinBotonConsultar); return; }
      ponerEstado(TEXTOS.consultando);
      await Pagina.dormir(1200); // asentamiento tras el captcha (ritmo prudente)
      registrar(inicio, 'Click en Consultar.');
      btnConsultar.click();

      const resultado = await Pagina.esperarResultado(cdc, 60000);
      if (!resultado.ok) { ponerEstado(`⚠️ ${resultado.error}`); return; }

      ponerEstado(TEXTOS.descargando);
      registrar(inicio, 'Resultado detectado. Click en Descargar XML.');
      Pagina.botonDescargarXml().click();
      ponerEstado(TEXTOS.listo);
    } catch (e) {
      ponerEstado(`⚠️ ${e.message || 'Error inesperado.'}`);
    } finally {
      ejecutando = false;
      boton.disabled = false;
      botonEstricto.disabled = false;
    }
  }

  boton.addEventListener('click', () => {
    const cdc = Core.soloDigitos(input.value);
    if (!Core.esCdcValido(cdc)) { ponerEstado(TEXTOS.cdcInvalido); return; }
    void ejecutarPrueba(cdc);
  });

  // Prueba estricta: se guarda el pedido en la pestaña y se recarga. Al
  // volver, la prueba arranca sola apenas está el formulario, así el CDC se
  // escribe antes de que CaptchaRaptor termine y la espera del OK queda
  // registrada con tiempos en el panel.
  botonEstricto.addEventListener('click', () => {
    const cdc = Core.soloDigitos(input.value);
    if (!Core.esCdcValido(cdc)) { ponerEstado(TEXTOS.cdcInvalido); return; }
    sessionStorage.setItem(PRUEBA_KEY, JSON.stringify({ cdc, creadoEn: Date.now() }));
    location.reload();
  });

  try {
    const pendiente = JSON.parse(sessionStorage.getItem(PRUEBA_KEY) || 'null');
    if (pendiente && Core.esCdcValido(pendiente.cdc) && Date.now() - pendiente.creadoEn < 2 * 60 * 1000) {
      sessionStorage.removeItem(PRUEBA_KEY);
      input.value = pendiente.cdc;
      setTimeout(() => { void ejecutarPrueba(pendiente.cdc, { inicio: pendiente.creadoEn }); }, 150);
    }
  } catch { /* sin prueba pendiente */ }
})();
