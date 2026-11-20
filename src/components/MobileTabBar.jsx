import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, Clock, FileCode2, FileText, Menu, Receipt, UserCog, Users, X } from 'lucide-react';

// Pestañas fijas de la barra inferior (las de uso diario).
const TABS = [
  { id: 'stats', label: 'Métricas', Icon: BarChart3 },
  { id: 'clients', label: 'Clientes', Icon: Users },
  { id: 'iva', label: 'IVA', Icon: Receipt },
  { id: 'comprobantes', label: 'Comprob.', Icon: FileText },
];

// El resto va en el menú ☰ de arriba a la izquierda, con el nombre completo.
const MAS = [
  { id: 'libros', label: 'Libros IVA', description: 'Compras y ventas', Icon: BookOpen },
  { id: 'xml', label: 'XML / KuDE', description: 'Comprobantes e impresión', Icon: FileCode2 },
  { id: 'assign', label: 'Asignar clientes', description: 'Equipo y reparto', Icon: UserCog, requiresAssign: true },
  { id: 'marcaciones', label: 'Marcaciones', description: 'Horas a favor y en contra', Icon: Clock, requiresAssign: true },
];

export default function MobileTabBar({ activeTab, onChange }) {
  return (
    <nav className="real-exec-mobile-tabs" aria-label="Secciones del período">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            className={active ? 'is-active' : ''}
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(id)}
          >
            <Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Botón ☰ de la barra superior (sólo en el teléfono) con el resto de las secciones.
export function MobileMenuButton({ activeTab, canAssignClients, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const mas = MAS.filter((item) => !item.requiresAssign || canAssignClients);
  const enMas = mas.some((item) => item.id === activeTab);

  // Si se cambia de sección desde la barra inferior, el menú se cierra.
  useEffect(() => {
    setAbierto(false);
  }, [activeTab]);

  useEffect(() => {
    if (!abierto) return undefined;
    const alTeclear = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  const elegir = (id) => {
    setAbierto(false);
    onChange(id);
  };

  return (
    <>
      <button
        type="button"
        className={`real-exec-menu-button${enMas || abierto ? ' is-active' : ''}`}
        aria-label="Más secciones"
        title="Más secciones"
        aria-expanded={abierto}
        aria-controls="menu-mas"
        aria-haspopup="menu"
        onClick={() => setAbierto((v) => !v)}
      >
        {abierto ? <X size={19} /> : <Menu size={19} />}
      </button>
      {abierto && (
        <>
          <div className="real-exec-mobile-mas-fondo" onClick={() => setAbierto(false)} aria-hidden="true" />
          <div className="real-exec-mobile-mas" id="menu-mas" role="menu" aria-label="Más secciones">
            {mas.map(({ id, label, description, Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  className={active ? 'is-active' : ''}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => elegir(id)}
                >
                  <Icon size={20} strokeWidth={active ? 2.4 : 1.9} />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
