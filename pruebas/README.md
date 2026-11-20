# Entorno de pruebas

Este repositorio (`mauro-rojas-corp/Sistema-MJ`) es
una **copia** de `MJEstudioContable/Control-Total-Clientes-IVA` para probar
cambios sin tocar el original. Lo que funciona acá se pasa después al
original.

> La carpeta `pruebas/` es sólo de este entorno: **nunca** se pasa al
> repositorio original.

## Cómo trabajamos

1. **Pedido:** Mauro indica qué modificar.
2. **Cambio:** Claude lo hace en `main` de este repositorio, en uno o más
   commits que empiezan con `[CAMBIO-n]` (ej. `[CAMBIO-3] IVA: …`), y anota
   el cambio en la tabla de abajo como *En prueba*.
3. **Prueba:** Vercel publica solo la app de pruebas. Si el cambio toca la
   extensión, se regenera `pruebas/Extension-pruebas` y se recarga en Chrome.
   Si toca Apps Script, se regenera `pruebas/backend-pruebas/Codigo-PRUEBAS.gs`
   y se pega en el proyecto **de pruebas** (ver abajo).
4. **Aprobación:** si anda, el cambio pasa a *Aprobado*; si no, se corrige
   en un commit nuevo con el mismo `[CAMBIO-n]`.
5. **Pase al original:** se llevan los archivos de los commits `[CAMBIO-n]`
   aprobados (nunca `pruebas/`), con alguna de estas vías:
   - Claude abre un pull request en el original, si tiene permiso de
     escritura ahí (app de Claude instalada en `MJEstudioContable`).
   - O Claude entrega la lista de archivos y Mauro los sube con
     **Add file → Upload files**, como hasta ahora.
6. **Original al día:** si alguien sube cambios directamente al original, se
   traen acá antes de seguir (`git fetch` del original + merge) para no
   probar sobre una versión vieja.

### Registro de cambios

| Cambio | Descripción | Estado | Pasado al original |
| ------ | ----------- | ------ | ------------------ |
| —      | Copia inicial del original (`5f250f6`, 05/11/2026) | — | — |
| CAMBIO-1 | Ficha del cliente rediseñada (documentación recibida + aviso al Encargado) y Buzón con campana | En prueba | No |
| CAMBIO-2 | Guía interactiva del sistema (botón «?» y automática la primera vez) | En prueba | No |
| CAMBIO-3 | Sugerencias de los usuarios (lamparita junto al Buzón); el administrador las ve con el nombre | En prueba | No |
| CAMBIO-4 | Ambientación por época (fechas especiales y estaciones), guardada por usuario | En prueba | No |
| CAMBIO-5 | Traído de `Jorgeeayala/Sistema-MJ`: actualizar usuarios en «¿Quién sos?» y columnas parejas en la lista de clientes | En prueba | No |
| CAMBIO-6 | Cada hoja vence el mes siguiente (hoja OCTUBRE → noviembre): ficha, días de retraso y Vencimientos IVA | En prueba | No |
| CAMBIO-7 | Extensión 2.13: flujo del Formulario 120 + ícono MJ y ventana rediseñada (sesión por cliente, cierre de sesión confiable, ventanas como las abre Marangatu, completar al aparecer el formulario) | En prueba | No |
| CAMBIO-8 | Enlace «Sitio web del estudio» (menú lateral, Configuración, ingreso), editable por un administrador | En prueba | No |
| CAMBIO-9 | Sección «Libros IVA»: importar los libros de compras y ventas de SIGA (Excel/CSV) por cliente y mes, y consultarlos | En prueba | No |
| CAMBIO-13 | Mantenimiento (PR #4): cambio del token sin cortes (acepta API_TOKEN y API_TOKEN_ANTERIOR), APK 1.1, PENDIENTES al día | En prueba | No |
| CAMBIO-14 | Aviso diario de vencimientos al grupo contable por Whaticket (PR #5, `AppsScript-AvisoDiario.gs`). Mensaje corto: cantidades por encargado, sólo se nombran los que tienen monto a pagar | En prueba | No |
| CAMBIO-15 | Campo «Timbrado» en la carga de comprobantes del IVA (y columna en el PDF del libro) | En prueba | No |
| CAMBIO-16 | Sección «Comprobantes»: registro de facturas y notas de crédito por cliente y mes (timbrado, RUC con DV, moneda, imputación IVA/IRE/IRP) y botón «Traer al formulario» en el IVA | En prueba | No |
| CAMBIO-17 | Recibos de dinero en «Comprobantes»: emitidos por el cliente o por el estudio (honorarios), numerados solos y en PDF A4 original/duplicado con monto en letras; y recibidos por el cliente | En prueba | No |
| CAMBIO-18 | Importar el «Detalle de comprobantes registrados» de Marangatu (RG 90): al registro de Comprobantes (todos, sin duplicar) y en Libros IVA | En prueba | No |
| CAMBIO-19 | Traído de `Jorgeeayala/Sistema-MJ`: pestaña «XML / KuDE», lotes CDC y descarga directa de XML; extensión 2.15 (en los commits figura como CAMBIO-15) | En prueba (backend CDC nuevo: `AppsScript-CdcLotes.gs`) | No |
| CAMBIO-20 | «Subir documentos»: lectura con Claude de PDF, fotos y planillas de cualquier formato → revisión → registro; aviso para aceptar o rechazar cuando cambia un IVA ya cargado (también al importar libros); se quita «Cargar detalle de comprobantes» del IVA | En prueba | No |
| CAMBIO-21 | Unión con `MJBackendPy/Sistema-Mj` (XML / KuDE, lotes CDC, buscador, extensión 2.15) y lector XML SIFEN integrado en «Subir documentos» y en la pestaña XML («Pasar a Comprobantes») | En prueba | No |

### CAMBIO-1 · Ficha del cliente y Buzón

Archivos: `src/screens/ClientDetail.jsx`, `src/components/BuzonPanel.jsx`,
`src/components/PendingClientOpener.jsx`, `src/hooks/useAvisos.js`,
`src/ui-executive/recepcion-buzon.css`, `src/App.jsx`, `src/api.js`,
`src/utils.js`, `AppsScript-Avisos.gs` (nuevo) y
`AppsScript-Code-auth-PROPUESTA.gs` (2 líneas en `doPost`).
`tools/smoke/server.mjs` suma `PLANILLA=mj` y el Buzón para probar sin Google.

Para probarlo con tu Apps Script:
1. En el proyecto, **+ → Secuencia de comandos** llamada `Avisos` y pegá
   `AppsScript-Avisos.gs`.
2. En `Code.gs`, dentro de `doPost`, justo antes de
   `return errorResponse('Acción desconocida: ' + action, 'UNKNOWN_ACTION');`
   agregá:
   ```
   const avisosResponse = handleAvisosAction(action, body, sessionUser, sessionRole);
   if (avisosResponse) return avisosResponse;
   ```
3. **Implementar → Administrar implementaciones → editar → Nueva versión**.
   La hoja `Avisos` se crea sola en la planilla de administración.
4. En tu PC: `git pull` y `npm run dev`.

Qué revisar:
- Ficha: botones Ventas / Compras / Nota de crédito / Despacho, resumen
  opcional de lo que llegó, Observaciones, fecha automática y
  **Registrar recepción y avisar**. En la planilla deben quedar `✓` (o
  `✓ resumen`), la observación y la fecha del día.
- Se registra aunque el cliente no tenga Encargado (sin aviso).
- Retraso de la documentación (ficha): cada hoja es el mes de los
  documentos y vence el mes siguiente (hoja OCTUBRE → VENC. 0 el 7/11,
  VENC. 3 el 13/11). Los papeles deben llegar hasta ese día; el 8/11 ya es
  1 día de retraso para VENC. 0. Si todavía no
  llegaron, "Documentación pendiente: N días de retraso" (hasta hoy); una
  vez registrada la llegada (columna Fecha), "Llegó con N días de retraso"
  queda fijo en esa fecha. Si llegó a tiempo, no aparece nada. El aviso del
  Buzón dice con cuántos días de retraso llegó.
- Vencimientos IVA: en la lista y en la liquidación, "N días de retraso" para
  cada cliente todavía no presentado cuyo vencimiento ya pasó.
- Color del vencimiento: chip "VENC. n" en la ficha y, al registrar, la fila
  se pinta de B a K en la planilla con el color de ese VENC. configurado en
  Vencimientos IVA. Si la fila no tiene RUC, se usa el color de la columna A.
- Datos del cliente: plegados por defecto, todos editables, Clave MH oculta.
- Buzón: entrar con el usuario Encargado, ver la campana con el número,
  abrir el aviso (queda leído y abre la ficha), filtros y "Marcar todo".


### CAMBIO-2 · Guía interactiva

Archivos: `src/components/GuidedTour.jsx` (nuevo), `src/guia/pasosGuia.jsx`
(nuevo: el texto de cada paso), `src/App.jsx` (botón «?» y apertura) y
`src/ui-executive/recepcion-buzon.css` (estilos `rx-tour-*`). No toca Apps
Script ni la extensión.

Qué revisar:
- La primera vez que cada usuario entra a un período, la guía arranca sola
  (se recuerda por usuario en ese dispositivo).
- Recorre Estadísticas, Clientes, la ficha, Vencimientos IVA y la barra de
  arriba; ADMINISTRADOR y SUPERUSUARIO ven además Asignar y Marcaciones
  (USUARIO: 20 pasos; administradores: 22).
- Oscurece la pantalla e ilumina el elemento del que habla; cambia sola de
  sección. En el celular apunta a la barra de abajo.
- Botones Anterior / Siguiente / Saltar guía, teclas ← → Enter y Esc.
- Al terminar vuelve a Clientes; el botón **?** de la barra la repite.
- Entra de verdad a cada parte: abre la ficha del primer cliente (cabecera y
  Registro de documentación) y su liquidación de IVA (formulario y ficha para
  el cliente), sin cambiar nada, y vuelve sola con «Volver» al seguir o al
  ir hacia atrás. Espera hasta 12 s a que cargue cada sección («Abriendo
  esta parte del sistema…»), pensado para la planilla real de Google.
- En el celular la tarjeta es compacta, va abajo y no tapa lo iluminado.

### CAMBIO-3 · Sugerencias

Archivos: `AppsScript-Sugerencias.gs` (nuevo), `AppsScript-Avisos.gs` (deriva
las acciones `sugerencias*`, así no se toca `Code.gs`),
`src/components/SugerenciasPanel.jsx` y `src/hooks/useSugerencias.js`
(nuevos), `src/App.jsx`, `src/api.js`, `src/guia/pasosGuia.jsx` (paso nuevo),
`src/ui-executive/recepcion-buzon.css` y `tools/smoke/server.mjs`.

Para probarlo con tu Apps Script:
1. **+ → Secuencia de comandos** llamada `Sugerencias` y pegá
   `AppsScript-Sugerencias.gs`.
2. En el archivo `Avisos`, reemplazá todo por el `AppsScript-Avisos.gs` nuevo.
3. **Implementar → Administrar implementaciones → editar → Nueva versión**.
   La hoja `Sugerencias` se crea sola en la planilla de administración.

Qué revisar:
- Lamparita al lado de la campana; abre una ventanita debajo.
- Usuario: elige Recomendación / Fallo / Consejo / Otro, escribe (hasta 1500
  caracteres) y envía. En **Mis sugerencias** ve si quedó Enviada, Vista por
  el administrador o Resuelta. Sólo ve las suyas.
- ADMINISTRADOR y SUPERUSUARIO: número rojo con las nuevas; en **Recibidas**
  ven todas con el nombre de quien la escribió, la fecha y la sección donde
  estaba; filtros Pendientes / Resueltas / Todas y por tipo; **Marcar
  resuelta** y **Reabrir**. Al abrir Recibidas, las nuevas pasan a vistas.
- En la planilla, hoja `Sugerencias`: una fila por sugerencia con usuario,
  rol, tipo, sección, texto, estado y quién la revisó.

### CAMBIO-4 · Ambientación por época

Archivos: `AppsScript-Preferencias.gs` (nuevo), `AppsScript-Avisos.gs` (deriva
las acciones `preferencias*`), `src/ambiente/ambientes.js`,
`src/ambiente/AmbienteIntro.jsx`, `src/ambiente/ambiente.css` y
`src/hooks/useAmbiente.js` (nuevos), `src/App.jsx`,
`src/components/SettingsDialog.jsx`, `src/api.js`, `src/guia/pasosGuia.jsx`
y `tools/smoke/server.mjs` (con `AMBIENTE=navidad` arranca con esa).

Para probarlo con tu Apps Script:
1. **+ → Secuencia de comandos** llamada `Preferencias` y pegá
   `AppsScript-Preferencias.gs`.
2. En el archivo `Avisos`, reemplazá todo por el `AppsScript-Avisos.gs` nuevo.
3. **Implementar → Administrar implementaciones → editar → Nueva versión**.
   La hoja `Preferencias` se crea sola (una fila por usuario).

Qué revisar:
- Configuración → **Ambientación** (un solo selector desplegable; la casilla
  de animación aparece sólo si hay una elegida): Ninguna (por defecto),
  Automática, y a mano: Navidad (1–26/12), Año Nuevo (27/12–2/1), Semana Santa (Ramos a
  Pascua, se calcula cada año), Independencia (10–15/5), San Juan (16–30/6),
  Verano (21/12–20/3), Otoño (21/3–20/6), Invierno (21/6–20/9) y Primavera
  (21/9–20/12). En Automática las fechas especiales ganan a la estación.
- Cambia los acentos (botones, menú), el panel de Estadísticas, un adorno al
  pie de la barra (guirnalda de luces en Navidad, franja tricolor en
  Independencia…) y un saludo «¡Felices fiestas, Nombre!» (en el celular,
  sólo el ícono). Los colores de vencimiento y los estados no cambian.
- Animación al ingresar: pocos copos, hojas o confeti repartidos en toda la
  pantalla (PC y celular) durante unos 6 segundos, sin bloquear la pantalla. Una vez por ingreso (no al recargar),
  se puede apagar y no aparece si el dispositivo pide reducir el movimiento.
  Al elegir una ambientación se muestra como vista previa.
- Se guarda en el usuario: la misma elección en la PC y en el celular; cada
  usuario tiene la suya.

### CAMBIO-5 · Cambios de `Jorgeeayala/Sistema-MJ`

Ese repositorio es una copia de este en el `9c1175b` (06/11) con 3 archivos
propios, que se trajeron tal cual (no los habíamos tocado después):
- `src/screens/NamePicker.jsx`: botón ↻ junto a «¿Quién sos?» que vuelve a
  leer la hoja Usuarios sin perder la lista visible; nombres largos en
  varias líneas.
- `src/styles.css`: estilos de esa pantalla.
- `src/ui-executive/preview.css`: columnas de la lista de clientes con una
  sola plantilla (más parejas y livianas).

### CAMBIO-6 · La hoja es el mes de los documentos

Antes (como en el original) cada hoja era el mes en que vencía: la hoja
OCTUBRE vencía en octubre y abría en Vencimientos IVA el período septiembre.
Ahora la hoja es el mes de los documentos y vence el mes siguiente:
- Hoja OCTUBRE 2026 → período fiscal octubre 2026 → VENC. 0 el 7/11,
  VENC. 3 el 13/11 … VENC. 9 el 25/11.
- Ficha: chip VENC., días de retraso y la llegada (cuenta desde el 1/11).
- Vencimientos IVA abre el período de la hoja («Octubre 2026 · Vence en
  noviembre 2026»); sin hoja elegida abre el mes anterior al actual.
- Las liquidaciones se guardan por período, así que no se mueve ningún dato.

Archivos: `src/iva/ivaCore.js` (`periodoFiscalDeHoja`), `src/iva/IvaModule.jsx`,
`src/screens/ClientDetail.jsx` y `src/guia/pasosGuia.jsx` (texto).

### CAMBIO-7 · Extensión 2.9: flujo del Formulario 120

Archivos: `Extension/` (`background.js`, `sesionBg.js`, `panelContent.js`,
`descargaContent.js`, `descargaBg.js`, `ivaContent.js` nuevo, `manifest.json`,
`README.md`) y los pasos que muestra la app (`src/iva/IvaEditor.jsx`).

Qué se corrigió:
- **Cerrar sesión no se ejecutaba:** `descargaContent.js` contestaba a todos
  los mensajes y tapaba al panel; la extensión creía que no había sesión.
  Además el panel hacía clic en «Salir» antes de responder (la respuesta se
  perdía con el cambio de página).
- **Otro cliente / mismo cliente:** recuerda con qué RUC entró; mismo cliente
  → reutiliza la sesión; otro → cierra la sesión (desde la ventana que tenga
  el menú o con la dirección de salida) y las pestañas del cliente anterior.
- **Cierre de sesión (2.10):** menú principal `/eset/` → «Salir»
  (`/eset/logout`), como en el portal real, y se cierran todas las demás
  ventanas de Marangatu de esa sesión (también desde el panel y la app).
- **Ventanas:** «Presentar Declaración» se abre en la misma ventana o en una
  nueva según el enlace de Marangatu.
- **Contexto del formulario:** `ivaContent.js` corre en todas las ventanas y
  marcos de Marangatu, elige 211 · Mensual · año · mes y espera a que aparezca
  el formulario (después de «Abrir declaración») para completarlo.

- **2.11:** «Salir» al primer intento (la respuesta del clic se perdía con
  el cambio de página) y el botón «Cerrar» de la declaración funciona (la
  ventana la abre la propia página de Marangatu; ventanas emergentes
  permitidas sólo para marangatu.set.gov.py).

- **2.12:** cerrar sesión con UN clic: «Salir» se pulsa apenas aparece (sin
  esperar la carga completa de la página, que en el portal real tarda) y el
  botón del panel queda en «Cerrando sesión…» hasta terminar.

Simulador: `pruebas/extension-sim/flujo-iva.mjs` (ver Extension/README.md).
Probado con un Marangatu simulado (acceso, menú del usuario con «Cerrar
sesión» escondido, «Presentar Declaración» en ventana nueva o en la misma,
formulario en la misma pantalla o en otra ventana, ventana sin menú): cliente
nuevo, mismo cliente, otro cliente desde una ventana sin menú, sesión
iniciada a mano y cierre desde la app.

### CAMBIO-8 · Sitio web del estudio

- Enlace discreto «Sitio web del estudio» (se abre en otra pestaña): al pie
  del menú lateral (PC), en **Configuración → Estudio** (PC y celular) y al
  pie de la pantalla «¿Quién sos?».
- Por defecto `https://mj-estudio-contable.lovable.app`. Un administrador lo
  cambia en **Vencimientos IVA → Colores y feriados → Nombre del estudio →
  Sitio web** (acepta `www.dominio.com.py`; vacío vuelve al de Lovable). Se
  guarda en la configuración de IVA (planilla), sin publicar de nuevo ni
  tocar Apps Script.

Archivos: `src/estudio/` (nuevo), `src/iva/ivaCore.js`, `src/iva/IvaModule.jsx`,
`src/components/DesktopSidebar.jsx`, `src/components/SettingsDialog.jsx`,
`src/screens/NamePicker.jsx`, `src/App.jsx`, `src/guia/pasosGuia.jsx`.

### CAMBIO-9 · Libros IVA (compras y ventas de SIGA)

Sección nueva **Libros IVA** («Libros» en el celular), para todos los usuarios.
- **Importar libro:** el Excel (o CSV) que exporta SIGA desde *Libro Iva
  Compra/Venta → Exportar Consulta*. Detecta compras o ventas, el mes, el
  año y el nombre del cliente del archivo, y propone el cliente de la lista
  (se puede cambiar; avisa si no se parece). Compara los totales leídos con
  la fila TOTAL del archivo antes de guardar. Un libro por cliente + mes +
  tipo: si ya existe, avisa quién lo importó y pregunta si reemplazarlo.
- **Consultar:** cliente + año → los 12 meses con Compras y Ventas (cargado o
  no); al abrir uno: resumen (gravadas, IVA, exentas, total), detalle con
  búsqueda por proveedor/cliente, RUC o documento, fila de totales, anulados
  tachados, cambio Compras ↔ Ventas y descarga en Excel.
- Eliminar: sólo ADMINISTRADOR y SUPERUSUARIO.

Para probarlo con tu Apps Script:
1. **+ → Secuencia de comandos** llamada `Libros` y pegá `AppsScript-Libros.gs`.
2. En `Avisos`, reemplazá todo por el `AppsScript-Avisos.gs` nuevo.
3. **Implementar → Administrar implementaciones → editar → Nueva versión**.
   La hoja `Libros IVA` se crea sola (una fila por libro; el detalle va
   repartido en celdas de hasta 45.000 caracteres).

Archivos: `AppsScript-Libros.gs` (nuevo), `AppsScript-Avisos.gs`,
`src/libros/` (nuevo), `src/api.js`, `src/App.jsx`,
`src/components/DesktopSidebar.jsx`, `src/components/MobileTabBar.jsx`,
`src/guia/pasosGuia.jsx`, `tools/smoke/server.mjs`.

### CAMBIO-19 · XML / KuDE (de Jorgeeayala/Sistema-MJ)

Unificación con el commit `dd191c3` de `Jorgeeayala/Sistema-MJ`
(«Actualizacion De Version Modulo XML/KUDE»), aplicado sobre CAMBIO-13.
Esa copia partía de CAMBIO-1 + lo traído en CAMBIO-5, así que lo único nuevo
era este commit.

- Pestaña «XML / KuDE» (junto a «Libros IVA»): cargar XML SIFEN, ver el KuDE
  e imprimirlo; «Imprimir todo» empaqueta de a 2 facturas cortas por hoja
  Oficio.
- Configuración → «Lotes XML (CDC)»: registrar los lotes de CDC que la
  extensión junta en Marangatu / eKuatia.
- Extensión **2.15** (2.13 de acá con el ícono MJ y la ventana nueva + 2.14 de
  Jorge): recolector de CDC en Marangatu y eKuatia, y descarga directa de XML
  (usa un servicio de captcha con clave propia: pestaña **Descargas** de la
  ventana de la extensión). Acepta las tres apps:
  `control-total-clientes`, `control-total-clientes-iva` y `sistema-mj`.
- Dependencias nuevas: `qrcode`, Tailwind 4 (sólo para `src/xml/xml.css`,
  sin preflight) y TypeScript. Hace falta `npm install`.
- XML de ejemplo para probar el KuDE: `pruebas/xml-kude/factura-prueba.xml`
  (factura de ₲ 131.000).

**Backend de los lotes:** `AppsScript-CdcLotes.gs` es el módulo original del
proyecto de Apps Script (no estaba en ningún repositorio; se sumó el
20/11/2026). Acciones de la app (`cdcCrearLote`, `cdcListarLotes`,
`cdcObtenerItems`, `cdcObtenerXml`, `cdcSubirXml`, `cdcReintentarFallidos`,
`cdcBorrarLote`) y del worker (`cdcTomarLote`, `cdcReportarItem`,
`cdcLiberarLote`). Lotes e ítems en las hojas «CDC Lotes» y «CDC Items» de la
planilla de administración; los XML en la carpeta de Drive «CDC XML
descargados» (hay que ejecutar una vez `autorizarDriveCdc`). El
`AppsScript-Avisos.gs` de este repo ya deriva las acciones `cdc*`.
Pendiente: la pestaña XML en la guía interactiva (`src/guia/pasosGuia.jsx`).

Archivos: `src/xml/` y `src/cdc/` (nuevos), `tsconfig.json`, `package.json`,
`package-lock.json`, `vite.config.js`, `src/App.jsx`, `src/api.js`,
`src/marangatu.js`, `src/styles.css`, `src/components/DesktopSidebar.jsx`,
`src/components/MobileTabBar.jsx`, `src/components/SettingsDialog.jsx`,
`Extension/` (manifest, background, popup y 10 archivos nuevos).

## Las tres piezas separadas

| Pieza | Real | Pruebas |
| ----- | ---- | ------- |
| Código | `MJEstudioContable/Control-Total-Clientes-IVA` | este repositorio |
| App | `https://control-total-clientes.vercel.app` | `https://sistema-mj.vercel.app` |
| Backend | Apps Script y planillas reales | proyecto `Control Total PRUEBAS` y planillas `PRUEBAS - …` con datos ficticios |
| Extensión | Ekuatia Login · `dffknnjnidhfldehfalchalikfkjbehm` | la misma (`Extension/`, ID fijo `dffknnjnidhfldehfalchalikfkjbehm`), que también acepta `https://sistema-mj.vercel.app`. `pruebas/Extension-pruebas` (`hljage…`) queda como alternativa |

## Armado (una sola vez)

### 1. Backend de pruebas (Apps Script, con datos ficticios)

No hace falta acceso a las planillas ni al Apps Script reales: el instalador
crea todo nuevo en tu Google Drive, con clientes inventados.

1. Entrá a <https://script.google.com> con tu cuenta de Google y tocá
   **Nuevo proyecto**. Arriba a la izquierda, renombralo a
   `Control Total PRUEBAS`.
2. En GitHub abrí `pruebas/backend-pruebas/Codigo-PRUEBAS.gs` y tocá el
   botón **Copy raw file** (ícono de copiar, arriba a la derecha del archivo).
3. En Apps Script, en `Código.gs`, borrá lo que haya, pegá y guardá
   (Ctrl+S).
4. En la barra de arriba elegí la función **`instalarEntornoPruebas`** y tocá
   **Ejecutar**. Google pide permisos la primera vez: **Revisar permisos** →
   tu cuenta → *Configuración avanzada* → *Ir a Control Total PRUEBAS* →
   **Permitir** (es tu propio script).
5. En el **Registro de ejecución** aparecen las dos planillas creadas, el
   `VITE_API_TOKEN` y los usuarios. Copiá el token (se vuelve a ver con
   `mostrarDatosEntornoPruebas`).
6. **Implementar → Nueva implementación** → engranaje → **Aplicación web**:
   *Ejecutar como*: **Yo**; *Quién tiene acceso*: **Cualquier usuario**.
   **Implementar** y copiá la **URL de la aplicación web** (termina en `/exec`).

Usuarios de prueba (PIN `1234` para todos): `Super Pruebas` (SUPERUSUARIO),
`Admin Pruebas` (ADMINISTRADOR) y `Usuario Pruebas` (USUARIO).

**Cuando cambia el backend** (`AppsScript-*.gs`): Claude regenera
`Codigo-PRUEBAS.gs`; se vuelve a pegar todo en `Código.gs`, se guarda y
**Implementar → Administrar implementaciones → editar (lápiz) → Versión:
Nueva versión → Implementar**. La URL no cambia. No volver a ejecutar el
instalador.

### 2. App de pruebas (Vercel)

1. En <https://vercel.com/new>, importá
   `mauro-rojas-corp/Sistema-MJ`.
2. Dirección fija: en **Settings → Domains** del proyecto, `sistema-mj.vercel.app`
   (si se cambia, regenerar la extensión con la nueva; ver abajo).
3. **Environment Variables:**
   - `VITE_BACKEND_URL` = URL `…/exec` del Apps Script **de pruebas**
   - `VITE_API_TOKEN` = el `API_TOKEN` **de pruebas**
   - `VITE_MARANGATU_EXT_ID` = `dffknnjnidhfldehfalchalikfkjbehm` (la extensión de `Extension/`)
4. **Deploy.** Usar siempre la dirección fija, no las de cada deploy.

### 3. Extensión de pruebas (Chrome)

Recomendado: un **perfil de Chrome aparte** ("Pruebas"), para que la
extensión real y la de pruebas no actúen las dos sobre Marangatu.

1. En ese perfil, `chrome://extensions` → **Modo de desarrollador** →
   **Cargar descomprimida** → carpeta `pruebas/Extension-pruebas`.
2. Verificá que se llame **Ekuatia Login PRUEBAS** y que el ID sea
   `hljageieeeljncgmbbpmkflpdminodom`.
3. Tras cada cambio en la extensión: `git pull` y **Recargar**.

Para regenerarla (después de tocar `Extension/`, o si cambia la dirección de
la app de pruebas):

```
node pruebas/generar-extension.mjs https://sistema-mj.vercel.app
```

## Ojo: lo que las pruebas NO aíslan

- **Marangatu es el portal real de la SET.** Los clientes de pruebas tienen
  RUC y Clave MH ficticios, así que el login automático falla (es lo
  esperado). Para probar Marangatu de punta a punta hace falta cargar a mano
  en la planilla de pruebas un cliente real: en ese caso se actúa sobre su
  cuenta real, y no se presenta nada.
- **WhatsApp Web es real**: probar el envío con el número propio.
- Las planillas de pruebas quedan en tu Drive: si cargás datos reales en
  ellas, compartirlas sólo con quien hace las pruebas.

### CAMBIO-15 · Timbrado en la carga de comprobantes

- En la ficha del IVA, con «Cargar detalle de comprobantes» activado, cada comprobante tiene ahora el campo **Timbrado**, junto al número.
- El campo acepta solo números (hasta 8). Si se pega con guiones o espacios (`1764-5321`), se limpian solos.
- El timbrado se guarda con el resto del detalle (campo `tb` en el JSON de la liquidación). No hace falta tocar el Apps Script.
- El PDF «Libro de compras y ventas» suma la columna **Timbrado**, entre Comprobante y Cliente/Proveedor.
- Archivos: `src/iva/IvaEditor.jsx`, `src/iva/ivaCore.js`, `src/iva/iva.css`.

### CAMBIO-16 · Registro de comprobantes (etapa 1)

Es la primera etapa del plan para cargar distintos tipos de documento. Cada comprobante se carga **una sola vez** por cliente, y cada impuesto lee de ahí lo que le corresponde.

- **Sección «Comprobantes»:** está en el menú lateral; en el celular aparece como «Comprob.». Se elige el cliente y el mes, y se ven:
  - el resumen del mes: ventas, compras e IVA imputado;
  - filtros por Ventas y Compras, y búsqueda por nombre, RUC, número o timbrado;
  - la tabla de comprobantes, que en el celular se muestra como tarjetas;
  - descarga en Excel.
- **Nuevo comprobante:**
  - **Operación y tipo:** venta o compra; factura o nota de crédito. En las notas de crédito se indica la factura que corrigen.
  - **Datos del documento:** fecha, condición, número (`1-1-123` se completa como `001-001-0000123`) y timbrado.
  - **Contraparte:** RUC y nombre. Si se escribe el RUC sin DV, el dígito verificador se completa solo; si el DV no coincide, aparece un aviso. Los RUC ya usados se sugieren con su nombre.
  - **Montos:** gravado 10%, gravado 5% y exento, con IVA incluido. El IVA y el total se calculan en el momento. Hay una opción para marcar el 5% agrícola.
  - **Moneda:** guaraníes o dólares. En dólares se acepta coma decimal y se pide el tipo de cambio.
  - **Imputación:** a IVA, IRE o IRP-RSP.
  - **«Guardar y cargar otro»:** deja la fecha, la operación y el tipo listos para el siguiente.
  - **Duplicados:** si ya hay un comprobante del mismo mes con el mismo número, timbrado y RUC, avisa y no lo guarda.
  - **Fecha de otro mes:** el comprobante se guarda en ese mes y se avisa antes de guardar.
- **IVA (Formulario 120):** en Vencimientos IVA → cliente aparece el aviso «N comprobantes imputados a IVA en el registro» con el botón **Traer al formulario**. Ese botón:
  - carga las casillas con lo imputado a IVA, incluyendo fecha, número, timbrado y RUC para el libro;
  - pide confirmar si ya había montos cargados, porque los reemplaza.
- **Backend:** archivo nuevo `AppsScript-Comprobantes.gs`, que crea la hoja «Comprobantes» con una fila por cliente y mes.
  - Cada alta, cambio o baja toca **un solo** comprobante, con bloqueo, así dos personas pueden cargar el mismo mes a la vez.
  - Todos los usuarios pueden cargar, editar y borrar. Queda registrado quién cargó y quién modificó cada comprobante.
- **Hay que pegar en Apps Script:** `AppsScript-Comprobantes.gs` (archivo nuevo) y el `AppsScript-Avisos.gs` actualizado. Después, publicar una nueva versión.
- **Otros cambios:**
  - El selector de cliente pasó a `src/comun/` y lo comparten Libros IVA y Comprobantes.
  - `MoneyInput` está ahora en su propio archivo y acepta decimales.
  - En la barra inferior del celular, «Estadísticas» se llama «Métricas» para que entren todas las pestañas.
- **Próximas etapas:**
  - 2 · Recibos de dinero, emitidos y recibidos.
  - 3 · IRP: Formularios 515 y 516 con la misma vista que en Marangatu.
  - 4 · Retenciones, autofacturas e importación RG 90.

### CAMBIO-17 · Recibos de dinero (etapa 2)

- **Dónde está:** en **Comprobantes → Nuevo comprobante**, arriba se elige el tipo: *Factura*, *Nota de crédito* o **Recibo de dinero**.
- **Quién emite el recibo:**
  - **Emitido por el cliente:** el cliente cobra. Se cargan quién paga (RUC y nombre), el monto, el concepto, las facturas que cancela, la forma de pago y el detalle (banco o cheque). La dirección, el teléfono y la ciudad del cliente son opcionales; se recuerdan en ese equipo para el próximo recibo.
  - **Recibido por el cliente:** se registra un recibo que le dieron al cliente, con su número y quién lo emitió.
  - **Emitido por el estudio (honorarios):** el que paga es el propio cliente y se completa solo. Los datos del estudio salen de *Vencimientos IVA → Colores y feriados → Datos del estudio para los recibos* (RUC, dirección, teléfono y ciudad, campos nuevos).
- **Numeración:** los recibos emitidos (por el cliente o por el estudio) se numeran solos al guardar (0000001, 0000002…).
  - Hay un contador por cliente y otro para el estudio, guardados en las propiedades del script (`CP_RECIBO_<RUC>` y `CP_RECIBO_ESTUDIO`).
  - Si se escribe un número a mano, por ejemplo para seguir la numeración de un talonario, se continúa desde ese.
  - Al editar un recibo se conserva su número, y no se permiten números repetidos en el mismo mes.
- **PDF:** con «Guardar y descargar PDF», o después con el ícono de impresora de la lista, se descarga una hoja A4 con **original y duplicado** y una línea de corte entre los dos. Lleva:
  - los datos de quien emite, el número y el monto destacado;
  - «Recibí de», la suma **en letras** (en guaraníes o en dólares con centavos), el concepto, las facturas y la forma de pago;
  - el lugar, la fecha y la línea de firma.
  
  Los datos de quien emite quedan guardados con el recibo, así una reimpresión sale igual que la original.
- **Lista:**
  - Hay una pestaña **Recibos**. Ventas y Compras muestran solo facturas y notas de crédito.
  - Se agrega la tarjeta «Recibos» al resumen.
  - El Excel incluye los recibos.
  - Los recibos **no** cuentan en los totales de ventas y compras ni pasan al Formulario 120.
- **Para que funcione con los datos reales:** pegar el `AppsScript-Comprobantes.gs` nuevo y publicar una nueva versión.

### CAMBIO-18 · Importar el detalle de comprobantes registrados de Marangatu

- **El formato:** es el Excel `DetalleComprobantesRegistrados_….xlsx` que baja de Marangatu (registro de comprobantes, RG 90). Trae una fila por comprobante con informante, informado, tipo de registro, tipo de comprobante, fecha, timbrado, número, CDC, montos gravados con IVA incluido, IVA, exento, total, imputación y comprobante asociado. Las columnas se reconocen por su título, no por su posición.
- **Comprobantes → «Importar de Marangatu»:**
  - Lee el archivo y muestra cuántos comprobantes hay de ventas y de compras, y de qué meses.
  - Compara el IVA calculado con el que trae el archivo.
  - Propone el cliente por el RUC del informante. Si ese RUC no está en la lista, se elige a mano; si no coincide con el cliente elegido, avisa.
  - Muestra una vista previa antes de importar.
  - Importa **todos** los comprobantes, de cualquier mes, cada uno en su mes, con su timbrado, el RUC del informado con el DV calculado, la condición y la imputación IVA/IRE/IRP.
  - Las notas de crédito pasan como NC, con el comprobante asociado. Los demás tipos (autofactura, boleta, ticket…) se cargan como factura, con el tipo original en la nota. El CDC también queda en la nota.
  - Si se vuelve a importar el mismo archivo, **no se duplica**: avisa «N ya estaban».
- **Libros IVA → Importar libro:** además de SIGA, acepta este archivo.
  - Arma el libro de ventas o de compras del mes. Si el archivo trae los dos, se elige con «Libro» y se importa otra vez.
  - Propone el cliente por el RUC del informante.
  - Avisa si el archivo trae comprobantes de otros meses que no entran en ese libro.
- **Backend:** acción nueva `comprobantesImportar`, que guarda en bloque, un mes por escritura, con bloqueo. Hay que pegar el `AppsScript-Comprobantes.gs` nuevo y publicar una nueva versión.
- **Prueba hecha:** con el archivo de ejemplo, 4 facturas de venta de octubre 2026. El IVA calculado coincide con el de Marangatu (Gs. 2.706.400) y el DV de los 4 RUC da bien. Ese archivo **no** se sube al repositorio.

### CAMBIO-20 · Lectura de documentos con Claude y aviso de cambio del IVA

- **Comprobantes → «Subir documentos»** reemplaza al botón «Importar de Marangatu», que ahora está incluido. Se pueden arrastrar **varios archivos a la vez**:
  - **Se leen en la app, sin costo:** el detalle de comprobantes de Marangatu.
  - **Los lee Claude**, a través de `AppsScript-Lectura.gs`: PDF (incluido el KuDE), fotos (JPG, PNG, WEBP; se achican a 2000 px antes de enviarlas), Excel o CSV de cualquier sistema (se convierten a texto en la app) y XML o TXT.
  - Si un archivo falla, se muestra su error y los demás siguen.
- **Cómo decide dónde va cada comprobante:** busca el RUC del emisor y del receptor en la cartera.
  - Si el cliente **emitió**, es una venta (o un recibo emitido).
  - Si **recibió**, es una compra (o un recibo recibido).
  - Si el emisor es el RUC del estudio, es un recibo de honorarios.
  - Si ninguno está en la cartera, usa el cliente elegido en pantalla, o pide elegirlo.
- **Revisión antes de guardar (no se guarda nada sin confirmar):** cada comprobante aparece con su cliente (se puede cambiar), su tipo, número, fecha, contraparte y total.
  - **En rojo** lo que falta (fecha, cliente, monto) o lo repetido entre los archivos subidos. Mientras haya algo en rojo no se puede guardar.
  - **En amarillo** lo que conviene revisar:
    - la lectura es dudosa;
    - el IVA o el total del documento no coincide con lo calculado;
    - el DV del RUC no coincide;
    - falta el timbrado;
    - lo que Claude haya anotado como duda.
  - Con el lápiz se abre el formulario completo para corregir; con la casilla se excluye un comprobante; con la papelera se quita.
  - Al guardar, lo que ya estaba en el registro no se duplica.
- **Aviso de cambio del IVA:** después de guardar documentos (y también al **importar un libro en Libros IVA**, que ahora pasa sus comprobantes al registro), si el cliente **ya tiene el IVA de ese mes cargado** y con el registro cambiaría, aparece un aviso con **Ahora** y **Con el registro** (IVA débito, crédito y resultado).
  - **Aceptar:** se reemplazan las ventas y compras del formulario por las del registro. Los saldos anteriores, las retenciones y los demás datos no se tocan.
  - **Rechazar:** **nada cambia**.
  - Si el IVA figura como presentado, avisa que puede hacer falta rectificar. Si no hay IVA cargado o no cambia nada, no aparece ningún aviso.
- **IVA:** se quitó la casilla «Cargar detalle de comprobantes»; el detalle se carga desde el registro. Los montos que vienen del registro muestran debajo, en gris, el número y la contraparte.
- **Backend nuevo, `AppsScript-Lectura.gs`:** la acción `lecturaDocumento` usa la clave, el límite diario y la hoja «Agente Uso» del módulo Agente, y pide a Claude una respuesta con formato JSON fijo (`output_config.format`).
  - El modelo es el del asistente (Haiku 5.5), o el que se ponga en la propiedad `LECTURA_MODELO` (por ejemplo `claude-sonnet-5-5` para fotos difíciles).
  - No guarda nada.
- **Hay que pegar:** `AppsScript-Lectura.gs` (nuevo), `AppsScript-Avisos.gs` y `AppsScript-Comprobantes.gs`, y publicar una nueva versión.
- **Pruebas hechas:**
  - Punta a punta en PC y celular con el servidor de prueba (la lectura con IA es simulada), incluidos los dos caminos del aviso (aceptar y rechazar).
  - Importación de un libro con aviso.
  - Simulador del Apps Script de lectura (8/8).
  - **Pendiente:** la lectura real con Claude, que se prueba una vez pegado el backend.

### CAMBIO-21 · Unión con MJBackendPy/Sistema-Mj y lectura de XML de factura electrónica

- **Unión del repositorio:** se trajo `MJBackendPy/Sistema-Mj` (ZIP de `main` del 20/11/2026). Ese repositorio partió de esta copia en el CAMBIO-18. Se unió con un merge de tres vías: lo de allá, más lo de acá (CAMBIO-20, lectura con Claude).
  - **Lo que trajo:**
    - pestaña **XML / KuDE** (`src/xml/`);
    - **lotes CDC** (`src/cdc/` y `AppsScript-CdcLotes.gs`);
    - buscador de Marangatu (`src/components/BuscadorMarangatu.jsx`);
    - `SettingsHost.jsx`;
    - extensión con asistente, recolector de CDC y descarga directa;
    - `tsconfig.json`, `tools/medir-configuracion.js` y la factura de ejemplo `pruebas/xml-kude/factura-prueba.xml` (datos ficticios).
  - **Lo que se borró allá y se acepta:** `metadata.json` (resto de AI Studio, sin uso) y `pruebas/Extension-pruebas/logo.png`.
  - **Conflictos:** solo en el registro, el generador del backend (se incluyen los dos módulos nuevos, Lectura y CdcLotes) y el backend combinado (regenerado).
  - Su «CAMBIO-19» (XML / KuDE) conserva el número; la lectura con Claude pasa a **CAMBIO-20**.
  - Hay dependencias nuevas, así que hace falta `npm install`. Vercel lo hace solo.
- **Lector XML unificado:**
  - En **Comprobantes → Subir documentos**, los **XML de factura electrónica SIFEN** (también los lotes con varias) se leen con el lector de la pestaña XML (`parseXmlToKudeMultiple`), **en la app, exactos y sin costo**. Se toman fecha, número, timbrado, CDC, condición, moneda y cambio, emisor y receptor con su DV, gravado 10% y 5% con IVA, exento, IVA y total. Después siguen la misma asignación de cliente por RUC, la misma revisión y el mismo aviso del IVA.
  - Las notas de remisión no tienen montos fiscales: se informan y no se cargan.
  - Un XML que no sea SIFEN lo lee Claude.
- **Pestaña XML / KuDE:** botón nuevo **«Pasar a Comprobantes»**. Manda las facturas cargadas a la misma pantalla de revisión, que guarda en el registro sin duplicar y avisa si cambia un IVA ya cargado.
- **Prueba hecha:**
  - Con `factura-prueba.xml`: Gs. 131.000, 110.000 al 10% y 21.000 al 5%, timbrado 17234567, fecha 15/01/2024, por los dos caminos. Al subirla de nuevo, detecta «1 ya estaban».
  - Se repitió la prueba completa de CAMBIO-20 (subir, revisar, aviso y aceptar), sin errores.
- **Para el backend real:** pegar también `AppsScript-CdcLotes.gs` si todavía no está en el proyecto de Apps Script. El `AppsScript-Avisos.gs` de este repositorio ya deriva `cdc*`, `lectura*` y `comprobantes*`.
