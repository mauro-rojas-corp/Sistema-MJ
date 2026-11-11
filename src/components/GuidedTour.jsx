import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

// Guía interactiva paso a paso (como el tutorial de un juego): oscurece la
// pantalla, ilumina el elemento del que habla cada paso y muestra una tarjeta
// con la explicación. Si el elemento no está en pantalla (por ejemplo, en el
// celular o por el rol del usuario), la tarjeta se muestra centrada.
//
// steps: [{ id, title, body,
//   target?: selector CSS del elemento a iluminar,
//   tab?: sección a abrir antes del paso,
//   mantener?: si ya está en esa sección, no la reinicia (no cierra la
//     ficha ni la liquidación abiertas),
//   salir?: selector de un botón «Volver» a tocar si está a la vista (para
//     salir de una pantalla abierta en el paso anterior),
//   abrir?: selector a tocar si el elemento todavía no está (por ejemplo,
//     el primer cliente de la lista para mostrar su ficha) }]
// onNavigate(tab, mantener): la app cambia de sección antes del paso.

const MARGEN = 8; // aire alrededor del elemento iluminado
// Con la planilla real cada sección puede tardar varios segundos en cargar:
// la guía espera hasta este tiempo antes de mostrar la tarjeta sin foco.
const ESPERA_MAX_MS = 12000;

function buscarVisible(selector) {
  if (!selector) return null;
  const candidatos = Array.from(document.querySelectorAll(selector));
  return (
    candidatos.find((el) => {
      const r = el.getBoundingClientRect();
      const st = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    }) || null
  );
}

// Desplaza la página para que el elemento y la tarjeta entren juntos: si ya
// está a la vista con lugar arriba o abajo para la tarjeta, no se mueve.
function acomodar(el, alturaTarjeta) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const celular = window.innerWidth < 560;
  // En el celular la tarjeta va abajo (máx. ~48 % de la pantalla): el
  // elemento se lleva arriba, justo debajo de la barra.
  const arriba = celular ? 66 : 96;
  const necesita = (celular ? Math.min(alturaTarjeta, vh * 0.48) : alturaTarjeta) + 40;
  const visible = r.top >= arriba - 10 && r.bottom <= vh;
  if (visible && (vh - r.bottom >= necesita || (!celular && r.top >= necesita))) return;
  // Elemento arriba y la tarjeta debajo; si es muy alto, se ve su comienzo.
  window.scrollBy({ top: r.top - arriba, behavior: 'auto' });
}

export default function GuidedTour({ steps, onNavigate, onClose }) {
  const [index, setIndex] = useState(0);
  // Rectángulo del elemento iluminado, guardado junto al paso al que
  // corresponde: al cambiar de paso, el del anterior deja de valer solo.
  const [spot, setSpot] = useState({ index: -1, rect: null });
  const rect = spot.index === index ? spot.rect : null;
  const buscando = Boolean(steps[index]?.target) && spot.index !== index;
  const [cardStyle, setCardStyle] = useState({});
  const cardRef = useRef(null);
  const elementRef = useRef(null);
  const step = steps[index];
  const total = steps.length;
  const ultimo = index === total - 1;

  // Navegar a la sección del paso y esperar a que aparezca su elemento.
  useEffect(() => {
    if (!step) return undefined;
    let cancelado = false;
    // Cambiar de sección fuera del efecto, en una tarea aparte.
    const nav = step.tab ? setTimeout(() => !cancelado && onNavigate(step.tab, Boolean(step.mantener)), 0) : null;
    const inicio = Date.now();
    let ultimoClic = 0;
    elementRef.current = null;
    const intentar = () => {
      if (cancelado) return;
      const vencido = Date.now() - inicio > ESPERA_MAX_MS;
      // Primero salir de lo que quedó abierto del paso anterior (botón
      // «Volver»); hasta que se cierre, el paso no se muestra.
      const volver = step.salir && buscarVisible(step.salir);
      if (volver && !vencido) {
        if (Date.now() - ultimoClic > 900) {
          ultimoClic = Date.now();
          volver.click();
        }
        setTimeout(intentar, 80);
        return;
      }
      const el = buscarVisible(step.target);
      // Después, abrir lo que el paso muestra (se reintenta cada ~1 s por si
      // la sección todavía estaba cargando).
      if (!el && step.abrir && Date.now() - ultimoClic > 900) {
        const abrir = buscarVisible(step.abrir);
        if (abrir) {
          ultimoClic = Date.now();
          abrir.click();
        }
      }
      if (el || !step.target || vencido) {
        elementRef.current = el;
        if (el) acomodar(el, cardRef.current?.offsetHeight || 420);
        setSpot({ index, rect: el ? el.getBoundingClientRect() : null });
        return;
      }
      setTimeout(intentar, 80);
    };
    const t = setTimeout(intentar, 60);
    return () => {
      cancelado = true;
      clearTimeout(t);
      if (nav) clearTimeout(nav);
    };
  }, [step, index, onNavigate]);

  // Mientras dura la guía, la página tiene lugar de sobra abajo: así siempre
  // se puede subir lo iluminado y dejar espacio para la tarjeta.
  useEffect(() => {
    document.documentElement.classList.add('rx-tour-on');
    return () => document.documentElement.classList.remove('rx-tour-on');
  }, []);

  // Seguir al elemento si la página se desplaza o cambia de tamaño.
  useEffect(() => {
    const actualizar = () => {
      if (elementRef.current && document.contains(elementRef.current)) {
        const r = elementRef.current.getBoundingClientRect();
        setSpot((prev) => (prev.rect ? { ...prev, rect: r } : prev));
      }
    };
    window.addEventListener('resize', actualizar);
    window.addEventListener('scroll', actualizar, true);
    const timer = setInterval(actualizar, 400); // animaciones y cargas
    return () => {
      window.removeEventListener('resize', actualizar);
      window.removeEventListener('scroll', actualizar, true);
      clearInterval(timer);
    };
  }, []);

  // Ubicar la tarjeta debajo o arriba del elemento; centrada si no hay lugar.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = Math.min(380, vw - 24);
    const ch = card.offsetHeight;
    if (!rect || vw < 560) {
      setCardStyle(
        rect && vw < 560
          ? // En el celular: tarjeta abajo o arriba, a lo ancho.
            // (abajo si lo iluminado empieza en la mitad de arriba)
            rect.top > vh * 0.45
            ? { left: 12, right: 12, top: 12 }
            : { left: 12, right: 12, bottom: 12 }
          : { left: (vw - cw) / 2, top: Math.max(12, (vh - ch) / 2), width: cw }
      );
      return;
    }
    const centroY = Math.min(Math.max(12, rect.top + rect.height / 2 - ch / 2), vh - ch - 12);
    let top = rect.bottom + MARGEN + 12;
    let left = rect.left + rect.width / 2 - cw / 2;
    if (top + ch > vh - 12) top = rect.top - MARGEN - 12 - ch;
    if (top < 12) {
      // Elemento alto: la tarjeta va al costado si entra; si no, centrada.
      if (rect.right + MARGEN + 16 + cw <= vw - 12) {
        left = rect.right + MARGEN + 16;
        top = centroY;
      } else if (rect.left - MARGEN - 16 - cw >= 12) {
        left = rect.left - MARGEN - 16 - cw;
        top = centroY;
      } else {
        top = Math.max(12, (vh - ch) / 2);
      }
    }
    left = Math.min(Math.max(12, left), vw - cw - 12);
    setCardStyle({ left, top, width: cw });
  }, [rect, index]);

  const cerrar = useCallback(() => onClose(ultimo ? 'completa' : 'saltada'), [onClose, ultimo]);
  const siguiente = useCallback(() => {
    if (ultimo) onClose('completa');
    else setIndex((i) => Math.min(i + 1, total - 1));
  }, [ultimo, total, onClose]);
  const anterior = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') cerrar();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        siguiente();
      } else if (e.key === 'ArrowLeft') anterior();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cerrar, siguiente, anterior]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  if (!step) return null;

  const foco = rect
    ? {
        top: rect.top - MARGEN,
        left: rect.left - MARGEN,
        width: rect.width + MARGEN * 2,
        height: rect.height + MARGEN * 2,
      }
    : null;

  return (
    <div className="rx-tour" role="presentation">
      {/* Fondo: oscurece todo menos el elemento del paso. */}
      {foco ? (
        <div className="rx-tour-spot" style={foco} aria-hidden="true" />
      ) : (
        <div className="rx-tour-backdrop" aria-hidden="true" />
      )}
      {/* Capa que bloquea clics en la app mientras dura la guía. */}
      <div className="rx-tour-blocker" aria-hidden="true" />

      <div
        ref={cardRef}
        className="rx-tour-card"
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rx-tour-title"
        aria-describedby="rx-tour-body"
        tabIndex={-1}
      >
        <div className="rx-tour-top">
          <span className="rx-tour-count">
            {index + 1} de {total}
          </span>
          <button type="button" className="rx-tour-close" onClick={cerrar} aria-label="Cerrar la guía">
            <X size={18} />
          </button>
        </div>
        {step.emoji && (
          <div className="rx-tour-emoji" aria-hidden="true">
            {step.emoji}
          </div>
        )}
        <h2 id="rx-tour-title">{step.title}</h2>
        {buscando && (
          <div className="rx-tour-loading" role="status">
            <span className="rx-tour-loading-dot" aria-hidden="true" /> Abriendo esta parte del sistema…
          </div>
        )}
        <div id="rx-tour-body" className="rx-tour-body">
          {step.body}
        </div>
        <div className="rx-tour-progress" aria-hidden="true">
          <span style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <div className="rx-tour-actions">
          {index === 0 ? (
            <button type="button" className="rx-tour-link" onClick={cerrar}>
              Saltar guía
            </button>
          ) : (
            <button type="button" className="rx-tour-btn" onClick={anterior}>
              <ArrowLeft size={16} aria-hidden="true" /> Anterior
            </button>
          )}
          <button type="button" className="rx-tour-btn rx-tour-btn-primary" onClick={siguiente}>
            {index === 0 ? 'Empezar' : ultimo ? '¡Listo!' : 'Siguiente'}
            {!ultimo && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}
