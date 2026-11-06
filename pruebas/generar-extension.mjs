// Genera la extensión de PRUEBAS (pruebas/Extension-pruebas/) a partir de la
// extensión real (Extension/). Sólo cambia lo que identifica a la extensión:
//   - nombre: "Ekuatia Login PRUEBAS" (manifest, popup y título del botón)
//   - clave del manifest → ID fijo distinto al de la real
//   - orígenes de la app: localhost + la app de pruebas en Vercel
// Todo lo demás (lógica de Marangatu, IVA, WhatsApp) es el mismo código.
//
// Uso:  node pruebas/generar-extension.mjs [https://url-de-la-app-de-pruebas]
// Correrlo de nuevo cada vez que cambie algo en Extension/.
// Este archivo y la carpeta pruebas/ NO se pasan al repositorio original.
import { cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN_EXT = join(RAIZ, 'Extension');
const DESTINO = join(RAIZ, 'pruebas', 'Extension-pruebas');

const APP_PRUEBAS = new URL(process.argv[2] || 'https://control-total-clientes-pruebas.vercel.app').origin;
const NOMBRE = 'Ekuatia Login PRUEBAS';
// Clave pública propia de la extensión de pruebas. ID resultante:
const ID_PRUEBAS = 'hljageieeeljncgmbbpmkflpdminodom';
const CLAVE_PRUEBAS = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzkJaMVPY5RYXkpl3kBtadQ3IS3yjG17Aw+l+dcI0u+BlOidmPX2fXiXQuhCqrnZIiPV6pA2FZ/PqHro2jUAdlOhUYFmX8ZIXOGHYwtDa+nAWctGYWu9DycrUNDjjYQl4EFyb04Y6dZuUKRbQPgZQXZ9FOq4HCjW/8fbq3JdksPADvVEaiHdEXEcO5vNi7NOHZm57FMxuG5ivxbLJ/JG3T+2zq4r/XHCRkCCNwnulLfgKVXYu/U9y9yhjGN5rC73+VFlOM5E18cl7/O/1TnKxDT7107pGLDAPqop2exowcaa3dN0/MGhj/xJi50q4ikyuT8mwvwc2pEp0RuzHdRg0jQIDAQAB';

const ORIGEN_REAL = 'https://control-total-clientes.vercel.app';

function reemplazar(ruta, cambios) {
  let txt = readFileSync(ruta, 'utf8');
  for (const [buscar, poner] of cambios) {
    if (!txt.includes(buscar)) throw new Error('No se encontró "' + buscar + '" en ' + ruta + ': revisar el generador.');
    txt = txt.split(buscar).join(poner);
  }
  writeFileSync(ruta, txt);
}

if (existsSync(DESTINO)) rmSync(DESTINO, { recursive: true });
cpSync(ORIGEN_EXT, DESTINO, { recursive: true });

// manifest.json
const rutaManifest = join(DESTINO, 'manifest.json');
const m = JSON.parse(readFileSync(rutaManifest, 'utf8'));
m.name = NOMBRE;
m.key = CLAVE_PRUEBAS;
m.description = '[PRUEBAS] ' + m.description;
m.action.default_title = NOMBRE;
m.externally_connectable.matches = ['http://localhost/*', APP_PRUEBAS + '/*'];
writeFileSync(rutaManifest, JSON.stringify(m, null, 2) + '\n');

// Orígenes aceptados por el service worker
reemplazar(join(DESTINO, 'background.js'), [["'" + ORIGEN_REAL + "'", "'" + APP_PRUEBAS + "'"]]);

// Nombre visible en el popup
reemplazar(join(DESTINO, 'popup.html'), [['Ekuatia Login', NOMBRE]]);

writeFileSync(join(DESTINO, 'LEEME-PRUEBAS.txt'),
  'Extensión de PRUEBAS generada automáticamente desde Extension/.\n' +
  'No editar acá: cambiar Extension/ y correr  node pruebas/generar-extension.mjs\n\n' +
  'ID fijo: ' + ID_PRUEBAS + '\n' +
  'Acepta pedidos de: http://localhost:3000 y ' + APP_PRUEBAS + '\n');

console.log('Extensión de pruebas generada en pruebas/Extension-pruebas');
console.log('  ID:        ' + ID_PRUEBAS + '   (VITE_MARANGATU_EXT_ID de la app de pruebas)');
console.log('  App:       ' + APP_PRUEBAS);
