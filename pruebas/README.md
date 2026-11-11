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

## Las tres piezas separadas

| Pieza | Real | Pruebas |
| ----- | ---- | ------- |
| Código | `MJEstudioContable/Control-Total-Clientes-IVA` | este repositorio |
| App | `https://control-total-clientes.vercel.app` | `https://sistema-mj.vercel.app` |
| Backend | Apps Script y planillas reales | proyecto `Control Total PRUEBAS` y planillas `PRUEBAS - …` con datos ficticios |
| Extensión | Ekuatia Login · `dffknnjnidhfldehfalchalikfkjbehm` | Ekuatia Login PRUEBAS · `hljageieeeljncgmbbpmkflpdminodom` |

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
   - `VITE_MARANGATU_EXT_ID` = `hljageieeeljncgmbbpmkflpdminodom`
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
