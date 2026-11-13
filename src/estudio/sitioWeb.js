import { useEffect, useState } from 'react';
import { getIvaConfig } from '../iva/ivaConfigCache';
import { DEFAULT_SITIO_WEB, sitioWeb } from '../iva/ivaCore';

// Página web del estudio contable. Se guarda en la configuración de IVA (la
// cambia un administrador desde Vencimientos IVA → Colores y feriados), así
// que cambiarla cuando se compre el dominio no requiere publicar la app. Una
// copia en este navegador permite mostrarla también antes de ingresar.
const CLAVE = 'ctc:sitio-web:v1';
const oyentes = new Set();

function leerCopia() {
  try {
    return localStorage.getItem(CLAVE) || '';
  } catch {
    return '';
  }
}

let actual = leerCopia() || DEFAULT_SITIO_WEB;

export function fijarSitioWeb(url) {
  const nuevo = url || DEFAULT_SITIO_WEB;
  if (nuevo === actual) return;
  actual = nuevo;
  try {
    localStorage.setItem(CLAVE, nuevo);
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
  oyentes.forEach((fn) => fn(nuevo));
}

// Devuelve la dirección vigente; con sesión iniciada la confirma con la
// configuración guardada en la planilla.
export function useSitioWeb(conSesion = false) {
  const [url, setUrl] = useState(actual);
  useEffect(() => {
    oyentes.add(setUrl);
    return () => oyentes.delete(setUrl);
  }, []);
  useEffect(() => {
    if (!conSesion) return undefined;
    let vigente = true;
    getIvaConfig().then((cfg) => {
      if (vigente) fijarSitioWeb(sitioWeb(cfg));
    });
    return () => {
      vigente = false;
    };
  }, [conSesion]);
  return url;
}

// "https://mj-estudio-contable.lovable.app" → "mj-estudio-contable.lovable.app"
export function sitioWebCorto(url) {
  return String(url || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
}
