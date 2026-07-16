// Extracción de transacciones desde un PDF de extracto.
//
// Realidad colombiana: los bancos te dan el extracto de la tarjeta en PDF,
// no en CSV. Así que sin PDF esta herramienta no sirve para el caso más
// importante (intereses de tarjeta de crédito).
//
// Estrategia: sacamos el texto con pdf.js y buscamos líneas que se vean como
// "FECHA  DESCRIPCION  $VALOR". No es perfecto y no pretende serlo: por eso
// la interfaz SIEMPRE muestra la tabla para que vos confirmes antes de sumar.
//
// El PDF nunca sale de tu navegador. pdf.js se carga desde un CDN la primera
// vez; después queda en caché y la app funciona sin internet.

import { parseNumero } from './numero.js';
import { parseFecha } from './fecha.js';

const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

let pdfjsPromesa = null;

async function cargarPdfjs() {
  if (!pdfjsPromesa) {
    pdfjsPromesa = import(/* @vite-ignore */ PDFJS_URL).then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return mod;
    });
  }
  return pdfjsPromesa;
}

/** Saca el texto de un PDF, línea por línea, respetando la posición vertical. */
export async function textoDePDF(arrayBuffer) {
  const pdfjs = await cargarPdfjs();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const lineas = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const contenido = await pagina.getTextContent();

    // pdf.js devuelve fragmentos sueltos. Los agrupamos por coordenada Y
    // para reconstruir las líneas visuales.
    const porFila = new Map();
    for (const item of contenido.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      // Toleramos 2px de diferencia: el texto de una misma línea no siempre
      // cae exactamente en el mismo Y.
      let clave = y;
      for (const k of porFila.keys()) {
        if (Math.abs(k - y) <= 2) { clave = k; break; }
      }
      if (!porFila.has(clave)) porFila.set(clave, []);
      porFila.get(clave).push({ x: item.transform[4], str: item.str });
    }

    const ordenadas = [...porFila.entries()].sort((a, b) => b[0] - a[0]); // de arriba a abajo
    for (const [, frags] of ordenadas) {
      const linea = frags.sort((a, b) => a.x - b.x).map((f) => f.str).join(' ').replace(/\s+/g, ' ').trim();
      if (linea) lineas.push(linea);
    }
  }
  return lineas;
}

// Una línea de movimiento arranca con una fecha y termina con un monto.
const RE_FECHA_INICIO = /^(\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|\d{1,2}\s+[A-Za-zÁÉÍÓÚáéíóú]{3,10}\.?\s*\d{0,4})\s+(.*)$/;
const RE_MONTO = /(-?\$?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(CR)?$/;

/**
 * Convierte las líneas de texto en transacciones.
 * @param {string[]} lineas
 * @param {{anioPorDefecto?: number, origen?: string}} opciones
 */
export function lineasATransacciones(lineas, { anioPorDefecto = new Date().getFullYear(), origen = 'pdf' } = {}) {
  const transacciones = [];
  let descartadas = 0;

  lineas.forEach((linea, i) => {
    const m = linea.match(RE_FECHA_INICIO);
    if (!m) { descartadas++; return; }

    let textoFecha = m[1];
    const resto = m[2];

    // Los extractos de tarjeta suelen omitir el año ("15/01  NETFLIX  26.900").
    if (!/\d{4}|\d{2}$/.test(textoFecha.replace(/^\d{1,2}[-/.]\d{1,2}/, ''))) {
      textoFecha = `${textoFecha}/${anioPorDefecto}`;
    }
    const fecha = parseFecha(textoFecha) || parseFecha(`${m[1]}/${anioPorDefecto}`);
    if (!fecha) { descartadas++; return; }

    const mm = resto.match(RE_MONTO);
    if (!mm) { descartadas++; return; }

    let valor = parseNumero(mm[1]);
    if (valor == null || valor === 0) { descartadas++; return; }
    if (mm[2] === 'CR') valor = -Math.abs(valor); // marca de abono

    const descripcion = resto.slice(0, mm.index).replace(/\s+/g, ' ').trim();
    if (!descripcion) { descartadas++; return; }

    transacciones.push({
      id: `${origen}:${i}`,
      fecha,
      descripcion,
      valor,
      saldo: null,
      moneda: null,
      origen,
      crudo: [linea],
    });
  });

  return { transacciones, descartadas };
}

/** Todo junto: File de PDF -> transacciones. */
export async function transaccionesDePDF(file, opciones = {}) {
  const buf = await file.arrayBuffer();
  const lineas = await textoDePDF(buf);
  return lineasATransacciones(lineas, { origen: file.name, ...opciones });
}
