// ============================================================================
// eKuatia — ADAPTADOR DE PÁGINA (portal de consultas)
// ----------------------------------------------------------------------------
// Solo conoce el DOM del portal: dónde está el campo del CDC, el botón
// Consultar y el botón Descargar XML, y cómo reconocer que el captcha ya
// resolvió y que el resultado cargó. Sin estilos ni decisiones de negocio.
// Si el portal cambia su HTML, se toca acá.
// ============================================================================
(() => {
  'use strict';
  if (globalThis.EkuEkuatiaPagina) return;

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (e) => !!(e && (e.offsetParent !== null || (e.getClientRects && e.getClientRects().length)));
  const texto = (e) => String((e && (e.innerText || e.value || e.title)) || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  function campoCdc() {
    const inputs = [...document.querySelectorAll('input')]
      .filter(visible)
      .filter((i) => !['file', 'hidden', 'checkbox', 'radio', 'submit', 'button', 'image'].includes(String(i.type || 'text').toLowerCase()));
    return inputs.find((i) => /cdc/i.test(`${i.name || ''} ${i.id || ''} ${i.placeholder || ''}`)) || inputs[0] || null;
  }

  function escribirCdc(input, cdc) {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, cdc); else input.value = cdc;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: cdc }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function botonPorTexto(buscar, exacto = false) {
    const candidatos = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]')]
      .filter(visible);
    return candidatos.find((e) => {
      const t = texto(e);
      return exacto ? t === buscar : t.includes(buscar);
    }) || null;
  }

  const botonConsultar = () => botonPorTexto('consultar', true) || botonPorTexto('consultar');
  const botonDescargarXml = () => botonPorTexto('descargar xml');

  // La señal que deja CaptchaRaptor al resolver: el token del reCAPTCHA
  // cargado en el campo oculto de la página. No se toca el captcha.
  function tokenCaptcha() {
    const campo = document.querySelector('textarea[name="g-recaptcha-response"], #g-recaptcha-response');
    return String((campo && campo.value) || '').trim();
  }

  function captchaResuelto() {
    return tokenCaptcha().length > 50;
  }

  async function esperarCaptcha(timeoutMs = 180000) {
    const limite = Date.now() + timeoutMs;
    while (Date.now() < limite) {
      if (captchaResuelto()) return true;
      await dormir(600);
    }
    return false;
  }

  function errorVisible() {
    const t = texto(document.body);
    if (/no se encontro|no existe|sin resultados|no registra/.test(t)) return 'El portal no encontró el CDC.';
    if (/captcha invalido|verificacion.*fall|vuelva a intentar/.test(t)) return 'El portal rechazó la verificación del captcha.';
    return null;
  }

  async function esperarResultado(cdc, timeoutMs = 60000) {
    const limite = Date.now() + timeoutMs;
    while (Date.now() < limite) {
      if (botonDescargarXml()) return { ok: true };
      const err = errorVisible();
      if (err && location.pathname.includes(cdc)) return { ok: false, error: err };
      await dormir(500);
    }
    const err = errorVisible();
    return { ok: false, error: err || 'El resultado tardó demasiado en cargar.' };
  }

  globalThis.EkuEkuatiaPagina = {
    dormir,
    campoCdc,
    escribirCdc,
    botonConsultar,
    botonDescargarXml,
    tokenCaptcha,
    captchaResuelto,
    esperarCaptcha,
    esperarResultado,
  };
})();
