// Motor de suscripciones: cuánto te sacan de verdad los cobros recurrentes.
//
// Dos verdades incómodas que este motor trata de mostrar:
//
// 1. Con UN SOLO mes de extracto no puedes detectar recurrencia por repetición
//    (nada se repite todavía). Toca reconocer al comercio por nombre. Por eso
//    el diccionario es el corazón del proyecto. Con dos o más meses ya podemos
//    confirmar por repetición y encontrar comercios que no conocemos.
//
// 2. Una suscripción facturada en dólares NO te cuesta el precio de la lista:
//    te cuesta eso + comisión internacional + IVA de esa comisión + el spread
//    de TRM del banco. En Colombia eso es fácilmente un 5-6% encima.

import { SUSCRIPCIONES, CATEGORIAS, PISTAS_RECURRENCIA, PISTAS_INTERNACIONAL } from '../datos/suscripciones.js';
import { TARIFAS } from '../datos/tarifas.js';
import { normalizarDescripcion, contienePatron, descripcionBonita } from '../parse/normalizar.js';
import { claveMes, diasEntre } from '../parse/fecha.js';
import { clasificarCargo } from './interes.js';

/** Busca el comercio en el diccionario. Devuelve null si no lo conocemos. */
export function identificarComercio(descripcion) {
  const d = normalizarDescripcion(descripcion);
  let mejor = null;
  for (const s of SUSCRIPCIONES) {
    for (const patron of s.patrones) {
      if (contienePatron(d, patron)) {
        // Nos quedamos con el patrón más largo: "APPLE MUSIC" le gana a "APPLE".
        if (!mejor || patron.length > mejor.patron.length) {
          mejor = { ...s, patron, confianza: 'diccionario' };
        }
      }
    }
  }
  return mejor;
}

/** ¿La descripción huele a cobro recurrente aunque no conozcamos el comercio? */
export function pareceRecurrente(descripcion) {
  const d = normalizarDescripcion(descripcion);
  return PISTAS_RECURRENCIA.some((p) => contienePatron(d, p));
}

/** ¿Se ve como una compra en moneda extranjera? */
export function pareceInternacional(transaccion) {
  if (transaccion.moneda && transaccion.moneda !== 'COP') return true;
  const d = normalizarDescripcion(transaccion.descripcion);
  return PISTAS_INTERNACIONAL.some((p) => contienePatron(d, p));
}

/**
 * Agrupa transacciones por comercio y detecta recurrencia real.
 * Dos cargos del mismo comercio separados por 25-35 días (mensual) o
 * 350-380 días (anual) con montos parecidos = suscripción confirmada.
 */
function detectarRecurrencia(items) {
  if (items.length < 2) return { confirmada: false, periodo: null };

  const ordenados = [...items].sort((a, b) => a.fecha - b.fecha);
  const brechas = [];
  for (let i = 1; i < ordenados.length; i++) {
    brechas.push(diasEntre(ordenados[i - 1].fecha, ordenados[i].fecha));
  }

  const mensuales = brechas.filter((d) => d >= 25 && d <= 35).length;
  const anuales = brechas.filter((d) => d >= 350 && d <= 380).length;
  const semanales = brechas.filter((d) => d >= 6 && d <= 8).length;

  if (mensuales >= 1 && mensuales >= brechas.length / 2) return { confirmada: true, periodo: 'mensual' };
  if (anuales >= 1) return { confirmada: true, periodo: 'anual' };
  if (semanales >= 2) return { confirmada: true, periodo: 'semanal' };
  return { confirmada: false, periodo: null };
}

/** Cuántas veces al año se cobra cada periodo. */
const VECES_AL_ANIO = { mensual: 12, anual: 1, semanal: 52 };

/**
 * @param {Array} transacciones
 * @param {object} opciones
 *   excluidos: ids que el usuario dijo que NO son suscripción
 *   extras: ids que el usuario marcó a mano como suscripción
 *   comisionesFX: líneas de comisión internacional que trae el extracto. Si
 *     vienen, mandan sobre nuestra estimación — es plata real, no un supuesto.
 *   tarifas: overrides de comisión internacional / IVA / spread
 *   esCuentaDebito: si es cuenta de ahorros, aplica 4x1000
 */
export function analizarSuscripciones(transacciones, {
  excluidos = new Set(),
  extras = new Set(),
  comisionesFX = [],
  tarifas = TARIFAS,
  esCuentaDebito = false,
} = {}) {
  const porComercio = new Map();

  for (const t of transacciones) {
    if (excluidos.has(t.id)) continue;
    if (t.valor <= 0) continue;               // abonos no
    if (clasificarCargo(t.descripcion)) continue; // los cargos del banco los cuenta el otro motor

    let ident = identificarComercio(t.descripcion);
    let confianza = ident ? 'diccionario' : null;

    if (!ident && extras.has(t.id)) {
      // El usuario marcó a mano "esto sí es una suscripción".
      ident = { nombre: descripcionBonita(t.descripcion), categoria: 'otros', moneda: null };
      confianza = 'manual';
    }
    if (!ident && pareceRecurrente(t.descripcion)) {
      ident = { nombre: descripcionBonita(t.descripcion), categoria: 'sospechosa', moneda: null };
      confianza = 'pista';
    }
    if (!ident) continue;

    const clave = ident.nombre;
    if (!porComercio.has(clave)) {
      porComercio.set(clave, {
        nombre: ident.nombre,
        categoria: ident.categoria,
        monedaHint: ident.moneda,
        confianza,
        items: [],
      });
    }
    porComercio.get(clave).items.push(t);
  }

  // Antes de nada: ¿cuáles de estas compras traen su comisión en el extracto?
  const itemsIntl = [...porComercio.values()]
    .flatMap((g) => g.items.filter((t) => pareceInternacional(t) || g.monedaHint === 'USD'))
    .sort((a, b) => a.fecha - b.fecha);
  const { porTx, sinAtribuir } = atribuirComisiones(comisionesFX, itemsIntl);

  const comercios = [];
  for (const g of porComercio.values()) {
    const recurrencia = detectarRecurrencia(g.items);
    const cobrado = g.items.reduce((a, t) => a + t.valor, 0);

    // ¿Esto es en dólares? La evidencia del extracto manda sobre el diccionario.
    const evidenciaIntl = g.items.some(pareceInternacional);
    const enDolares = evidenciaIntl || g.monedaHint === 'USD';

    // Comisiones reales que le pudimos atribuir a este comercio.
    const comisionesPropias = g.items.map((t) => porTx.get(t.id)).filter((v) => v != null);
    const comisionReal = comisionesPropias.length
      ? comisionesPropias.reduce((a, b) => a + b, 0)
      : null;

    const recargos = calcularRecargos(cobrado, { enDolares, comisionReal, esCuentaDebito, tarifas });

    // Periodo: si lo confirmamos por repetición, usamos eso. Si no, asumimos
    // mensual (que es lo típico) pero lo marcamos como supuesto.
    const periodo = recurrencia.periodo || 'mensual';
    const periodoEsSupuesto = !recurrencia.confirmada;

    // Anualizado sobre el cobro TÍPICO, no sobre la suma del periodo cargado.
    const cobroTipico = mediana(g.items.map((t) => t.valor));
    const comisionTipica = comisionesPropias.length ? mediana(comisionesPropias) : null;
    const recargosTipicos = calcularRecargos(cobroTipico, {
      enDolares, comisionReal: comisionTipica, esCuentaDebito, tarifas,
    });
    const anual = (cobroTipico + recargosTipicos.total) * (VECES_AL_ANIO[periodo] ?? 12);

    comercios.push({
      ...g,
      recurrenciaConfirmada: recurrencia.confirmada,
      periodo,
      periodoEsSupuesto,
      enDolares,
      conteo: g.items.length,
      cobrado,                       // lo que aparece en el extracto
      recargos,                      // lo que el banco le monta encima
      costoReal: cobrado + recargos.total,
      cobroTipico,
      anual,
    });
  }

  comercios.sort((a, b) => b.costoReal - a.costoReal);

  const cobradoTotal = comercios.reduce((a, c) => a + c.cobrado, 0);
  const recargosTotal = comercios.reduce((a, c) => a + c.recargos.total, 0);

  return {
    comercios,
    cobradoTotal,                          // lo que "ves"
    recargosTotal,                         // lo que se le suma encima
    costoRealTotal: cobradoTotal + recargosTotal,
    // Estimación de cuánto de lo ya pagado fue margen de cambio del banco.
    // No se suma a nada: ya está adentro de cobradoTotal.
    spreadIncluidoTotal: comercios.reduce((a, c) => a + c.recargos.spreadIncluido, 0),
    anualTotal: comercios.reduce((a, c) => a + c.anual, 0),
    porCategoria: agruparPorCategoria(comercios),
    enDolares: comercios.filter((c) => c.enDolares),
    sinConfirmar: comercios.filter((c) => !c.recurrenciaConfirmada),
    // Comisiones internacionales que no pudimos amarrar a ninguna suscripción
    // (seguro son de compras sueltas). Quedan aquí para no desaparecerlas.
    comisionesSinAtribuir: sinAtribuir,
  };
}

/**
 * Lo que el banco le monta encima a un cargo.
 *
 * Aquí hay dos cosas que NO son lo mismo y meterlas en el mismo saco sería mentir:
 *
 * - La comisión internacional SE SUMA: es plata que salió de tu cuenta en una
 *   línea aparte del extracto. Si el extracto ya la trae (`comisionReal`), la
 *   usamos tal cual; si no, la estimamos y lo decimos.
 *
 * - El spread de TRM NO se suma: ya está ADENTRO del monto en pesos que te
 *   cobraron. El banco no te manda una línea que diga "mi margen de cambio":
 *   te da una tasa peor y ya. Sumarlo sería inventar plata que nunca salió de
 *   tu cuenta. Lo devolvemos aparte, como estimación de cuánto de lo que ya
 *   pagaste fue margen del banco.
 */
export function calcularRecargos(montoCOP, {
  enDolares,
  comisionReal = null,
  esCuentaDebito,
  tarifas = TARIFAS,
}) {
  if (!montoCOP || montoCOP <= 0) return vacio();

  let comisionIntl = 0;
  let ivaComision = 0;
  let estimado = false;

  if (enDolares) {
    if (comisionReal != null) {
      // Del extracto. Su IVA ya viene en la línea de IVA del banco, que el
      // motor de intereses cuenta: no lo sumamos otra vez.
      comisionIntl = comisionReal;
    } else {
      comisionIntl = montoCOP * tarifas.comisionInternacional;
      ivaComision = comisionIntl * tarifas.iva;
      estimado = true;
    }
  }
  const gmf = esCuentaDebito ? montoCOP * tarifas.gmf : 0;

  return {
    comisionIntl,
    ivaComision,
    gmf,
    estimado,
    // Solo lo que de verdad se suma al monto del extracto.
    total: comisionIntl + ivaComision + gmf,
    // Informativo: cuánto de lo que YA pagaste fue margen de cambio.
    spreadIncluido: enDolares ? montoCOP * tarifas.spreadTRM : 0,
  };
}

function vacio() {
  return { comisionIntl: 0, ivaComision: 0, gmf: 0, estimado: false, total: 0, spreadIncluido: 0 };
}

/**
 * Empareja las líneas de comisión internacional del extracto con la compra
 * que las causó: misma fecha, comercio internacional, una comisión por compra.
 * Lo que no logremos emparejar se devuelve para que no se pierda del conteo.
 */
function atribuirComisiones(comisionesFX, itemsIntl) {
  const porTx = new Map();
  const sinAtribuir = [];
  const disponibles = [...itemsIntl];

  for (const c of comisionesFX) {
    const idx = disponibles.findIndex(
      (t) => Math.abs(diasEntre(t.fecha, c.fecha)) <= 1 && !porTx.has(t.id)
    );
    if (idx === -1) { sinAtribuir.push(c); continue; }
    porTx.set(disponibles[idx].id, c.valor);
  }
  return { porTx, sinAtribuir };
}

function agruparPorCategoria(comercios) {
  const mapa = new Map();
  for (const c of comercios) {
    const cat = c.categoria || 'otros';
    if (!mapa.has(cat)) {
      mapa.set(cat, { clave: cat, ...(CATEGORIAS[cat] || CATEGORIAS.otros), total: 0, anual: 0, comercios: [] });
    }
    const g = mapa.get(cat);
    g.total += c.costoReal;
    g.anual += c.anual;
    g.comercios.push(c);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

export function mediana(nums) {
  if (!nums.length) return 0;
  const o = [...nums].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Cuántos meses distintos cubren estas transacciones. */
export function mesesCubiertos(transacciones) {
  return new Set(transacciones.map((t) => claveMes(t.fecha)).filter(Boolean)).size;
}
