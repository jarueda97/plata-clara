// Preset: extracto Bancolombia Visa "detallado" (PDF).
//
// Este es el primer preset construido contra un extracto REAL, no adivinado.
// Formato de las filas de detalle:
//
//   845423 09/06/2026 COMERCIO $ 3.600.000,00 1/36 $ 100.000,00 2,1285 % 28,7548 % $ 3.500.000,00
//   └auth┘ └─fecha──┘ └desc──┘ └─valor mov─┘ └cuota┘└─valor cuota┘ └mensual┘ └── E.A. ──┘ └─saldo──┘
//
//   15/06/2026 INTERESES CORRIENTES $ 150.000,00 $ 150.000,00 $ 0,00
//   (sin auth, sin cuotas, sin tasas: se cobra completo este mes)
//
// Lo que hay que entender de este banco, porque cambia el significado de todo:
// **casi todo se difiere a 36 cuotas.** "Valor movimiento" es lo que compraste;
// "valor cuota" es lo que te golpea ESTE mes; "saldo pendiente" es lo que falta.
// La cuota resultó ser capital puro (3.600.000 / 36 = 100.000 exacto): el interés no
// va adentro de la cuota, se cobra aparte en una línea "INTERESES CORRIENTES"
// sobre el saldo total. Por eso `valor` = valor cuota, y los intereses entran
// como su propia transacción.
//
// Leer la última cifra de la fila —que fue lo primero que hizo el parser
// genérico— da el saldo pendiente, o sea que reporta la deuda entera como
// "gasto del mes". Absurdo, y creíble a primera vista: por eso está aquí escrito.

import { parseNumero, parseTasa } from './numero.js';
import { parseFecha } from './fecha.js';

const RE_FECHA = /\b(\d{2}\/\d{2}\/\d{4})\b/;
const RE_MONTO = /\$\s?(-?[\d.]+,\d{2})/g;
const RE_CUOTAS = /\b(\d{1,3})\/(\d{1,3})\b(?=\s*\$)/;
const RE_TASA = /([\d.]+,\d{1,4})\s*%/g;

/**
 * ¿Estas líneas se ven como un extracto Bancolombia detallado?
 *
 * Detectamos por la FORMA de los datos, no por el texto del encabezado.
 * Suena a detalle y no lo es: este PDF parte cada título en dos líneas
 * ("Número de" arriba, "autorización" abajo) y además repite cada palabra tres
 * veces por cómo está maquetado. Buscar la frase "número de autorización"
 * fallaba sobre el extracto real aunque el formato fuera exactamente este.
 *
 * Una fila con fecha + tres montos + "n/total" + dos porcentajes no se parece
 * a nada más. Eso sí es inequívoco, y ningún cambio de maquetación lo rompe.
 */
export function esBancolombiaVisa(lineas) {
  let filas = 0;
  let inequivocas = 0;
  for (const l of lineas) {
    const f = parsearFila(l);
    if (!f) continue;
    filas++;
    if (f.cuotas && f.tasaEA != null) inequivocas++;
    if (inequivocas >= 3) return true;
  }
  // Un extracto sin nada diferido no tiene filas "inequívocas", pero igual
  // trae muchas filas con fecha + varios montos, que el genérico lee mal.
  return filas >= 8;
}

/**
 * Parsea una fila de detalle. Devuelve null si la línea no lo es.
 *
 * Tolerante a propósito: en vez de un regex gigante que exige el orden exacto,
 * saca las piezas por separado. Los montos siempre salen en el mismo orden
 * (movimiento, cuota, saldo), traiga o no la fila el bloque de cuotas y tasas.
 */
export function parsearFila(linea) {
  const mf = linea.match(RE_FECHA);
  if (!mf) return null;

  const fecha = parseFecha(mf[1]);
  if (!fecha) return null;

  const montos = [...linea.matchAll(RE_MONTO)].map((m) => ({ v: parseNumero(m[1]), i: m.index }));
  if (montos.length < 2) return null;

  const tasas = [...linea.matchAll(RE_TASA)].map((m) => parseTasa(m[1]));
  const mc = linea.match(RE_CUOTAS);

  // La descripción vive entre la fecha y el primer monto.
  const desde = mf.index + mf[1].length;
  const desc = linea.slice(desde, montos[0].i).replace(/\s+/g, ' ').trim();
  if (!desc || /^[\d\s/.,-]*$/.test(desc)) return null; // sin texto real, no es un movimiento

  const [valorMovimiento, valorCuota, saldoPendiente] = [
    montos[0]?.v ?? null,
    montos[1]?.v ?? null,
    montos[2]?.v ?? null,
  ];
  if (valorMovimiento == null) return null;

  const cuotaN = mc ? +mc[1] : null;
  const cuotaTotal = mc ? +mc[2] : null;

  return {
    fecha,
    descripcion: desc,
    // Lo que te cobraron ESTE mes. Si no hay cuota, se cobró completo.
    valor: valorCuota ?? valorMovimiento,
    valorMovimiento,
    valorCuota: valorCuota ?? valorMovimiento,
    saldoPendiente: saldoPendiente ?? 0,
    cuotas: cuotaTotal && cuotaTotal > 1 ? { n: cuotaN, total: cuotaTotal } : null,
    tasaMensual: tasas[0] ?? null,
    tasaEA: tasas[1] ?? null,
    moneda: null,
    saldo: null,
  };
}

/**
 * Convierte las líneas del PDF en transacciones.
 * Salta el bloque de resumen de las primeras páginas: ahí hay cifras que
 * parecen movimientos ("+ Saldo anterior $X") y no lo son. Solo aceptamos
 * filas con fecha completa DD/MM/AAAA, que es lo que usa la tabla de detalle;
 * el resumen usa "18 may - 15 jun".
 */
export function transaccionesDeLineas(lineas, { origen = 'bancolombia-visa' } = {}) {
  const transacciones = [];
  let descartadas = 0;

  lineas.forEach((linea, i) => {
    const fila = parsearFila(linea);
    // isFinite, no `!= null`: un NaN envenena todos los totales en silencio.
    if (!fila || !Number.isFinite(fila.valor) || fila.valor === 0) { descartadas++; return; }
    transacciones.push({ id: `${origen}:${i}`, origen, crudo: [linea], ...fila });
  });

  return {
    transacciones,
    descartadas,
    banco: 'Bancolombia Visa',
    periodo: periodoDelExtracto(lineas),
  };
}

/**
 * El periodo que cubre el extracto, leído del encabezado ("18 may - 15 jun. 2026").
 *
 * Hace falta porque en un extracto diferido las fechas de las filas NO son el
 * periodo: una cuota que se cobra en junio conserva la fecha de la compra, que
 * puede ser de hace año y medio. Sin esto, la app anunciaba "esto te costó en
 * 18 meses" sobre un extracto de un solo mes — y el interés de un mes se leía
 * como el de año y medio.
 */
export function periodoDelExtracto(lineas) {
  const re = /\b(\d{1,2})\s+([a-záéíóú]{3,4})\.?\s*[-–]\s*(\d{1,2})\s+([a-záéíóú]{3,4})\.?\s*(\d{4})/i;
  for (const l of lineas.slice(0, 60)) {
    const m = l.match(re);
    if (!m) continue;
    const fin = parseFecha(`${m[3]} ${m[4]} ${m[5]}`);
    if (!fin) continue;
    // El inicio puede caer en el año anterior (dic - ene).
    let inicio = parseFecha(`${m[1]} ${m[2]} ${m[5]}`);
    if (inicio && inicio > fin) inicio = parseFecha(`${m[1]} ${m[2]} ${+m[5] - 1}`);
    return { inicio, fin };
  }
  return null;
}

/**
 * La tasa E.A. del extracto. Ponderada por saldo pendiente: la tasa que te
 * importa es la de la plata que más debes, no el promedio simple de las filas.
 */
export function tasaEADelExtracto(transacciones) {
  const conTasa = transacciones.filter((t) => t.tasaEA > 0 && t.saldoPendiente > 0);
  if (!conTasa.length) return null;
  const saldo = conTasa.reduce((a, t) => a + t.saldoPendiente, 0);
  if (saldo <= 0) return null;
  return conTasa.reduce((a, t) => a + t.tasaEA * t.saldoPendiente, 0) / saldo;
}
