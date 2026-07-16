// Simulador del pago mínimo.
//
// Pagar el mínimo es la trampa más cara y más normalizada que existe. Esta
// simulación existe para poner el número al lado del hábito.

import { SUPUESTOS_MINIMO } from '../datos/tarifas.js';
import { eaAMensual } from './interes.js';

/**
 * Simula pagar solo el mínimo hasta liquidar la deuda.
 *
 * @param {number} saldo saldo actual
 * @param {number} ea tasa efectiva anual como fracción (0.28 = 28% E.A.)
 * @param {object} opciones
 * @returns {{meses:number|null, totalPagado:number, totalIntereses:number, nuncaTermina:boolean, curva:Array}}
 */
export function simularMinimo(saldo, ea, {
  porcentajeMinimo = SUPUESTOS_MINIMO.porcentajeMinimo,
  pisoMinimo = SUPUESTOS_MINIMO.pisoMinimo,
  maxMeses = SUPUESTOS_MINIMO.maxMeses,
} = {}) {
  if (!saldo || saldo <= 0 || ea == null || ea < 0) return null;

  const i = eaAMensual(ea);
  let s = saldo;
  let totalPagado = 0;
  let totalIntereses = 0;
  const curva = [];

  for (let mes = 1; mes <= maxMeses; mes++) {
    const interes = s * i;
    let pago = Math.max(s * porcentajeMinimo, pisoMinimo);

    // Si el mínimo no cubre ni el interés, la deuda crece para siempre.
    if (pago <= interes && s * porcentajeMinimo <= interes && pisoMinimo <= interes) {
      return { meses: null, totalPagado, totalIntereses, nuncaTermina: true, curva };
    }

    // Último pago: no pagás de más.
    if (pago > s + interes) pago = s + interes;

    s = s + interes - pago;
    totalPagado += pago;
    totalIntereses += interes;
    curva.push({ mes, saldo: Math.max(s, 0), pago, interes });

    if (s <= 0.5) {
      return {
        meses: mes,
        totalPagado,
        totalIntereses,
        nuncaTermina: false,
        curva,
      };
    }
  }

  return { meses: null, totalPagado, totalIntereses, nuncaTermina: true, curva };
}

/**
 * Compara pagar el mínimo contra pagar una cuota fija.
 * Devuelve cuánto te ahorrás y cuánto antes salís.
 */
export function compararConCuotaFija(saldo, ea, cuota, opciones = {}) {
  const min = simularMinimo(saldo, ea, opciones);
  const fija = simularCuotaFija(saldo, ea, cuota, opciones);
  if (!min || !fija) return null;

  return {
    minimo: min,
    fija,
    ahorro: min.nuncaTermina ? null : min.totalIntereses - fija.totalIntereses,
    mesesMenos: min.nuncaTermina || fija.nuncaTermina ? null : min.meses - fija.meses,
  };
}

/** Simula pagar una cuota fija todos los meses. */
export function simularCuotaFija(saldo, ea, cuota, { maxMeses = SUPUESTOS_MINIMO.maxMeses } = {}) {
  if (!saldo || saldo <= 0 || ea == null || !cuota || cuota <= 0) return null;
  const i = eaAMensual(ea);
  let s = saldo;
  let totalPagado = 0;
  let totalIntereses = 0;

  for (let mes = 1; mes <= maxMeses; mes++) {
    const interes = s * i;
    if (cuota <= interes) {
      return { meses: null, totalPagado, totalIntereses, nuncaTermina: true };
    }
    const pago = Math.min(cuota, s + interes);
    s = s + interes - pago;
    totalPagado += pago;
    totalIntereses += interes;
    if (s <= 0.5) return { meses: mes, totalPagado, totalIntereses, nuncaTermina: false };
  }
  return { meses: null, totalPagado, totalIntereses, nuncaTermina: true };
}

/**
 * Traduce una plata a cosas cotidianas. El número solo no duele;
 * "son 14 almuerzos" sí.
 */
export const EQUIVALENCIAS = [
  { nombre: 'almuerzos corrientes', unitario: 18000, emoji: '🍽️' },
  { nombre: 'meses de Netflix', unitario: 26900, emoji: '📺' },
  { nombre: 'tanqueadas de moto', unitario: 25000, emoji: '🏍️' },
  { nombre: 'carreras en taxi', unitario: 15000, emoji: '🚕' },
  { nombre: 'salarios mínimos', unitario: 1423500, emoji: '💼' },
];

/** Elige la equivalencia que dé un número entre 2 y 40 (la que más "pega"). */
export function equivalencia(monto) {
  if (!monto || monto <= 0) return null;
  const candidatas = EQUIVALENCIAS
    .map((e) => ({ ...e, cantidad: monto / e.unitario }))
    .filter((e) => e.cantidad >= 2 && e.cantidad <= 40)
    .sort((a, b) => a.cantidad - b.cantidad);
  const elegida = candidatas[0] || { ...EQUIVALENCIAS[0], cantidad: monto / EQUIVALENCIAS[0].unitario };
  return { ...elegida, cantidad: Math.round(elegida.cantidad) };
}
