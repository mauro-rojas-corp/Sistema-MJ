// Genera el backend de PRUEBAS (pruebas/backend-pruebas/Codigo-PRUEBAS.gs):
// un solo archivo para pegar en Apps Script, con los tres .gs del proyecto
// (auth, IVA, Marcaciones) + el instalador de datos ficticios.
//
// Único cambio respecto del backend real: la planilla de administración se
// toma de la propiedad ADMIN_SPREADSHEET_ID (la crea el instalador) en vez de
// estar escrita en el código.
//
// Uso:  node pruebas/generar-backend.mjs
// Correrlo de nuevo cada vez que cambie algún AppsScript-*.gs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (f) => readFileSync(join(RAIZ, f), 'utf8');

let auth = leer('AppsScript-Code-auth-PROPUESTA.gs');
const ORIGINAL = 'return SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);';
if (!auth.includes(ORIGINAL)) throw new Error('No se encontró getAdminSpreadsheet en el backend: revisar el generador.');
auth = auth.replace(ORIGINAL,
  "const id = PropertiesService.getScriptProperties().getProperty('ADMIN_SPREADSHEET_ID');\n" +
  "  if (!id) throw new Error('Entorno de pruebas sin instalar: ejecutá instalarEntornoPruebas().');\n" +
  '  return SpreadsheetApp.openById(id);');

const partes = [
  ['AppsScript-Code-auth-PROPUESTA.gs', auth],
  ['AppsScript-Iva.gs', leer('AppsScript-Iva.gs')],
  ['AppsScript-Marcaciones.gs', leer('AppsScript-Marcaciones.gs')],
  ['pruebas/instalador.gs', leer('pruebas/instalador.gs')],
];

const salida =
  '// BACKEND DE PRUEBAS — archivo generado por pruebas/generar-backend.mjs.\n' +
  '// No editar acá: cambiar los AppsScript-*.gs y volver a generar.\n' +
  '// Pegar TODO este contenido en el único archivo (Código.gs) del proyecto\n' +
  '// de Apps Script de pruebas. Primera vez: ejecutar instalarEntornoPruebas().\n\n' +
  partes.map(([nombre, txt]) => '// ===== ' + nombre + ' =====\n' + txt.trimEnd() + '\n').join('\n');

mkdirSync(join(RAIZ, 'pruebas', 'backend-pruebas'), { recursive: true });
writeFileSync(join(RAIZ, 'pruebas', 'backend-pruebas', 'Codigo-PRUEBAS.gs'), salida);
console.log('Backend de pruebas generado: pruebas/backend-pruebas/Codigo-PRUEBAS.gs (' + salida.split('\n').length + ' líneas)');
