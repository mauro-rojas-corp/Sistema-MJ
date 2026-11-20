import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useState } from 'react';

const cargarSettingsDialog = () => import('./SettingsDialog');
const SettingsDialog = lazy(cargarSettingsDialog);

// Contenedor del panel de Configuración. El estado «abierto» vive acá y no en
// App: antes, abrir o cerrar Configuración volvía a dibujar toda la app (la
// lista de clientes incluida) y en PCs modestas con la planilla real se
// trababa un momento. App lo abre y cierra con ref.current.setAbierto(bool).
// mustChangePin lo deja abierto sí o sí (PIN temporal).
const SettingsHost = forwardRef(function SettingsHost(
  { mustChangePin = false, pinChangeSubmitting = false, ...props },
  ref
) {
  const [abierto, setAbierto] = useState(false);
  useImperativeHandle(ref, () => ({ setAbierto }), []);

  // El código del panel se baja en segundo plano unos segundos después de
  // cargar la app: la primera vez que se abre ya no espera la descarga.
  useEffect(() => {
    const precargar = () => { cargarSettingsDialog().catch(() => { /* se reintenta al abrir */ }); };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(precargar, { timeout: 8000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = setTimeout(precargar, 3000);
    return () => clearTimeout(t);
  }, []);

  if (!abierto && !mustChangePin) return null;
  return (
    <Suspense fallback={null}>
      <SettingsDialog
        key={mustChangePin ? 'settings-must-change-pin' : 'settings-open'}
        open
        mustChangePin={mustChangePin}
        submitting={pinChangeSubmitting}
        onClose={() => {
          if (!pinChangeSubmitting && !mustChangePin) setAbierto(false);
        }}
        {...props}
      />
    </Suspense>
  );
});

export default SettingsHost;
