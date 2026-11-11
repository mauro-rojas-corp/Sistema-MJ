// Formulario 120 pendiente: lado página de Marangatu.
//
// Corre en TODAS las ventanas y marcos de Marangatu (también en las ventanas
// que Marangatu abre aparte), porque el formulario puede aparecer en la misma
// pestaña, en otra ventana o dentro de un marco, y a veces se dibuja después
// de cargar la página (cuando la persona toca «Abrir declaración»).
//
// Si la app dejó un Formulario 120 pendiente (background.js lo guarda con
// vencimiento):
//  - en «Presentar Declaración» elige 211 - IVA General · Mensual · año · mes
//    (seleccionarObligacionIva). No toca el botón de continuar: lo decide la
//    persona;
//  - queda mirando la página y, en cuanto aparece el formulario (#C10 y #C44),
//    lo completa UNA vez, sólo en los campos vacíos (completarFormulario120) y
//    avisa el resultado;
//  - en la ventana principal muestra el recuadro con el cliente y el período.
// Nunca presenta la declaración. Las funciones vienen de formulario120.js, que
// se carga antes en el mismo mundo aislado.
/* global completarFormulario120, seleccionarObligacionIva, mostrarReferenciaIva, MAPA_CASILLAS, FORMATO_IMPORTE */
(() => {
  if (window.__ekuIvaContent) return;
  window.__ekuIvaContent = true;

  const esPrincipal = window === window.top;
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  let pendiente = null;
  let seleccionHecha = false;
  let formularioHecho = false;
  let trabajando = false;
  let observador = null;

  const hayFormulario = () => !!(document.getElementById('C10') && document.getElementById('C44'));
  const hayObligacion = () => !!document.querySelector('select[data-ng-model="vm.datos.obligacion"], select[ng-model="vm.datos.obligacion"]');

  function mostrar(resultado) {
    if (!esPrincipal || !pendiente || !document.body) return;
    try { mostrarReferenciaIva({ ...pendiente.ref, resultado: resultado || null }); } catch { /* página sin cuerpo */ }
  }

  async function revisar() {
    if (!pendiente || trabajando) return;
    trabajando = true;
    try {
      if (!seleccionHecha && hayObligacion()) {
        seleccionHecha = true;
        try { await seleccionarObligacionIva(pendiente.ref.anio, pendiente.ref.mes); } catch { /* la persona elige a mano */ }
      }
      if (!formularioHecho && hayFormulario()) {
        formularioHecho = true;
        // El formulario recién dibujado puede seguir armándose: se espera un poco.
        await dormir(700);
        let r = null;
        try {
          r = await completarFormulario120(pendiente.casillas, MAPA_CASILLAS, FORMATO_IMPORTE, pendiente.control, true);
        } catch { r = null; }
        if (r && r.esFormulario) {
          if (esPrincipal) mostrar(r);
          try { chrome.runtime.sendMessage({ action: 'IVA_RESULTADO', resultado: r }).catch(() => {}); } catch { /* extensión recargada */ }
        } else {
          formularioHecho = false; // todavía no estaba completo: se reintenta
        }
      }
      if (formularioHecho && observador) { observador.disconnect(); observador = null; }
    } finally {
      trabajando = false;
    }
  }

  // Resultado de un formulario completado en un marco de esta pestaña.
  if (esPrincipal) {
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (!msg || sender.id !== chrome.runtime.id || msg.action !== 'IVA_MOSTRAR') return false;
      mostrar(msg.resultado);
      return false;
    });
  }

  async function arrancar() {
    let r = null;
    try { r = await chrome.runtime.sendMessage({ action: 'IVA_PENDIENTE_LEER' }); } catch { r = null; }
    if (!r || !r.ok) return;
    pendiente = r;
    if (esPrincipal && !/\/login/i.test(location.pathname)) mostrar(null);
    await revisar();
    if (formularioHecho) return;
    // La página (AngularJS) se arma de a poco: se revisa con cada cambio, con
    // una pausa corta, durante un máximo de 30 minutos.
    let espera = null;
    observador = new MutationObserver(() => {
      if (espera) return;
      espera = setTimeout(() => { espera = null; revisar(); }, 400);
    });
    observador.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { if (observador) { observador.disconnect(); observador = null; } }, 30 * 60 * 1000);
  }

  arrancar();
})();
