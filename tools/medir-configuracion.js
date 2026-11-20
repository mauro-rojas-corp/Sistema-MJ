// Medición del panel de Configuración en el sistema real.
// Uso: con el sistema abierto en la lista de clientes, F12 → Console, pegar
// TODO este archivo y Enter. Al terminar copia el resultado al portapapeles.
// No cambia nada: abre y cierra Configuración 3 veces y mide.
(async () => {
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const dosCuadros = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const tareasLargas = [];
  let obs = null;
  try {
    obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => tareasLargas.push(Math.round(e.duration))));
    obs.observe({ type: 'longtask', buffered: false });
  } catch { /* sin longtask */ }

  // ¿Qué versión está corriendo?
  const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.src).filter((s) => s.includes('/assets/'));
  let versionNueva = false;
  for (const s of scripts) {
    try { if ((await fetch(s).then((r) => r.text())).includes('setAbierto')) versionNueva = true; } catch { /* sigue */ }
  }

  const boton = document.querySelector('[aria-label="Abrir configuración"]');
  if (!boton) { console.log('No encontré el botón de Configuración. Entrá a la lista de clientes y probá de nuevo.'); return; }

  const vueltas = [];
  for (let i = 0; i < 3; i++) {
    tareasLargas.length = 0;
    const t0 = performance.now();
    boton.click();
    let n = 0;
    while (!document.querySelector('.settings-modal') && n < 400) { await esperar(5); n++; }
    const montado = Math.round(performance.now() - t0);
    await dosCuadros();
    const pintado = Math.round(performance.now() - t0);
    await esperar(400);
    const tareasAbrir = [...tareasLargas];
    tareasLargas.length = 0;
    const t1 = performance.now();
    document.querySelector('.settings-modal .team-modal-close')?.click();
    await dosCuadros();
    const cerrar = Math.round(performance.now() - t1);
    await esperar(400);
    vueltas.push({ montadoMs: montado, pintadoMs: pintado, cerrarMs: cerrar, tareasLargasAbrir: tareasAbrir, tareasLargasCerrar: [...tareasLargas] });
  }
  obs?.disconnect();

  const conBlur = [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el);
    return (cs.backdropFilter && cs.backdropFilter !== 'none') || /blur/.test(cs.filter || '');
  }).map((el) => (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName)).slice(0, 15);

  const resultado = {
    versionNueva,
    serviceWorker: !!navigator.serviceWorker?.controller,
    vueltas,
    nodosDOM: document.getElementsByTagName('*').length,
    filasClientes: document.querySelectorAll('.real-exec-row').length,
    ambiente: document.querySelector('[data-ambiente]')?.getAttribute('data-ambiente') || 'ninguna',
    animacionesActivas: document.getAnimations().length,
    elementosConBlur: conBlur,
    pantalla: `${innerWidth}x${innerHeight} @${devicePixelRatio}`,
    nucleos: navigator.hardwareConcurrency,
  };
  console.log(resultado);
  try { await navigator.clipboard.writeText(JSON.stringify(resultado, null, 2)); console.log('Resultado copiado: pegalo en el chat.'); }
  catch { console.log('Copiá el objeto de arriba y pegalo en el chat.'); }
})();
