// Contenido de la guía interactiva del sistema (ver GuidedTour.jsx).
// Cada paso: título, explicación, elemento a iluminar (selector CSS) y, si
// hace falta, la sección a la que hay que ir antes de mostrarlo. Los pasos de
// Asignar y Marcaciones sólo se muestran a ADMINISTRADOR y SUPERUSUARIO.

// Recuadro de consejo dentro de un paso (función simple, no componente).
const tip = (contenido) => <div className="rx-tour-tip">{contenido}</div>;

export function construirPasosGuia({ canAssign, isSuper }) {
  const pasos = [
    {
      id: 'bienvenida',
      emoji: '👋',
      title: '¡Bienvenido a Control Clientes!',
      body: (
        <>
          <p>
            En un par de minutos te mostramos cómo funciona el sistema: dónde está cada sección, qué se
            puede hacer en ella y para qué sirve cada botón.
          </p>
          <p>
            Avanzá con <strong>Siguiente</strong> (o la flecha → del teclado). Podés salir cuando quieras
            y volver a ver la guía con el botón <strong>?</strong> de la barra superior.
          </p>
        </>
      ),
    },
    {
      id: 'periodo',
      emoji: '📅',
      title: 'El período con el que trabajás',
      target: '.real-exec-period-button:not(.real-exec-assign-button)',
      body: (
        <>
          <p>
            Todo el sistema trabaja sobre <strong>una hoja mensual</strong> de la planilla de Google (por
            ejemplo, «OCTUBRE 2026»). Este botón muestra la hoja abierta.
          </p>
          <p>Tocalo para cambiar de mes o de año. Los cambios se guardan directo en esa hoja.</p>
        </>
      ),
    },
    {
      id: 'secciones',
      emoji: '🧭',
      title: 'Las secciones del sistema',
      target: '.real-exec-desktop-sidebar, .real-exec-mobile-tabs',
      body: (
        <>
          <p>Desde acá te movés entre las partes del sistema:</p>
          <ul>
            <li><strong>Estadísticas</strong>: cómo viene el mes.</li>
            <li><strong>Clientes</strong>: la cartera del período y la ficha de cada uno.</li>
            <li><strong>Vencimientos IVA</strong> («IVA» en el celular): liquidaciones y fichas para el cliente.</li>
            {canAssign && <li><strong>Asignar clientes</strong>: el reparto entre el equipo.</li>}
            {canAssign && <li><strong>Marcaciones</strong> («Horas» en el celular): horas a favor y en contra del personal.</li>}
          </ul>
          <p>Vamos a recorrerlas una por una.</p>
        </>
      ),
    },

    // ── Estadísticas ─────────────────────────────────────────────────────
    {
      id: 'stats',
      emoji: '📊',
      title: 'Estadísticas: cómo viene el mes',
      tab: 'stats',
      target: '.real-exec-metrics, .real-exec-hero',
      body: (
        <>
          <p>
            Un resumen del período: cuántos <strong>clientes</strong> hay, cuántos están{' '}
            <strong>pendientes</strong>, <strong>presentados</strong> y <strong>archivados</strong>, y el
            porcentaje de avance.
          </p>
          <p>
            También verás la <strong>Prioridad</strong> (los pendientes con vencimiento más cercano) y la
            carga de trabajo de cada integrante del equipo.
          </p>
        </>
      ),
    },
    {
      id: 'stats-calendario',
      emoji: '🗓️',
      title: 'Resumen por vencimiento',
      tab: 'stats',
      target: '.real-exec-summary',
      body: (
        <>
          <p>
            Cada casilla es un <strong>día de vencimiento</strong>: muestra cuántos clientes de ese día
            ya están presentados y cuántos faltan.
          </p>
          {tip(<>Tocá un día para ver en Clientes sólo los clientes que vencen ese día.</>)}
        </>
      ),
    },

    // ── Clientes ─────────────────────────────────────────────────────────
    {
      id: 'clientes-buscar',
      emoji: '🔎',
      title: 'Clientes: buscar y filtrar',
      tab: 'clients',
      target: '.real-exec-search',
      body: (
        <>
          <p>
            Acá está toda la cartera del período. Escribí el <strong>nombre o el RUC</strong> para
            encontrar un cliente al instante.
          </p>
          <p>
            Debajo están los filtros rápidos: <strong>Todos</strong>, <strong>Mis clientes</strong>,{' '}
            <strong>Pendientes</strong>, <strong>Días 1–15</strong> y <strong>Sin asignar</strong>. En{' '}
            <strong>Más filtros</strong> podés filtrar por día de vencimiento, estado o encargado, y
            ordenar A–Z o por vencimiento.
          </p>
        </>
      ),
    },
    {
      id: 'clientes-lista',
      emoji: '📋',
      title: 'La lista de clientes',
      tab: 'clients',
      target: '.real-exec-client-row',
      body: (
        <>
          <p>
            Cada fila muestra el cliente, su <strong>Encargado</strong>, el día en que <strong>vence</strong>{' '}
            y sus estados.
          </p>
          <ul>
            <li>Los íconos de la derecha marcan <strong>Presentado</strong> y <strong>Archivado</strong> con un toque (queda registrado quién lo hizo).</li>
            <li>Tocá el nombre para abrir la <strong>ficha del cliente</strong>.</li>
          </ul>
          {tip(<>Con el botón «Nuevo cliente» agregás un cliente a la hoja del mes.</>)}
        </>
      ),
    },
    {
      id: 'ficha',
      emoji: '🗂️',
      title: 'La ficha del cliente',
      tab: 'clients',
      body: (
        <>
          <p>Al abrir un cliente vas a ver, de arriba hacia abajo:</p>
          <ul>
            <li>
              <strong>Cabecera</strong>: nombre, RUC, una etiqueta <strong>VENC.</strong> con el color de su
              vencimiento y los accesos a <strong>Abrir Marangatu</strong> (entra solo con la extensión
              Ekuatia) y <strong>Liquidación IVA</strong>.
            </li>
            <li>
              <strong>Registro de documentación</strong>: marcá Ventas, Compras, Nota de crédito y
              Despacho a medida que llegan; escribí lo que llegó y apretá <strong>Enter</strong> para
              sumarlo a la lista.
            </li>
            <li>
              <strong>Datos del cliente</strong>: zona, barrio, contacto, teléfono, Clave MH y el resto
              de las columnas, todo editable.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'ficha-registro',
      emoji: '📨',
      title: 'Registrar la documentación',
      tab: 'clients',
      body: (
        <>
          <p>
            Al tocar <strong>Registrar recepción</strong> el sistema guarda los documentos y las
            observaciones, completa la <strong>fecha de hoy</strong> sola y pinta la fila del cliente en la
            planilla (columnas B a K) con el <strong>color de su vencimiento</strong>.
          </p>
          <p>
            Si el cliente tiene otro <strong>Encargado</strong>, le llega un aviso a su Buzón.
          </p>
          {tip(<>
            Los papeles deben llegar hasta el día del vencimiento. Si llegan después, la ficha muestra
            con cuántos <strong>días de retraso</strong> llegaron (ej.: vence el 7/10 y llegan el 10/10 →
            3 días).
          </>)}
        </>
      ),
    },

    // ── Vencimientos IVA ─────────────────────────────────────────────────
    {
      id: 'iva-periodo',
      emoji: '🧾',
      title: 'Vencimientos IVA: el período fiscal',
      tab: 'iva',
      target: '.iva-period',
      body: (
        <>
          <p>
            Esta sección arma la <strong>liquidación de IVA</strong> de cada cliente y la ficha que se le
            envía.
          </p>
          <p>
            Cada hoja corresponde al IVA <strong>del mes anterior</strong>: en la hoja de octubre se liquida
            septiembre, que vence en octubre. Con las flechas cambiás de período.
          </p>
        </>
      ),
    },
    {
      id: 'iva-dias',
      emoji: '🎨',
      title: 'Los días de vencimiento',
      tab: 'iva',
      target: '.iva-strip',
      body: (
        <>
          <p>
            El vencimiento depende del <strong>último dígito del RUC</strong> (sin el DV): es el{' '}
            <strong>VENC.</strong> del cliente. Vence el día <strong>7 + 2 × VENC.</strong>: VENC. 0 el 7,
            VENC. 1 el 9… hasta VENC. 9 el 25.
          </p>
          <p>
            Cada tarjeta es un día, con su color y cuántos clientes están listos. Tocala para ver sólo ese
            día.
          </p>
        </>
      ),
    },
    {
      id: 'iva-lista',
      emoji: '✅',
      title: 'Estados y filtros',
      tab: 'iva',
      target: '.iva-filters',
      body: (
        <>
          <p>Buscá por nombre o RUC y filtrá por estado:</p>
          <ul>
            <li><strong>Sin cargar</strong>: todavía no se empezó la liquidación.</li>
            <li><strong>Pendiente</strong>: cargada, falta enviarla.</li>
            <li><strong>Enviado</strong>: la ficha ya se le mandó al cliente.</li>
            <li><strong>Presentado</strong>: ya se presentó en Marangatu.</li>
          </ul>
          <p>
            En la lista, los clientes que todavía no se presentaron y ya vencieron muestran en rojo los{' '}
            <strong>días de retraso</strong>. Con <strong>Exportar PDF</strong> descargás la lista.
          </p>
        </>
      ),
    },
    {
      id: 'iva-editor',
      emoji: '🧮',
      title: 'La liquidación de cada cliente',
      tab: 'iva',
      target: 'table.iva-rows tbody tr',
      body: (
        <>
          <p>Tocá un cliente de la lista para abrir su liquidación:</p>
          <ul>
            <li>Cargá los montos de <strong>Ventas, Compras</strong> y demás rubros; se calcula sola y se guarda sola.</li>
            <li>Elegí el <strong>Estado</strong> y, si se paga tarde, la fecha de pago para calcular la mora.</li>
            <li>A la derecha ves la <strong>ficha</strong> que recibe el cliente: descargala en imagen o PDF, copiala o enviala por <strong>WhatsApp</strong>.</li>
            <li><strong>Copiar a Marangatu</strong> completa el Formulario 120 con la extensión, y <strong>Descargar formularios</strong> baja los ya presentados.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'iva-ajustes',
      emoji: '⚙️',
      title: 'Colores y feriados',
      tab: 'iva',
      target: '.iva-tabs',
      body: (
        <>
          <p>
            En la pestaña <strong>Colores y feriados</strong> se define el color de cada VENC. (el mismo que
            se usa para pintar la planilla), los feriados, la mora y el nombre del estudio.
          </p>
          {!canAssign && tip(<>Sólo un administrador puede cambiar estos valores.</>)}
        </>
      ),
    },
  ];

  // ── Asignar y Marcaciones (ADMINISTRADOR y SUPERUSUARIO) ─────────────
  if (canAssign) {
    pasos.push(
      {
        id: 'asignar',
        emoji: '🤝',
        title: 'Asignar clientes al equipo',
        tab: 'assign',
        target: '.assign-confirm-box',
        body: (
          <>
            <p>Acá decidís qué Encargado lleva a cada cliente:</p>
            <ul>
              <li>Tocá un integrante del equipo y después los clientes para asignárselos.</li>
              <li><strong>Repartir automático</strong> distribuye los clientes entre los participantes, agrupados por vencimiento.</li>
              <li>Arrastrá a las personas para cambiar el orden del reparto; con <strong>Participantes</strong> elegís quién entra.</li>
              <li><strong>Revertir</strong> deshace los últimos cambios.</li>
            </ul>
          </>
        ),
      },
      {
        id: 'marcaciones',
        emoji: '⏱️',
        title: 'Marcaciones: horas del personal',
        tab: 'marcaciones',
        target: '.mrc-toolbar',
        body: (
          <>
            <p>
              Subí el archivo <strong>.dat del reloj</strong> y el sistema calcula, día a día, las horas{' '}
              <strong>a favor</strong> y <strong>en contra</strong> de cada empleado.
            </p>
            <p>
              Podés corregir una marca que falta, imprimir el detalle y, en la pestaña{' '}
              <strong>Horarios</strong>, definir el horario y la tolerancia de cada persona.
            </p>
          </>
        ),
      }
    );
  }

  // ── Barra superior ─────────────────────────────────────────────────────
  pasos.push(
    {
      id: 'buzon',
      emoji: '🔔',
      title: 'Tu Buzón de avisos',
      tab: 'clients',
      target: '.rx-bell-button',
      body: (
        <>
          <p>
            Cuando alguien registra documentación de un cliente <strong>del que sos Encargado</strong>, te
            llega un aviso acá. El número rojo indica cuántos no leíste.
          </p>
          <p>Tocá un aviso para abrir directamente la ficha de ese cliente.</p>
        </>
      ),
    },
    {
      id: 'sugerencias',
      emoji: '💡',
      title: 'Sugerencias para mejorar',
      tab: 'clients',
      target: '.rx-ideas-button',
      body: (
        <>
          <p>
            ¿Se te ocurrió una mejora, encontraste un <strong>fallo</strong> o tenés un consejo? Tocá la
            lamparita, elegí el tipo, escribilo y enviá.
          </p>
          {canAssign ? (
            <p>
              Como administrador, en <strong>Recibidas</strong> ves todas las sugerencias con el nombre de
              quien la escribió y las marcás como <strong>resueltas</strong>. El número rojo indica las nuevas.
            </p>
          ) : (
            <p>
              La recibe el administrador con tu nombre. En <strong>Mis sugerencias</strong> ves si ya la vio o
              si quedó resuelta.
            </p>
          )}
        </>
      ),
    },
    {
      id: 'configuracion',
      emoji: '🛠️',
      title: 'Configuración',
      target: '.real-exec-settings-button',
      body: (
        <>
          <p>
            Elegí el tema <strong>claro u oscuro</strong>, el <strong>tamaño de texto</strong> y cambiá tu{' '}
            <strong>PIN</strong> de acceso.
          </p>
          {isSuper && (
            <p>
              Como Superusuario, además podés <strong>gestionar usuarios</strong>: dar PIN temporales,
              cerrar sesiones y dar de baja o reactivar personas.
            </p>
          )}
        </>
      ),
    },
    {
      id: 'usuario',
      emoji: '👤',
      title: 'Tu usuario',
      target: '.real-exec-user-button',
      body: (
        <p>
          Muestra quién está usando el sistema y su rol. Tocalo para <strong>cerrar la sesión</strong> y
          entrar con otro usuario. Cada cambio queda registrado con tu nombre.
        </p>
      ),
    },
    {
      id: 'ayuda',
      emoji: '🎉',
      title: '¡Listo para empezar!',
      target: '.rx-help-button',
      body: (
        <>
          <p>Ya conocés todo el sistema. Si en algún momento querés repasar, tocá este botón y la guía empieza de nuevo.</p>
          {tip(<>Consejo: empezá por <strong>Clientes → Mis clientes</strong> para ver lo que tenés asignado.</>)}
        </>
      ),
    }
  );

  return pasos;
}
