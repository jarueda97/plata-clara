// Lector de CSV/TSV de extractos bancarios.
//
// No asumimos el formato de ningún banco. Olfateamos el delimitador, buscamos
// la fila de encabezados (rara vez es la primera: los extractos traen basura
// arriba) y hacemos match difuso de los nombres de columna en español.

import { parseNumero } from './numero.js';
import { parseFecha } from './fecha.js';
import { normalizar } from './normalizar.js';

const DELIMITADORES = [';', ',', '\t', '|'];

/** Olfatea el delimitador: el que dé más columnas de forma consistente. */
export function detectarDelimitador(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 25);
  if (!lineas.length) return ',';

  let mejor = ',';
  let mejorPuntaje = -1;

  for (const d of DELIMITADORES) {
    const conteos = lineas.map((l) => partirLinea(l, d).length);
    const max = Math.max(...conteos);
    if (max < 2) continue;
    // Premiamos muchas columnas y consistencia entre filas.
    const moda = modaDe(conteos);
    const consistencia = conteos.filter((c) => c === moda).length / conteos.length;
    const puntaje = moda * consistencia;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = d;
    }
  }
  return mejor;
}

function modaDe(arr) {
  const cuenta = new Map();
  for (const v of arr) cuenta.set(v, (cuenta.get(v) || 0) + 1);
  let mejor = arr[0];
  let n = 0;
  for (const [v, c] of cuenta) if (c > n) { n = c; mejor = v; }
  return mejor;
}

/** Parte una línea respetando comillas dobles y comillas escapadas ("") */
export function partirLinea(linea, delim) {
  const campos = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (enComillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') { actual += '"'; i++; }
        else enComillas = false;
      } else actual += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === delim) {
      campos.push(actual.trim());
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual.trim());
  return campos;
}

/** Parte el texto completo en filas (maneja saltos de línea dentro de comillas). */
export function parsearCSV(texto, delim = null) {
  const d = delim || detectarDelimitador(texto);
  const filas = [];
  let campos = [];
  let actual = '';
  let enComillas = false;

  const limpio = texto.replace(/^﻿/, ''); // BOM de Excel

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (enComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') { actual += '"'; i++; }
        else enComillas = false;
      } else actual += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === d) {
      campos.push(actual.trim()); actual = '';
    } else if (c === '\n') {
      campos.push(actual.trim()); actual = '';
      filas.push(campos); campos = [];
    } else if (c === '\r') {
      // se ignora, el \n lo cierra
    } else {
      actual += c;
    }
  }
  campos.push(actual.trim());
  if (campos.some((x) => x !== '')) filas.push(campos);

  return { filas: filas.filter((f) => f.some((x) => x !== '')), delimitador: d };
}

// --- Detección de columnas -------------------------------------------------
// Cada columna canónica tiene sinónimos. Ordenados de más específico a menos:
// "fecha de transaccion" debe ganarle a "fecha" cuando existen ambas.

const SINONIMOS = {
  fecha: [
    'fecha de transaccion', 'fecha transaccion', 'fecha de operacion', 'fecha operacion',
    'fecha de movimiento', 'fecha movimiento', 'fecha de compra', 'fecha compra',
    'f transaccion', 'fecha proceso', 'transaction date', 'post date', 'fecha', 'date', 'dia',
  ],
  descripcion: [
    'descripcion', 'concepto', 'detalle', 'detalle de la transaccion', 'transaccion',
    'establecimiento', 'comercio', 'nombre del comercio', 'beneficiario',
    'description', 'merchant', 'referencia', 'observacion', 'movimiento', 'clase de movimiento',
  ],
  valor: [
    'valor total', 'valor transaccion', 'valor de la transaccion', 'valor',
    'monto', 'importe', 'amount', 'vlr', 'valor movimiento',
  ],
  debito: ['debitos', 'debito', 'cargo', 'cargos', 'retiro', 'retiros', 'salida', 'egreso', 'debit'],
  credito: ['creditos', 'credito', 'abono', 'abonos', 'consignacion', 'deposito', 'entrada', 'ingreso', 'pago', 'credit'],
  saldo: ['saldo final', 'saldo', 'balance', 'nuevo saldo'],
  moneda: ['moneda', 'divisa', 'currency'],
};

/**
 * Encuentra la fila de encabezados: la primera fila que matchee al menos
 * fecha + (descripción o valor). Los extractos traen líneas de basura arriba.
 */
export function detectarEncabezados(filas, { maxFilas = 20 } = {}) {
  let mejor = null;

  for (let i = 0; i < Math.min(filas.length, maxFilas); i++) {
    const mapa = mapearColumnas(filas[i]);
    const tieneFecha = mapa.fecha != null;
    const tieneMonto = mapa.valor != null || mapa.debito != null || mapa.credito != null;
    const tieneDesc = mapa.descripcion != null;
    if (!tieneFecha || !(tieneMonto || tieneDesc)) continue;

    const puntaje = Object.values(mapa).filter((v) => v != null).length;
    if (!mejor || puntaje > mejor.puntaje) mejor = { fila: i, mapa, puntaje };
  }
  return mejor ? { fila: mejor.fila, mapa: mejor.mapa } : null;
}

/**
 * Mapea índices de columna -> nombre canónico.
 *
 * DOS PASADAS, y el orden importa: primero todos los matches EXACTOS, después
 * los parciales. En una sola pasada, un match parcial de una columna se robaba
 * la que otra matcheaba exacto — "descripcion" tiene "movimiento" de sinónimo y
 * se quedaba con la columna "Valor movimiento", dejando `valor` en null.
 * Resultado: cada fila se descartaba por no tener monto y el extracto salía
 * vacío, sin un solo error. Y "Valor movimiento" es literalmente el nombre de
 * la columna en el extracto de Bancolombia.
 */
export function mapearColumnas(encabezados) {
  const norm = encabezados.map((h) => normalizar(h));
  const mapa = {};
  const usadas = new Set();
  const canonicos = Object.entries(SINONIMOS);

  // Pasada 1: solo coincidencias exactas. Nadie se roba nada.
  for (const [canonico, sinonimos] of canonicos) {
    for (const sin of sinonimos) {
      const idx = norm.findIndex((h, i) => !usadas.has(i) && h === sin);
      if (idx > -1) { mapa[canonico] = idx; usadas.add(idx); break; }
    }
  }

  // Pasada 2: parciales, solo para lo que quedó sin asignar.
  for (const [canonico, sinonimos] of canonicos) {
    if (canonico in mapa) continue;
    for (const sin of sinonimos) {
      const idx = norm.findIndex((h, i) => !usadas.has(i) && h.includes(sin));
      if (idx > -1) { mapa[canonico] = idx; usadas.add(idx); break; }
    }
    if (!(canonico in mapa)) mapa[canonico] = null;
  }
  return mapa;
}

/**
 * Convierte filas + mapa de columnas en transacciones canónicas.
 *
 * Convención de signo: `valor` positivo = plata que SALE (te cobraron).
 * Negativo = plata que ENTRA (abono, pago, devolución). Esto es lo que hay
 * que voltear si el extracto viene al revés — de ahí el flag `invertirSigno`.
 *
 * @returns {{transacciones: Array, descartadas: number}}
 */
export function filasATransacciones(filas, mapa, { filaEncabezado = 0, invertirSigno = false, origen = '' } = {}) {
  const transacciones = [];
  let descartadas = 0;

  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const f = filas[i];
    const fecha = parseFecha(mapa.fecha != null ? f[mapa.fecha] : null);
    const descripcion = mapa.descripcion != null ? (f[mapa.descripcion] || '').trim() : '';

    let valor = null;
    if (mapa.debito != null || mapa.credito != null) {
      // Columnas separadas de débito/crédito: el signo lo da la columna.
      const deb = mapa.debito != null ? parseNumero(f[mapa.debito]) : null;
      const cre = mapa.credito != null ? parseNumero(f[mapa.credito]) : null;
      if (deb) valor = Math.abs(deb);
      else if (cre) valor = -Math.abs(cre);
      else if (mapa.valor != null) valor = parseNumero(f[mapa.valor]);
    } else if (mapa.valor != null) {
      valor = parseNumero(f[mapa.valor]);
    }

    // Number.isFinite y no `!= null`: rechaza NaN e Infinity además de null.
    // Hoy parseNumero nunca devuelve NaN, así que `!= null` alcanzaba — pero
    // eso hacía este guard correcto por accidente, dependiendo de un detalle
    // de otro módulo. Un NaN que se cuele envenena todos los totales en
    // silencio: NaN + 1 = NaN, y la tarjeta entera queda en "—" sin decir por qué.
    if (!fecha || !Number.isFinite(valor) || valor === 0) { descartadas++; continue; }
    if (!descripcion) { descartadas++; continue; }

    transacciones.push({
      id: `${origen}:${i}`,
      fecha,
      descripcion,
      valor: invertirSigno ? -valor : valor,
      saldo: mapa.saldo != null ? parseNumero(f[mapa.saldo]) : null,
      moneda: mapa.moneda != null ? (f[mapa.moneda] || '').trim().toUpperCase() : null,
      origen,
      crudo: f,
    });
  }
  return { transacciones, descartadas };
}

/**
 * Heurística de signo. En un extracto normal hay MUCHOS más cargos que abonos.
 * Si vemos lo contrario, casi seguro el signo viene invertido.
 */
export function sugiereInvertirSigno(transacciones) {
  if (transacciones.length < 4) return false;
  const salidas = transacciones.filter((t) => t.valor > 0).length;
  const entradas = transacciones.length - salidas;
  return entradas > salidas * 2;
}
