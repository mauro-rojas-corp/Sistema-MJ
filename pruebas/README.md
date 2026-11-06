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
   Si toca Apps Script, se copia el `.gs` al proyecto **de pruebas**.
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

## Las tres piezas separadas

| Pieza | Real | Pruebas |
| ----- | ---- | ------- |
| Código | `MJEstudioContable/Control-Total-Clientes-IVA` | este repositorio |
| App | `https://control-total-clientes.vercel.app` | `https://control-total-clientes-pruebas.vercel.app` |
| Backend | Apps Script y planillas reales | proyecto de Apps Script y **copias** de las planillas |
| Extensión | Ekuatia Login · `dffknnjnidhfldehfalchalikfkjbehm` | Ekuatia Login PRUEBAS · `hljageieeeljncgmbbpmkflpdminodom` |

## Armado (una sola vez)

### 1. Backend de pruebas (Google Drive + Apps Script)

1. En Drive, **Archivo → Hacer una copia** de la planilla de administración
   (la que tiene las pestañas `Planillas`, `Usuarios`, etc.) y de cada
   planilla anual de clientes. Nombralas `PRUEBAS - …`.
2. En la copia de administración, pestaña **`Planillas`**: reemplazá los IDs
   de cada año por los de las **copias** (el ID es la parte de la URL entre
   `/d/` y `/edit`). Si una fila queda apuntando a una planilla real, las
   pruebas escriben en datos reales.
3. En <https://script.google.com>, **Nuevo proyecto**: `Control Total PRUEBAS`.
   Creá tres archivos y pegá `AppsScript-Code-auth-PROPUESTA.gs`,
   `AppsScript-Iva.gs` y `AppsScript-Marcaciones.gs` de este repositorio.
   En el primero, `ADMIN_SPREADSHEET_ID` = ID de la copia de administración.
4. **Configuración del proyecto → Propiedades del script**:
   - `API_TOKEN`: uno **nuevo** (distinto al real).
   - `PIN_PEPPER`: el mismo que el real si querés entrar con los mismos PIN;
     uno nuevo si preferís PIN distintos (hay que volver a darlos de alta).
   - `IVA_SPREADSHEET_ID`: sólo si el real la tiene; con el ID de su copia.
5. **Implementar → Nueva implementación → Aplicación web**, ejecutar como
   *yo*, acceso *cualquier usuario*. Copiá la URL (`…/exec`).

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

- **Marangatu es el portal real de la SET.** Las copias de las planillas
  tienen las Clave MH reales: un login o un Formulario 120 desde la app de
  pruebas actúa sobre la cuenta real del cliente. No presentar nada en
  pruebas.
- **WhatsApp Web es real**: probar el envío con el número propio.
- Las copias de las planillas contienen datos reales de clientes: compartirlas
  sólo con quien hace las pruebas.
