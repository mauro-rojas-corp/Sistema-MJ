import { useEffect, useRef } from 'react';
import { useClientsData, useClientsMeta } from '../context/ClientsContext';
import { findClaveMarangatuColumn, normalizeSearchText } from '../utils';
import { conectarBuscadorExtension, openMarangatuLogin } from '../marangatu';

const MAX_RESULTADOS = 8;
const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');

// Atiende el buscador de clientes del ícono de la extensión Ekuatia Login.
// La extensión pregunta por un puerto ('eku-buscador') mientras la app está
// abierta con sesión y un período elegido:
//  - «buscar»: se responde nombre y RUC de los clientes que esta persona ve
//    (los mismos de su lista). NUNCA viaja la clave en la búsqueda.
//  - «entrar»: la app inicia el login igual que el botón Marangatu de la
//    fila (APP_AUTO_LOGIN): la clave sale de la planilla en memoria, va por
//    la mensajería de la extensión y la extensión no la guarda.
// No muestra nada en pantalla.
export default function BuscadorMarangatu() {
  const { headers, nameKey, rucKey } = useClientsMeta();
  const { assignedRows } = useClientsData();

  // El puerto vive mientras la app está abierta; las filas cambian seguido,
  // por eso se leen de una ref y no reabren el puerto.
  const datosRef = useRef({ rows: [], nameKey: null, rucKey: null, claveKey: null });
  useEffect(() => {
    datosRef.current = {
      rows: assignedRows || [],
      nameKey,
      rucKey,
      claveKey: findClaveMarangatuColumn(headers || []),
    };
  }, [assignedRows, headers, nameKey, rucKey]);

  useEffect(() => {
    const buscar = (q) => {
      const { rows, nameKey: nk, rucKey: rk, claveKey } = datosRef.current;
      const texto = normalizeSearchText(q).trim();
      const digitos = soloDigitos(q);
      if (!texto) return [];
      const puntuados = [];
      for (const row of rows) {
        const nombre = normalizeSearchText(nk ? row[nk] : '');
        const ruc = String(rk ? row[rk] ?? '' : '').trim();
        const rucDig = soloDigitos(ruc);
        let puntos = 0;
        if (nombre === texto || (digitos && rucDig === digitos)) puntos += 100;
        if (nombre.startsWith(texto)) puntos += 80;
        if (digitos && rucDig.startsWith(digitos)) puntos += 80;
        if (nombre.includes(texto)) puntos += 50;
        if (digitos.length >= 3 && rucDig.includes(digitos)) puntos += 40;
        if (!puntos) continue;
        puntuados.push({
          puntos,
          ref: row._row,
          nombre: String(nk ? row[nk] ?? '' : '').trim() || 'Sin nombre',
          ruc,
          conClave: Boolean(claveKey && ruc && String(row[claveKey] ?? '').trim()),
        });
      }
      return puntuados
        .sort((a, b) => b.puntos - a.puntos)
        .slice(0, MAX_RESULTADOS)
        .map(({ puntos: _p, ...item }) => item);
    };

    const entrar = (ref, rucEsperado) => {
      const { rows, rucKey: rk, claveKey } = datosRef.current;
      const row = rows.find((r) => r._row === ref);
      if (!row || !rk || !claveKey) return { ok: false, error: 'SIN_CLIENTE' };
      const ruc = String(row[rk] ?? '').trim();
      // La fila pudo cambiar entre la búsqueda y el clic: se confirma el RUC.
      if (soloDigitos(ruc) !== soloDigitos(rucEsperado)) return { ok: false, error: 'SIN_CLIENTE' };
      const pass = String(row[claveKey] ?? '').trim();
      if (!ruc || !pass) return { ok: false, error: 'SIN_CLAVE' };
      openMarangatuLogin({ user: ruc, pass }, (m) => window.alert(m));
      return { ok: true };
    };

    return conectarBuscadorExtension((m) => {
      if (m?.tipo === 'buscar') return { tipo: 'resultados', items: buscar(String(m.q || '').slice(0, 80)) };
      if (m?.tipo === 'entrar') return { tipo: 'entrando', ...entrar(m.ref, m.ruc) };
      return null;
    });
  }, []);

  return null;
}
