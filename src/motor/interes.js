// Motor de intereses: cuánto te costó DE VERDAD tener la deuda.
//
// La idea central: la línea que dice "intereses" no es el costo real. El costo
// real es intereses + cuota de manejo + seguro de vida deudores + comisiones
// de avance + 4x1000 + el IVA de todo lo anterior. Ese es el número que
// nadie te muestra sumado.

import { CARGOS, POR_CLAVE } from '../datos/cargos.js';
import { normalizarDescripcion, contienePatron } from '../parse/normalizar.js';

/**
 * Clasifica una transacción como algún tipo de cargo financiero.
 * Devuelve null si no es un cargo (o sea, es una compra normal).
 *
 * Gana el primer patrón que matchee, y CARGOS está ordenado de más
 * específico a menos, para que "INTERES DE MORA" no caiga en "INTERES".
 */
export function clasificarCargo(descripcion) {
  const d = normalizarDescripcion(descripcion);
  for (const cargo of CARGOS) {
    for (const patron of cargo.patrones) {
      if (contienePatron(d, patron)) {
        return { clave: cargo.clave, etiqueta: cargo.etiqueta, patron, revisar: !!cargo.revisar };
      }
    }
  }
  return null;
}

/**
 * Analiza las transacciones y devuelve el costo de la deuda.
 *
 * @param {Array} transacciones
 * @param {object} opciones
 *   excluidos: ids que el usuario marcó como "esto no es un cargo"
 *   forzados: ids -> clave de cargo que el usuario corrigió a mano
 *   separarFX: saca las comisiones internacionales del costo de la deuda y las
 *     devuelve aparte. Son costo de comprar en dólares, no de deber plata, y el
 *     motor de suscripciones las necesita para no estimar lo que ya sabemos.
 *     Sin esto, esas comisiones se contarían dos veces.
 */
export function analizarInteres(transacciones, {
  excluidos = new Set(),
  forzados = new Map(),
  separarFX = false,
} = {}) {
  const porClave = new Map();
  const detalle = [];
  const cargosFX = [];

  for (const t of transacciones) {
    if (excluidos.has(t.id)) continue;
    if (t.valor <= 0) continue; // los abonos no son cargos

    let clasificacion;
    if (forzados.has(t.id)) {
      const clave = forzados.get(t.id);
      const def = POR_CLAVE[clave];
      if (!def) continue;
      clasificacion = { clave, etiqueta: def.etiqueta, patron: '(corregido a mano)', revisar: false };
    } else {
      clasificacion = clasificarCargo(t.descripcion);
    }
    if (!clasificacion) continue;

    const def = POR_CLAVE[clasificacion.clave];
    const fila = { ...t, ...clasificacion, esInteres: !!def.esInteres, esCargo: !!def.esCargo, esPrincipal: !!def.esPrincipal };
    detalle.push(fila);

    // Las comisiones internacionales se van al motor de suscripciones.
    if (separarFX && def.esFX) { cargosFX.push(fila); continue; }

    if (!porClave.has(clasificacion.clave)) {
      porClave.set(clasificacion.clave, {
        clave: clasificacion.clave,
        etiqueta: clasificacion.etiqueta,
        ayuda: def.ayuda,
        esInteres: !!def.esInteres,
        esCargo: !!def.esCargo,
        esPrincipal: !!def.esPrincipal,
        revisar: !!def.revisar,
        total: 0,
        conteo: 0,
        items: [],
      });
    }
    const g = porClave.get(clasificacion.clave);
    g.total += t.valor;
    g.conteo += 1;
    g.items.push(fila);
  }

  const grupos = [...porClave.values()].sort((a, b) => b.total - a.total);
  const soloIntereses = grupos.filter((g) => g.esInteres);
  const soloCargos = grupos.filter((g) => g.esCargo);
  const principal = grupos.filter((g) => g.esPrincipal);

  const totalIntereses = suma(soloIntereses);
  const totalCargos = suma(soloCargos);

  return {
    grupos,
    detalle,
    cargosFX,
    totalIntereses,
    totalCargos,
    // Lo que te costó la deuda este mes, todo incluido.
    costoTotal: totalIntereses + totalCargos,
    totalAvances: suma(principal),
    // Cuánto del costo NO es interés: la parte que la gente nunca cuenta.
    proporcionOculta: totalIntereses + totalCargos > 0
      ? totalCargos / (totalIntereses + totalCargos)
      : 0,
  };
}

function suma(grupos) {
  return grupos.reduce((acc, g) => acc + g.total, 0);
}

/**
 * Estima la tasa efectiva anual a partir del interés cobrado y el saldo.
 * Es una ESTIMACIÓN: el saldo real sobre el que liquidan varía día a día.
 *
 * @param {number} interesDelMes
 * @param {number} saldo saldo sobre el que se liquidó
 * @returns {number|null} fracción anual (0.2734 = 27,34% E.A.)
 */
export function estimarEA(interesDelMes, saldo) {
  if (!interesDelMes || !saldo || saldo <= 0) return null;
  const mensual = interesDelMes / saldo;
  if (mensual <= 0) return null;
  const ea = (1 + mensual) ** 12 - 1;
  return Number.isFinite(ea) ? ea : null;
}

/** Convierte una tasa efectiva anual a su equivalente mensual. */
export function eaAMensual(ea) {
  return (1 + ea) ** (1 / 12) - 1;
}

/**
 * Compara contra la tasa de usura. Solo tiene sentido si el usuario
 * nos dio la tasa del mes — no la inventamos.
 */
export function compararUsura(eaEstimada, usura) {
  if (eaEstimada == null || usura == null) return null;
  return {
    ea: eaEstimada,
    usura,
    excede: eaEstimada > usura,
    diferencia: eaEstimada - usura,
    // Qué tan cerca del techo legal te tienen.
    proporcion: eaEstimada / usura,
  };
}
