import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Animación corta al ingresar (nieve, hojas, confeti…). Cae unos pocos
// elementos durante ~6 segundos y desaparece sola. No bloquea clics, se
// muestra una vez por ingreso y nunca si el dispositivo pide reducir el
// movimiento.

const DURACION_MS = 7000;

function preparar(particula, angosta) {
  const base = particula.cantidad || (angosta ? 12 : 20);
  // Franjas parejas a lo ancho, en orden mezclado (no de izquierda a derecha).
  const franjas = Array.from({ length: base }, (_, i) => i).sort(() => Math.random() - 0.5);
  const lista = [];
  for (let i = 0; i < base; i++) {
    const item = {
      id: i,
      left: ((franjas[i] + 0.15 + Math.random() * 0.7) / base) * 100,
      // Algunas arrancan ya a mitad de camino (demora negativa): la pantalla
      // se llena pareja desde el primer momento, no sólo arriba.
      delay: -3.6 + Math.random() * 5,
      dur: 5 + Math.random() * 2,
      size: 12 + Math.random() * 9,
      sway: (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 30),
      rot: Math.round(Math.random() * 360),
    };
    if (particula.simbolos) item.simbolo = particula.simbolos[i % particula.simbolos.length];
    if (particula.confeti) item.color = particula.confeti[i % particula.confeti.length];
    if (particula.brasas) item.color = particula.brasas[i % particula.brasas.length];
    lista.push(item);
  }
  return lista;
}

export default function AmbienteIntro({ ambiente, onFin }) {
  const [items] = useState(() => preparar(ambiente.particula, window.innerWidth < 640));
  const { direccion = 'cae', confeti, brasas } = ambiente.particula;
  const tipo = confeti ? 'confeti' : brasas ? 'brasa' : 'simbolo';

  useEffect(() => {
    const t = setTimeout(onFin, DURACION_MS);
    return () => clearTimeout(t);
  }, [onFin]);

  // En document.body: cubre toda la pantalla aunque la app se desplace o
  // algún contenedor tenga efectos (en la PC y en el celular).
  return createPortal(
    <div className={`rx-amb-intro is-${direccion}`} aria-hidden="true">
      {items.map((p) => (
        <span
          key={p.id}
          className={`rx-amb-p is-${tipo}`}
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            '--sway': `${p.sway}px`,
            '--rot': `${p.rot}deg`,
            '--c': p.color,
          }}
        >
          {p.simbolo || ''}
        </span>
      ))}
    </div>,
    document.body
  );
}
