// Motor de diferidos: lo que estás pagando a cuotas sin haberlo decidido.
//
// En Colombia la tarjeta suele venir configurada para diferir TODO a N cuotas
// por defecto. El resultado es que financias a 36 meses cosas que nunca
// pensarías financiar — una suscripción, un domicilio, un mercado — y el
// extracto no te lo dice en ninguna parte: solo te muestra una cuota chiquita.
//
// El costo no está adentro de la cuota. En Bancolombia la cuota es capital puro
// (3.600.000 / 36 = 100.000 exacto); el interés se cobra aparte, en una línea,
// sobre el saldo total. Por eso una cuota se ve inofensiva y el saldo te cobra
// intereses todos los meses.

import { identificarComercio } from './suscripciones.js';

/**
 * @param {Array} transacciones
 * @param {{interesDelMes?: number}} opciones
 *   interesDelMes: lo que el extracto cobró de intereses corrientes. Es el
 *   precio real de mantener el saldo, y no sale de las cuotas: sale aparte.
 */
export function analizarDiferidos(transacciones, { interesDelMes = 0 } = {}) {
  const diferidas = transacciones.filter((t) => t.cuotas && t.cuotas.total > 1 && t.valor > 0);
  if (!diferidas.length) return null;

  const saldoPendiente = diferidas.reduce((a, t) => a + (t.saldoPendiente || 0), 0);
  const cuotaMensual = diferidas.reduce((a, t) => a + (t.valorCuota || 0), 0);
  const comprado = diferidas.reduce((a, t) => a + (t.valorMovimiento || 0), 0);

  // Tasa ponderada por saldo: la que importa es la de la plata que más debes.
  const conTasa = diferidas.filter((t) => t.tasaEA > 0 && t.saldoPendiente > 0);
  const saldoConTasa = conTasa.reduce((a, t) => a + t.saldoPendiente, 0);
  const tasaEA = saldoConTasa > 0
    ? conTasa.reduce((a, t) => a + t.tasaEA * t.saldoPendiente, 0) / saldoConTasa
    : null;

  const items = diferidas.map((t) => {
    // El saldo del extracto YA viene neto de la cuota de este mes: la fila de
    // ejemplo del parser lo prueba (3.600.000 - 100.000 = 3.500.000). O sea que
    // si vas en la cuota 1 de 36, te faltan 35 pagos, no 36.
    // La regla que lo ancla: restantes * valorCuota === saldoPendiente.
    const restantes = Math.max(t.cuotas.total - t.cuotas.n, 0);
    const comercio = identificarComercio(t.descripcion);
    return {
      id: t.id,
      descripcion: t.descripcion,
      nombre: comercio?.nombre || t.descripcion,
      esSuscripcion: !!comercio,
      categoria: comercio?.categoria || null,
      fecha: t.fecha,
      valorMovimiento: t.valorMovimiento,
      valorCuota: t.valorCuota,
      saldoPendiente: t.saldoPendiente,
      cuotaN: t.cuotas.n,
      cuotaTotal: t.cuotas.total,
      restantes,
      tasaEA: t.tasaEA,
      // Cuándo se acaba de pagar esto: la última cuota cae (total - 1) meses
      // después de la compra, porque la cuota 1 se cobra el mismo mes.
      terminaEn: mesesAdelante(t.fecha, t.cuotas.total - 1),
    };
  }).sort((a, b) => b.saldoPendiente - a.saldoPendiente);

  // El detalle que más duele: suscripciones financiadas a 3 años.
  const suscripcionesDiferidas = items.filter((i) => i.esSuscripcion);

  // Y el que de verdad duele: el apilamiento.
  //
  // Una suscripción se cobra todos los meses. Si el banco difiere CADA cobro a
  // 36 cuotas, al mes 20 tienes 20 cuotas de lo mismo corriendo a la vez, y el
  // saldo solo sube: nunca terminas de pagar el mes 1 antes de que llegue el 21.
  // Dejó de ser una suscripción y se volvió deuda que se acumula sola.
  //
  // Por eso "49 suscripciones diferidas" es un número engañoso: pueden ser 6
  // comercios apilados. Lo que importa es cuántos comercios y cuánto se apilan.
  const apiladas = agruparApiladas(items);

  // ¿Cuántos meses faltan para que se acabe la última cuota?
  const colaMeses = items.length ? Math.max(...items.map((i) => i.restantes)) : 0;

  return {
    items,
    suscripcionesDiferidas,
    apiladas,
    // Comercios distintos que se apilan (≥2 cuotas simultáneas).
    seApilan: apiladas.filter((a) => a.cuotasVivas >= 2),
    comerciosSuscripcion: new Set(suscripcionesDiferidas.map((i) => i.nombre)).size,
    conteo: diferidas.length,
    comprado,
    saldoPendiente,
    cuotaMensual,
    tasaEA,
    interesDelMes,
    colaMeses,
    // Lo que cuesta MANTENER el saldo, al mes. No sale de las cuotas.
    // Si el extracto nos dio el interés real, ese manda sobre cualquier cuenta nuestra.
    costoMensualDelSaldo: interesDelMes || (tasaEA ? saldoPendiente * (((1 + tasaEA) ** (1 / 12)) - 1) : 0),
    // Cuota más grande y la más larga: los dos extremos que la gente reconoce.
    mayor: items[0] || null,
    masLarga: items.reduce((a, b) => (!a || b.restantes > a.restantes ? b : a), null),
  };
}

/**
 * Cuánto interés te queda por pagar si dejas correr el saldo tal cual,
 * pagando exactamente las cuotas. El capital baja según las cuotas vigentes;
 * el interés se cobra sobre lo que quede cada mes.
 *
 * Es una proyección, no una promesa: asume que no compras nada más.
 */
export function interesPorPagar(items, tasaEA, { maxMeses = 120 } = {}) {
  if (!items?.length || !tasaEA || tasaEA <= 0) return null;
  const i = ((1 + tasaEA) ** (1 / 12)) - 1;

  // Cuánto capital se paga en cada mes futuro, según las cuotas que siguen vivas.
  const capitalPorMes = [];
  for (const it of items) {
    for (let m = 0; m < it.restantes && m < maxMeses; m++) {
      capitalPorMes[m] = (capitalPorMes[m] || 0) + it.valorCuota;
    }
  }

  let saldo = items.reduce((a, x) => a + x.saldoPendiente, 0);
  let interesTotal = 0;
  let meses = 0;

  for (let m = 0; m < capitalPorMes.length && saldo > 0.5; m++) {
    const interes = saldo * i;
    interesTotal += interes;
    saldo = Math.max(saldo - (capitalPorMes[m] || 0), 0);
    meses = m + 1;
  }
  return { interesTotal, meses };
}

/**
 * Agrupa las cuotas vivas por comercio. Un comercio con 20 cuotas simultáneas
 * no compró 20 veces algo distinto: compró lo mismo 20 meses seguidos y el
 * banco difirió cada cobro.
 */
function agruparApiladas(items) {
  const mapa = new Map();
  for (const i of items) {
    // Agrupamos por clave normalizada, no por el texto crudo: el mismo comercio
    // sale escrito distinto de un mes a otro ("ACME" y "ACME INC"), y
    // partirlo en dos subestima el apilamiento, que es justo lo que queremos medir.
    //
    // El `|| i.nombre`: si la limpieza se come el nombre entero ("APP 845423"
    // pierde el número y el sufijo y queda en ''), dos comercios sin relación
    // caerían en la misma clave vacía y reportaríamos un apilamiento falso.
    // Mejor no agrupar que inventar que algo se apila.
    const clave = claveComercio(i.nombre) || i.nombre;
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        nombre: i.nombre,
        esSuscripcion: i.esSuscripcion,
        cuotasVivas: 0,
        cuotaMensual: 0,
        saldoPendiente: 0,
        comprado: 0,
        primera: i.fecha,
        ultima: i.fecha,
        restantesMax: 0,
      });
    }
    const g = mapa.get(clave);
    g.cuotasVivas += 1;
    g.cuotaMensual += i.valorCuota;
    g.saldoPendiente += i.saldoPendiente;
    g.comprado += i.valorMovimiento;
    if (i.fecha < g.primera) g.primera = i.fecha;
    if (i.fecha > g.ultima) g.ultima = i.fecha;
    g.restantesMax = Math.max(g.restantesMax, i.restantes);
    // El nombre más corto suele ser el limpio ("ACME" antes que "ACME INC 4821").
    if (i.nombre.length < g.nombre.length) g.nombre = i.nombre;
    g.esSuscripcion = g.esSuscripcion || i.esSuscripcion;
  }
  return [...mapa.values()].sort((a, b) => b.cuotasVivas - a.cuotasVivas || b.saldoPendiente - a.saldoPendiente);
}

/**
 * Clave de agrupación de un comercio. Quita sufijos societarios, números de
 * referencia y puntuación: lo que sobra es el nombre que un humano reconoce.
 */
export function claveComercio(nombre) {
  return String(nombre ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b\d{3,}\b/g, ' ')                                  // referencias
    .replace(/\b(INC|LLC|LTD|LTDA|SAS|S A S|S A|CO|CORP|COM|IO|AI|APP|PTY|GMBH|BV|PLC)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function mesesAdelante(fecha, n) {
  const d = new Date(fecha);
  d.setMonth(d.getMonth() + n);
  return d;
}
