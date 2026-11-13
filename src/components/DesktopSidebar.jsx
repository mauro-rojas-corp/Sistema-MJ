import { BarChart3, BookOpen, Clock, Receipt, UserCog, Users } from 'lucide-react';
import SitioWebLink from '../estudio/SitioWebLink';

const ITEMS = [
  { id: 'stats', label: 'Estadísticas', description: 'Avance y métricas', Icon: BarChart3 },
  { id: 'clients', label: 'Clientes', description: 'Cartera del período', Icon: Users },
  { id: 'iva', label: 'Vencimientos IVA', description: 'Liquidación y ficha', Icon: Receipt },
  { id: 'libros', label: 'Libros IVA', description: 'Compras y ventas', Icon: BookOpen },
  { id: 'assign', label: 'Asignar clientes', description: 'Equipo y reparto', Icon: UserCog, requiresAssign: true },
  // requiresAssign = sólo ADMINISTRADOR y SUPERUSUARIO (misma regla que 'Asignar clientes').
  { id: 'marcaciones', label: 'Marcaciones', description: 'Horas a favor y en contra', Icon: Clock, requiresAssign: true },
];

export default function DesktopSidebar({ activeTab, canAssignClients, onChange, sitioWeb }) {
  return (
    <aside className="real-exec-desktop-sidebar" aria-label="Secciones del período">
      <span className="real-exec-sidebar-eyebrow">PERÍODO ACTUAL</span>
      {ITEMS.filter((item) => !item.requiresAssign || canAssignClients).map(
        ({ id, label, description, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              className={active ? 'is-active' : ''}
              aria-current={active ? 'page' : undefined}
              onClick={() => onChange(id)}
            >
              <Icon size={19} />
              <span><strong>{label}</strong><small>{description}</small></span>
            </button>
          );
        }
      )}
      {sitioWeb && (
        <div className="real-exec-sidebar-foot">
          <SitioWebLink url={sitioWeb} variante="sidebar" />
        </div>
      )}
    </aside>
  );
}
