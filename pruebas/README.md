# Entorno de pruebas

Este repositorio (`mauro-rojas-corp/control-total-clientes-iva-pruebas`) es
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
- Al registrar, la fila del cliente se pinta de B a K con el color del
  Vencimiento (columna A). El color se toma del relleno de A; si A no tiene
  relleno, de una regla de formato condicional sobre A; si no, de otra fila
  con el mismo vencimiento. Si no hay color, se registra igual y se avisa.
- Datos del cliente: plegados por defecto, todos editables, Clave MH oculta.
- Buzón: entrar con el usuario Encargado, ver la campana con el número,
  abrir el aviso (queda leído y abre la ficha), filtros y "Marcar todo".


## Las tres piezas separadas

| Pieza | Real | Pruebas |
| ----- | ---- | ------- |
| Código | `MJEstudioContable/Control-Total-Clientes-IVA` | este repositorio |
| App | `https://control-total-clientes.vercel.app` | `https://control-total-clientes-pruebas.vercel.app` |
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
   `mauro-rojas-corp/control-total-clientes-iva-pruebas`.
2. **Project name:** `control-total-clientes-pruebas` (así la dirección es
   `https://control-total-clientes-pruebas.vercel.app`; si Vercel da otra,
   avisá para regenerar la extensión con esa).
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
node pruebas/generar-extension.mjs https://control-total-clientes-pruebas.vercel.app
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
