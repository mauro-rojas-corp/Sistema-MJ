import { ExternalLink, Globe } from 'lucide-react';
import { sitioWebCorto } from './sitioWeb';
import './sitioWeb.css';

// Enlace a la página del estudio (se abre en otra pestaña).
// variante: 'sidebar' (pie del menú lateral), 'settings' (Configuración) o
// 'pie' (pantalla de ingreso).
export default function SitioWebLink({ url, variante = 'sidebar' }) {
  if (!url) return null;
  return (
    <a
      className={`rx-sitio rx-sitio-${variante}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Abrir la página del estudio (${sitioWebCorto(url)}) en otra pestaña`}
    >
      <Globe size={variante === 'pie' ? 14 : 16} aria-hidden="true" />
      <span className="rx-sitio-texto">
        <strong>{variante === 'sidebar' ? 'Sitio web' : 'Sitio web del estudio'}</strong>
        {variante !== 'pie' && <small>{sitioWebCorto(url)}</small>}
      </span>
      <ExternalLink size={13} aria-hidden="true" className="rx-sitio-ir" />
    </a>
  );
}
