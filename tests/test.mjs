import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

import { parseNumero, parseTasa } from '../src/parse/numero.js';
import { parseFecha, claveMes, diasEntre } from '../src/parse/fecha.js';
import { contienePatron, normalizarDescripcion } from '../src/parse/normalizar.js';
import { detectarDelimitador, parsearCSV, detectarEncabezados, filasATransacciones, sugiereInvertirSigno } from '../src/parse/csv.js';
import { clasificarCargo, analizarInteres, estimarEA, eaAMensual } from '../src/motor/interes.js';
import { identificarComercio, analizarSuscripciones, calcularRecargos, mediana } from '../src/motor/suscripciones.js';
import { simularMinimo, simularCuotaFija, equivalencia, compararConCuotaFija } from '../src/motor/minimo.js';
import { parsearFila, esBancolombiaVisa, tasaEADelExtracto, periodoDelExtracto, transaccionesDeLineas } from '../src/parse/bancolombia-visa.js';
import { analizarDiferidos, interesPorPagar, claveComercio } from '../src/motor/diferidos.js';
import { analizarAvances } from '../src/motor/avances.js';
import { lineasATransacciones } from '../src/parse/pdf.js';

// --- Números --------------------------------------------------------------

test('parseNumero: formato colombiano', () => {
  assert.equal(parseNumero('$1.234.567,89'), 1234567.89);
  assert.equal(parseNumero('45.000'), 45000);          // cuarenta y cinco MIL
  assert.equal(parseNumero('1.500'), 1500);
  assert.equal(parseNumero('$ 26.900'), 26900);
  assert.equal(parseNumero('1.000.000'), 1000000);
  assert.equal(parseNumero('45,50'), 45.5);
});

test('parseNumero: formato anglosajón', () => {
  assert.equal(parseNumero('$1,234,567.89'), 1234567.89);
  assert.equal(parseNumero('19.99'), 19.99);
  assert.equal(parseNumero('1,500'), 1500);
});

test('parseNumero: negativos', () => {
  assert.equal(parseNumero('-45.000'), -45000);
  assert.equal(parseNumero('(1.500)'), -1500);
  assert.equal(parseNumero('50.000 CR'), -50000);
});

test('parseNumero: basura', () => {
  assert.equal(parseNumero(''), null);
  assert.equal(parseNumero(null), null);
  assert.equal(parseNumero('   '), null);
  assert.equal(parseNumero('N/A'), null);
  assert.equal(parseNumero('COP'), null);
  assert.equal(parseNumero(0), 0);
});

// --- Fechas ---------------------------------------------------------------

test('parseFecha: formatos colombianos', () => {
  assert.equal(claveMes(parseFecha('15/01/2026')), '2026-01');
  assert.equal(parseFecha('15/01/2026').getDate(), 15);
  assert.equal(claveMes(parseFecha('2026-01-15')), '2026-01');
  assert.equal(claveMes(parseFecha('15-ene-26')), '2026-01');
  assert.equal(claveMes(parseFecha('15 ENE 2026')), '2026-01');
  assert.equal(claveMes(parseFecha('15 de enero de 2026')), '2026-01');
});

test('parseFecha: DD/MM gana sobre MM/DD cuando es ambiguo', () => {
  const d = parseFecha('05/03/2026');
  assert.equal(d.getDate(), 5);
  assert.equal(d.getMonth(), 2); // marzo
});

test('parseFecha: se acomoda si el día no puede ser mes', () => {
  const d = parseFecha('25/03/2026');
  assert.equal(d.getDate(), 25);
  assert.equal(d.getMonth(), 2);
});

test('parseFecha: rechaza fechas imposibles', () => {
  assert.equal(parseFecha('31/02/2026'), null);
  assert.equal(parseFecha('cualquier cosa'), null);
  assert.equal(parseFecha(''), null);
});

test('diasEntre', () => {
  assert.equal(diasEntre(parseFecha('01/01/2026'), parseFecha('31/01/2026')), 30);
});

// --- Match de patrones ----------------------------------------------------

test('contienePatron respeta límites de palabra', () => {
  assert.ok(contienePatron(normalizarDescripcion('IVA COMISION'), 'IVA'));
  assert.ok(!contienePatron(normalizarDescripcion('CUENTA PRIVADA'), 'IVA'));
  assert.ok(!contienePatron(normalizarDescripcion('ASEGURADORA SOLIDARIA'), 'SEGURO'));
});

test('contienePatron atraviesa puntos y guiones', () => {
  assert.ok(contienePatron(normalizarDescripcion('NETFLIX.COM 1234'), 'NETFLIX'));
  assert.ok(contienePatron(normalizarDescripcion('APPLE.COM/BILL'), 'APPLE COM BILL'));
});

// --- CSV ------------------------------------------------------------------

const CSV_BANCO = `Extracto de cuenta
Cliente: JUAN PEREZ
Periodo: 01/01/2026 - 31/01/2026

Fecha;Descripcion;Valor;Saldo
15/01/2026;NETFLIX.COM 8829;$26.900;$1.200.000
16/01/2026;INTERESES CORRIENTES;$142.500;$1.057.500
17/01/2026;CUOTA DE MANEJO TARJETA;$19.900;$1.037.600
18/01/2026;OPENAI CHATGPT SUBSCR;$88.400;$949.200
20/01/2026;PAGO PSE NOMINA;-$2.000.000;$2.949.200`;

test('detectarDelimitador encuentra punto y coma', () => {
  assert.equal(detectarDelimitador(CSV_BANCO), ';');
});

test('detectarEncabezados salta la basura de arriba', () => {
  const { filas } = parsearCSV(CSV_BANCO);
  const enc = detectarEncabezados(filas);
  assert.ok(enc, 'debería encontrar encabezados');
  assert.equal(filas[enc.fila][0], 'Fecha');
  assert.equal(enc.mapa.fecha, 0);
  assert.equal(enc.mapa.descripcion, 1);
  assert.equal(enc.mapa.valor, 2);
  assert.equal(enc.mapa.saldo, 3);
});

test('filasATransacciones convierte correctamente', () => {
  const { filas } = parsearCSV(CSV_BANCO);
  const enc = detectarEncabezados(filas);
  const { transacciones } = filasATransacciones(filas, enc.mapa, { filaEncabezado: enc.fila });
  assert.equal(transacciones.length, 5);
  assert.equal(transacciones[0].descripcion, 'NETFLIX.COM 8829');
  assert.equal(transacciones[0].valor, 26900);
  assert.equal(transacciones[4].valor, -2000000); // el pago entra, no sale
});

test('CSV con comillas y comas adentro', () => {
  const csv = 'Fecha,Descripcion,Valor\n15/01/2026,"NETFLIX, INC",26900';
  const { filas } = parsearCSV(csv);
  assert.equal(filas[1][1], 'NETFLIX, INC');
  assert.equal(filas[1][2], '26900');
});

test('CSV con columnas debito/credito separadas', () => {
  const csv = `Fecha;Concepto;Debitos;Creditos
15/01/2026;NETFLIX;26.900;
20/01/2026;PAGO NOMINA;;2.000.000`;
  const { filas } = parsearCSV(csv);
  const enc = detectarEncabezados(filas);
  const { transacciones } = filasATransacciones(filas, enc.mapa, { filaEncabezado: enc.fila });
  assert.equal(transacciones[0].valor, 26900);    // débito = sale
  assert.equal(transacciones[1].valor, -2000000); // crédito = entra
});

test('sugiereInvertirSigno detecta extractos al revés', () => {
  const alReves = [
    { valor: -100 }, { valor: -200 }, { valor: -300 }, { valor: -400 }, { valor: 5000 },
  ];
  assert.equal(sugiereInvertirSigno(alReves), true);
  const normal = [
    { valor: 100 }, { valor: 200 }, { valor: 300 }, { valor: 400 }, { valor: -5000 },
  ];
  assert.equal(sugiereInvertirSigno(normal), false);
});

// --- Motor de intereses ---------------------------------------------------

test('clasificarCargo: mora le gana a interés corriente', () => {
  assert.equal(clasificarCargo('INTERESES DE MORA').clave, 'interes_mora');
  assert.equal(clasificarCargo('INTERESES CORRIENTES').clave, 'interes_corriente');
  assert.equal(clasificarCargo('INTERES DE AVANCE').clave, 'interes_avance');
});

test('clasificarCargo: comisión de avance le gana a comisión genérica', () => {
  assert.equal(clasificarCargo('COMISION POR AVANCE').clave, 'comision_avance');
  assert.equal(clasificarCargo('COMISION TRANSFERENCIA').clave, 'comision_otra');
});

test('clasificarCargo: una compra normal no es cargo', () => {
  assert.equal(clasificarCargo('EXITO POBLADO MEDELLIN'), null);
  assert.equal(clasificarCargo('NETFLIX.COM'), null);
});

test('analizarInteres suma el costo real, no solo los intereses', () => {
  const tx = [
    { id: '1', valor: 142500, descripcion: 'INTERESES CORRIENTES', fecha: new Date() },
    { id: '2', valor: 19900, descripcion: 'CUOTA DE MANEJO TARJETA', fecha: new Date() },
    { id: '3', valor: 12000, descripcion: 'SEGURO DE VIDA DEUDORES', fecha: new Date() },
    { id: '4', valor: 3800, descripcion: 'IVA COMISION', fecha: new Date() },
    { id: '5', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date() },
  ];
  const r = analizarInteres(tx);
  assert.equal(r.totalIntereses, 142500);
  assert.equal(r.totalCargos, 19900 + 12000 + 3800);
  assert.equal(r.costoTotal, 178200);
  // Netflix no entra al costo de la deuda
  assert.ok(!r.detalle.some((d) => d.descripcion.includes('NETFLIX')));
});

test('analizarInteres respeta exclusiones del usuario', () => {
  const tx = [
    { id: '1', valor: 142500, descripcion: 'INTERESES CORRIENTES', fecha: new Date() },
    { id: '2', valor: 12000, descripcion: 'SEGURO DE VIDA DEUDORES', fecha: new Date() },
  ];
  const r = analizarInteres(tx, { excluidos: new Set(['2']) });
  assert.equal(r.costoTotal, 142500);
});

test('analizarInteres ignora los abonos', () => {
  const tx = [{ id: '1', valor: -500000, descripcion: 'PAGO INTERESES', fecha: new Date() }];
  assert.equal(analizarInteres(tx).costoTotal, 0);
});

test('estimarEA', () => {
  // 2% mensual -> (1.02)^12 - 1 = 26,82% E.A.
  const ea = estimarEA(20000, 1000000);
  assert.ok(Math.abs(ea - 0.2682) < 0.001, `ea fue ${ea}`);
  assert.equal(estimarEA(0, 1000000), null);
  assert.equal(estimarEA(20000, 0), null);
});

test('eaAMensual es el inverso de estimarEA', () => {
  const mensual = eaAMensual(0.2682);
  assert.ok(Math.abs(mensual - 0.02) < 0.0001);
});

// --- Motor de suscripciones -----------------------------------------------

test('identificarComercio con basura alrededor', () => {
  assert.equal(identificarComercio('NETFLIX.COM 8829 LOS GATOS').nombre, 'Netflix');
  assert.equal(identificarComercio('SPOTIFY P0A3F STOCKHOLM').nombre, 'Spotify');
  assert.equal(identificarComercio('OPENAI *CHATGPT SUBSCR').nombre, 'ChatGPT (OpenAI)');
});

test('identificarComercio prefiere el patrón más largo', () => {
  assert.equal(identificarComercio('APPLE MUSIC MENSUAL').nombre, 'Apple Music');
});

test('identificarComercio no inventa', () => {
  assert.equal(identificarComercio('PANADERIA LA ESQUINA'), null);
  assert.equal(identificarComercio('EXITO POBLADO'), null);
});

test('calcularRecargos: en dólares duele más', () => {
  const r = calcularRecargos(100000, { enDolares: true, esCuentaDebito: false });
  // 3% comisión + 19% IVA sobre esa comisión
  assert.equal(Math.round(r.comisionIntl), 3000);
  assert.equal(Math.round(r.ivaComision), 570);
  assert.equal(Math.round(r.total), 3570);
  assert.equal(r.estimado, true);
});

test('calcularRecargos: el spread NO se suma, ya está adentro del monto', () => {
  const r = calcularRecargos(100000, { enDolares: true, esCuentaDebito: false });
  // El banco no te manda una línea con su margen de cambio: te da mala tasa.
  // Sumarlo sería inventar plata que nunca salió de la cuenta.
  assert.equal(Math.round(r.spreadIncluido), 2000);
  assert.ok(!('spread' in r), 'no debe existir un spread sumable');
  assert.equal(Math.round(r.total), 3570, 'total no incluye el spread');
});

test('calcularRecargos: si el extracto trae la comisión, no la estimamos', () => {
  const r = calcularRecargos(100000, { enDolares: true, comisionReal: 2500, esCuentaDebito: false });
  assert.equal(r.comisionIntl, 2500, 'usa la del extracto, no el 3%');
  assert.equal(r.ivaComision, 0, 'el IVA real ya viene en la línea de IVA del banco');
  assert.equal(r.total, 2500);
  assert.equal(r.estimado, false);
});

test('calcularRecargos: en pesos sin 4x1000 no hay recargo', () => {
  const r = calcularRecargos(100000, { enDolares: false, esCuentaDebito: false });
  assert.equal(r.total, 0);
});

test('calcularRecargos: cuenta débito paga 4x1000', () => {
  const r = calcularRecargos(100000, { enDolares: false, esCuentaDebito: true });
  assert.equal(Math.round(r.gmf), 400);
});

test('analizarSuscripciones: un solo mes, detecta por diccionario', () => {
  const tx = [
    { id: '1', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 0, 15), moneda: null },
    { id: '2', valor: 88400, descripcion: 'OPENAI CHATGPT COMPRA INTERNACIONAL', fecha: new Date(2026, 0, 18), moneda: null },
    { id: '3', valor: 45000, descripcion: 'EXITO POBLADO', fecha: new Date(2026, 0, 19), moneda: null },
  ];
  const r = analizarSuscripciones(tx);
  assert.equal(r.comercios.length, 2, 'Éxito no es suscripción');
  assert.equal(r.cobradoTotal, 115300);
  // ChatGPT es internacional -> tiene recargos; Netflix en COP no.
  const gpt = r.comercios.find((c) => c.nombre.includes('OpenAI'));
  assert.ok(gpt.enDolares);
  assert.ok(gpt.recargos.total > 0);
  const nf = r.comercios.find((c) => c.nombre === 'Netflix');
  assert.equal(nf.recargos.total, 0);
  // Con un solo mes no se puede confirmar recurrencia.
  assert.equal(nf.recurrenciaConfirmada, false);
  assert.equal(nf.periodoEsSupuesto, true);
});

test('analizarSuscripciones: con dos meses confirma recurrencia', () => {
  const tx = [
    { id: '1', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 0, 15) },
    { id: '2', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 1, 15) },
  ];
  const r = analizarSuscripciones(tx);
  const nf = r.comercios[0];
  assert.equal(nf.recurrenciaConfirmada, true);
  assert.equal(nf.periodo, 'mensual');
  assert.equal(nf.anual, 26900 * 12);
});

test('analizarSuscripciones: anualiza sobre el cobro típico, no sobre la suma', () => {
  // Tres meses de Netflix: anual debe ser 12x el cobro mensual, no 12x la suma.
  const tx = [
    { id: '1', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 0, 15) },
    { id: '2', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 1, 15) },
    { id: '3', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 2, 15) },
  ];
  const r = analizarSuscripciones(tx);
  assert.equal(r.comercios[0].anual, 26900 * 12);
  assert.equal(r.comercios[0].cobrado, 26900 * 3); // lo cobrado en el periodo sí es la suma
});

test('analizarSuscripciones: detecta suscripción anual', () => {
  const tx = [
    { id: '1', valor: 500000, descripcion: 'ADOBE SUBSCRIPTION', fecha: new Date(2025, 0, 15) },
    { id: '2', valor: 500000, descripcion: 'ADOBE SUBSCRIPTION', fecha: new Date(2026, 0, 15) },
  ];
  const r = analizarSuscripciones(tx);
  assert.equal(r.comercios[0].periodo, 'anual');
  assert.equal(r.comercios[0].recurrenciaConfirmada, true);
});

test('analizarSuscripciones: pista de recurrencia para comercios desconocidos', () => {
  const tx = [
    { id: '1', valor: 39900, descripcion: 'PAGO RECURRENTE GIMNASIO XYZ', fecha: new Date(2026, 0, 15) },
  ];
  const r = analizarSuscripciones(tx);
  assert.equal(r.comercios.length, 1);
  assert.equal(r.comercios[0].categoria, 'sospechosa');
});

test('analizarSuscripciones: los cargos del banco no cuentan como suscripción', () => {
  const tx = [
    { id: '1', valor: 19900, descripcion: 'CUOTA DE MANEJO TARJETA', fecha: new Date(2026, 0, 15) },
  ];
  assert.equal(analizarSuscripciones(tx).comercios.length, 0);
});

test('mediana', () => {
  assert.equal(mediana([1, 2, 3]), 2);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([]), 0);
});

// --- Que ningún peso se cuente dos veces ----------------------------------
// Esto es lo único que esta herramienta no se puede dar el lujo de arruinar.

test('no se cuenta dos veces: la comisión del extracto va a suscripciones, no a la deuda', () => {
  const tx = [
    { id: '1', valor: 88400, descripcion: 'OPENAI CHATGPT COMPRA INTERNACIONAL', fecha: new Date(2026, 0, 5) },
    { id: '2', valor: 2652, descripcion: 'COMISION TRANSACCION INTERNACIONAL', fecha: new Date(2026, 0, 5) },
    { id: '3', valor: 142500, descripcion: 'INTERESES CORRIENTES', fecha: new Date(2026, 0, 28) },
  ];

  const interes = analizarInteres(tx, { separarFX: true });
  const subs = analizarSuscripciones(tx, { comisionesFX: interes.cargosFX });

  // La comisión salió del costo de la deuda...
  assert.equal(interes.costoTotal, 142500, 'la deuda no carga con la comisión FX');
  assert.equal(interes.cargosFX.length, 1);

  // ...y entró a suscripciones con su valor REAL, no con el 3% estimado.
  const gpt = subs.comercios[0];
  assert.equal(gpt.recargos.comisionIntl, 2652, 'usa la comisión del extracto');
  assert.equal(gpt.recargos.estimado, false);
  assert.equal(gpt.costoReal, 88400 + 2652);

  // Y la suma de las dos tarjetas es exactamente la plata que salió.
  const total = interes.costoTotal + subs.costoRealTotal;
  assert.equal(total, 142500 + 88400 + 2652, 'ni un peso de más ni de menos');
});

test('no se cuenta dos veces: sin comisión en el extracto sí estimamos', () => {
  const tx = [
    { id: '1', valor: 88400, descripcion: 'OPENAI CHATGPT COMPRA INTERNACIONAL', fecha: new Date(2026, 0, 5) },
  ];
  const interes = analizarInteres(tx, { separarFX: true });
  const subs = analizarSuscripciones(tx, { comisionesFX: interes.cargosFX });
  const gpt = subs.comercios[0];
  assert.equal(gpt.recargos.estimado, true, 'sin dato real, estimamos y lo decimos');
  assert.ok(gpt.recargos.comisionIntl > 0);
});

test('no se cuenta dos veces: sin separarFX la comisión se queda en la deuda', () => {
  const tx = [
    { id: '2', valor: 2652, descripcion: 'COMISION TRANSACCION INTERNACIONAL', fecha: new Date(2026, 0, 5) },
  ];
  assert.equal(analizarInteres(tx).costoTotal, 2652);
  assert.equal(analizarInteres(tx, { separarFX: true }).costoTotal, 0);
});

test('una comisión que no matchea ninguna suscripción no se pierde', () => {
  const tx = [
    // Comisión de una compra suelta en Amazon, no de una suscripción.
    { id: '1', valor: 5000, descripcion: 'COMISION TRANSACCION INTERNACIONAL', fecha: new Date(2026, 5, 9) },
    { id: '2', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 0, 15) },
  ];
  const interes = analizarInteres(tx, { separarFX: true });
  const subs = analizarSuscripciones(tx, { comisionesFX: interes.cargosFX });
  assert.equal(subs.comisionesSinAtribuir.length, 1, 'queda reportada, no desaparece');
  assert.equal(subs.comercios[0].recargos.total, 0, 'Netflix en COP no carga esa comisión');
});

test('el spread se reporta pero no infla el total', () => {
  const tx = [
    { id: '1', valor: 100000, descripcion: 'ADOBE COMPRA INTERNACIONAL', fecha: new Date(2026, 0, 5) },
  ];
  const subs = analizarSuscripciones(tx);
  assert.ok(subs.spreadIncluidoTotal > 0, 'lo estimamos para mostrarlo');
  // costoReal = cobrado + comisión + IVA. El spread NO entra.
  assert.equal(subs.costoRealTotal, 100000 + 3000 + 570);
});

// --- Simulador del mínimo -------------------------------------------------

test('simularMinimo devuelve un plazo largo y caro', () => {
  const r = simularMinimo(5000000, 0.28);
  assert.ok(!r.nuncaTermina);
  assert.ok(r.meses > 24, `duró ${r.meses} meses`);
  assert.ok(r.totalIntereses > 0);
  assert.ok(r.totalPagado > 5000000);
});

test('simularMinimo: si el mínimo no cubre el interés, no termina nunca', () => {
  // 1% de mínimo contra 40% E.A. sobre un saldo enorme -> el piso no alcanza
  const r = simularMinimo(500000000, 0.40, { porcentajeMinimo: 0.001, pisoMinimo: 1000 });
  assert.equal(r.nuncaTermina, true);
  assert.equal(r.meses, null);
});

test('simularMinimo: entradas inválidas', () => {
  assert.equal(simularMinimo(0, 0.28), null);
  assert.equal(simularMinimo(-100, 0.28), null);
  assert.equal(simularMinimo(1000000, null), null);
});

test('cuota fija le gana al mínimo', () => {
  const min = simularMinimo(5000000, 0.28);
  const fija = simularCuotaFija(5000000, 0.28, 500000);
  assert.ok(fija.meses < min.meses);
  assert.ok(fija.totalIntereses < min.totalIntereses);
});

test('las dos simulaciones devuelven curva graficable', () => {
  // El gráfico depende de esto. simularCuotaFija no devolvía curva y por eso
  // solo se dibujaba una línea de las dos.
  const min = simularMinimo(5000000, 0.28);
  const fija = simularCuotaFija(5000000, 0.28, 500000);
  for (const [nombre, sim] of [['mínimo', min], ['cuota fija', fija]]) {
    assert.ok(Array.isArray(sim.curva), `${nombre} debe traer curva`);
    assert.equal(sim.curva.length, sim.meses, `${nombre}: un punto por mes`);
    assert.ok(sim.curva.every((p) => p.saldo >= 0), `${nombre}: saldo nunca negativo`);
    // El saldo solo baja.
    for (let i = 1; i < sim.curva.length; i++) {
      assert.ok(sim.curva[i].saldo <= sim.curva[i - 1].saldo, `${nombre}: la curva no puede subir`);
    }
    assert.equal(sim.curva[sim.curva.length - 1].saldo, 0, `${nombre}: termina en cero`);
  }
});

test('simularCuotaFija: cuota que no cubre el interés no termina', () => {
  const r = simularCuotaFija(10000000, 0.30, 1000);
  assert.equal(r.nuncaTermina, true);
});

test('equivalencia elige una escala que se sienta', () => {
  const e = equivalencia(180000);
  assert.ok(e.cantidad >= 2 && e.cantidad <= 40, `dio ${e.cantidad} ${e.nombre}`);
  assert.equal(equivalencia(0), null);
});

// --- Extracto Bancolombia Visa detallado ----------------------------------
// Filas reales (anonimizadas en el comercio, montos tal cual salieron del PDF).
// Este preset es el primero construido contra un extracto de verdad; el parser
// genérico se comía 134 de 135 movimientos.

// Las tasas son floats: comparar con igualdad estricta es una trampa
// (28.7548/100 da 0.28754799999999997 en IEEE754).
const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

test('parseTasa: las tasas traen 4 decimales, no son plata', () => {
  // El bug: parseNumero('28,7548') daba 287548 porque asume miles.
  cerca(parseTasa('28,7548 %'), 0.287548);
  cerca(parseTasa('2,1285 %'), 0.021285);
  assert.equal(parseTasa('0,0000 %'), 0);
  cerca(parseTasa('28.7548'), 0.287548);   // por si el banco usa punto
  assert.equal(parseTasa(''), null);
  assert.equal(parseTasa('N/A'), null);
});

test('parseNumero sigue leyendo plata como plata', () => {
  // La corrección de tasas no puede romper esto: 45.000 son cuarenta y cinco mil.
  assert.equal(parseNumero('45.000'), 45000);
  assert.equal(parseNumero('$ 3.600.000,00'), 3600000);
  assert.equal(parseNumero('$ 5.000.000,00'), 5000000);
});

test('bancolombia: fila diferida a 36 cuotas', () => {
  const f = parsearFila('845423 09/06/2026 SUSCRIPCION EJEMPLO $ 3.600.000,00 1/36 $ 100.000,00 2,1285 % 28,7548 % $ 3.500.000,00');
  assert.equal(f.descripcion, 'SUSCRIPCION EJEMPLO');
  assert.equal(f.valorMovimiento, 3600000, 'lo que compraste');
  assert.equal(f.valorCuota, 100000, 'lo que te cobraron este mes');
  assert.equal(f.saldoPendiente, 3500000, 'lo que falta');
  assert.equal(f.valor, 100000, 'valor = la cuota, no la compra ni el saldo');
  assert.deepEqual(f.cuotas, { n: 1, total: 36 });
  cerca(f.tasaMensual, 0.021285);
  cerca(f.tasaEA, 0.287548);
});

test('bancolombia: la cuota es capital puro, el interés va aparte', () => {
  // 3.600.000 / 36 = 100.000 exacto. Si el interés viviera adentro de la cuota,
  // la cuota sería mayor. Esto justifica contar los intereses como su
  // propia transacción en vez de repartirlos entre las cuotas.
  const f = parsearFila('845423 09/06/2026 SUSCRIPCION EJEMPLO $ 3.600.000,00 1/36 $ 100.000,00 2,1285 % 28,7548 % $ 3.500.000,00');
  assert.ok(Math.abs(f.valorCuota - f.valorMovimiento / 36) < 0.05);
  assert.ok(Math.abs(f.saldoPendiente - (f.valorMovimiento - f.valorCuota)) < 0.05);
});

test('bancolombia: fila sin cuotas ni autorización se cobra completa', () => {
  const f = parsearFila('15/06/2026 INTERESES CORRIENTES $ 150.000,00 $ 150.000,00 $ 0,00');
  assert.equal(f.descripcion, 'INTERESES CORRIENTES');
  assert.equal(f.valor, 150000);
  assert.equal(f.cuotas, null);
  assert.equal(f.saldoPendiente, 0);
  assert.equal(clasificarCargo(f.descripcion).clave, 'interes_corriente');
});

test('bancolombia: cuota de manejo con autorización 000000', () => {
  const f = parsearFila('000000 15/06/2026 CUOTA DE MANEJO $ 19.900,00 $ 19.900,00 $ 0,00');
  assert.equal(f.valor, 19900);
  assert.equal(clasificarCargo(f.descripcion).clave, 'cuota_manejo');
});

test('bancolombia: la línea del periodo NO es un movimiento', () => {
  // Esto era lo único que el parser genérico "encontraba": el encabezado del
  // periodo, leído como una compra del 18 de mayo por el cupo total.
  assert.equal(parsearFila('18 may - 15 jun. 2026 $ 5.000.000,00 $ 5.000.000,00 $ 5.000.000,00'), null);
  assert.equal(parsearFila('+ Saldo anterior $ 5.000.000,00'), null);
  assert.equal(parsearFila('Cupo total: $ 5.000.000,00'), null);
  assert.equal(parsearFila('$ 1.000.000,00 $ 1.000.000,00 $ 1.000.000,00'), null);
});

test('bancolombia: detecta por la forma de los datos, no por el encabezado', () => {
  // El encabezado REAL del PDF: cada título partido en dos líneas y repetido
  // tres veces por la maquetación. Buscar "número de autorización" como frase
  // fallaba aquí — por eso detectamos por la forma de las filas.
  const lineas = [
    'Número de Número de Número de Valor Valor Valor Número Número Número Valor Valor Valor % Interés % Interés % Interés Saldo Saldo Saldo',
    'autorización autorización autorización movimiento movimiento movimiento cuotas cuotas cuotas Couta/Abono Couta/Abono Couta/Abono mensual mensual mensual pendiente pendiente pendiente',
    '845423 09/06/2026 SUSCRIPCION EJEMPLO $ 3.600.000,00 1/36 $ 100.000,00 2,1285 % 28,7548 % $ 3.500.000,00',
    '963901 01/06/2026 SERVICIO DOS $ 360.000,00 1/36 $ 10.000,00 2,0849 % 28,0967 % $ 350.000,00',
    '112508 29/05/2026 SERVICIO TRES INC $ 720.000,00 1/36 $ 20.000,00 2,0849 % 28,0967 % $ 700.000,00',
  ];
  assert.equal(esBancolombiaVisa(lineas), true);
});

test('bancolombia: no se confunde con otros extractos', () => {
  assert.equal(esBancolombiaVisa(['Fecha;Descripcion;Valor', '15/01/2026;NETFLIX;26.900']), false);
  // Un extracto simple: una sola cifra por fila, no tres.
  assert.equal(esBancolombiaVisa([
    '15/01/2026 NETFLIX.COM $ 26.900',
    '16/01/2026 SPOTIFY $ 16.900',
    '17/01/2026 EXITO $ 145.300',
  ]), false);
});

test('bancolombia: tasa E.A. ponderada por saldo, no promedio simple', () => {
  const tx = [
    { tasaEA: 0.30, saldoPendiente: 9000 },   // la plata gorda
    { tasaEA: 0.10, saldoPendiente: 1000 },
  ];
  const ea = tasaEADelExtracto(tx);
  // Ponderada: (0.30*9000 + 0.10*1000)/10000 = 0.28. Promedio simple daría 0.20.
  assert.ok(Math.abs(ea - 0.28) < 0.0001, `dio ${ea}`);
  assert.equal(tasaEADelExtracto([]), null);
});

// --- Motor de diferidos ---------------------------------------------------

test('diferidos: separa la compra de la cuota y del saldo', () => {
  const tx = [
    { id: '1', descripcion: 'SUSCRIPCION EJEMPLO', fecha: new Date(2026, 5, 9), valor: 100000,
      valorMovimiento: 3600000, valorCuota: 100000, saldoPendiente: 3500000,
      cuotas: { n: 1, total: 36 }, tasaEA: 0.287548 },
    { id: '2', descripcion: 'INTERESES CORRIENTES', fecha: new Date(2026, 5, 15), valor: 150000,
      valorMovimiento: 150000, valorCuota: 150000, saldoPendiente: 0, cuotas: null, tasaEA: null },
  ];
  const d = analizarDiferidos(tx, { interesDelMes: 150000 });
  assert.equal(d.conteo, 1, 'los intereses no son una compra diferida');
  assert.equal(d.comprado, 3600000);
  assert.equal(d.cuotaMensual, 100000);
  assert.equal(d.saldoPendiente, 3500000);
  // 35, no 36: el saldo del extracto ya viene neto de la cuota de este mes
  // (3.600.000 - 100.000 = 3.500.000). La regla que lo ancla:
  assert.equal(d.items[0].restantes, 35);
  assert.equal(d.items[0].restantes * d.items[0].valorCuota, d.items[0].saldoPendiente,
    'restantes * cuota debe dar exactamente el saldo pendiente');
  assert.equal(d.items[0].esSuscripcion, false, 'un comercio desconocido no es suscripción');
  // El interés real del extracto manda sobre cualquier cuenta nuestra.
  assert.equal(d.costoMensualDelSaldo, 150000);
});

test('diferidos: reconoce suscripciones financiadas', () => {
  const tx = [
    { id: '1', descripcion: 'OPENAI *CHATGPT', fecha: new Date(2026, 5, 9), valor: 2000,
      valorMovimiento: 72000, valorCuota: 2000, saldoPendiente: 70000,
      cuotas: { n: 1, total: 36 }, tasaEA: 0.28 },
  ];
  const d = analizarDiferidos(tx);
  assert.equal(d.suscripcionesDiferidas.length, 1);
  assert.equal(d.suscripcionesDiferidas[0].nombre, 'ChatGPT (OpenAI)');
  assert.equal(d.suscripcionesDiferidas[0].restantes, 35);
});

test('diferidos: sin cuotas no hay bloque', () => {
  assert.equal(analizarDiferidos([{ id: '1', descripcion: 'NETFLIX', valor: 26900, cuotas: null }]), null);
});

test('interesPorPagar: proyecta sobre el capital que se va pagando', () => {
  const items = [{ valorCuota: 1000, restantes: 10, saldoPendiente: 10000 }];
  const r = interesPorPagar(items, 0.28);
  assert.ok(r.interesTotal > 0);
  assert.equal(r.meses, 10);
  // Menos que si el saldo se quedara quieto los 10 meses: el capital baja.
  const quieto = 10000 * (((1.28) ** (1 / 12)) - 1) * 10;
  assert.ok(r.interesTotal < quieto, 'el saldo amortiza, no se queda quieto');
  assert.equal(interesPorPagar([], 0.28), null);
  assert.equal(interesPorPagar(items, 0), null);
});

test('diferidos: detecta el apilamiento — lo mismo diferido mes tras mes', () => {
  // El caso real: pagas Claude todos los meses y el banco difiere CADA cobro
  // a 36 cuotas. Al mes 3 tienes 3 cuotas de Claude corriendo a la vez.
  // "3 suscripciones diferidas" sería mentira: es UNA, apilada 3 veces.
  const claude = (n, mes) => ({
    id: `c${n}`, descripcion: 'ANTHROPIC CLAUDE', fecha: new Date(2026, mes, 5),
    valor: 2000, valorMovimiento: 72000, valorCuota: 2000,
    saldoPendiente: 72000 - 2000 * n, cuotas: { n, total: 36 }, tasaEA: 0.28,
  });
  const d = analizarDiferidos([claude(3, 3), claude(2, 4), claude(1, 5)]);

  assert.equal(d.conteo, 3, 'tres cuotas vivas');
  assert.equal(d.apiladas.length, 1, 'pero un solo comercio');
  assert.equal(d.comerciosSuscripcion, 1);
  assert.equal(d.apiladas[0].nombre, 'Claude (Anthropic)');
  assert.equal(d.apiladas[0].cuotasVivas, 3);
  assert.equal(d.apiladas[0].cuotaMensual, 6000, 'pagas 3 cuotas a la vez del mismo servicio');
  assert.equal(d.seApilan.length, 1);
});

test('diferidos: una compra suelta no se considera apilada', () => {
  const d = analizarDiferidos([
    { id: '1', descripcion: 'ALKOSTO', fecha: new Date(2026, 5, 1), valor: 100,
      valorMovimiento: 3600, valorCuota: 100, saldoPendiente: 3500,
      cuotas: { n: 1, total: 36 }, tasaEA: 0.28 },
  ]);
  assert.equal(d.apiladas.length, 1);
  assert.equal(d.seApilan.length, 0, 'una sola cuota viva no es apilamiento');
});

test('diferidos: el mismo comercio escrito distinto se agrupa igual', () => {
  // Pasó con un extracto real: el mismo comercio escrito de dos formas salía
  // como dos, y partía el apilamiento en 7+7 en vez de 14 — subestimando
  // exactamente lo que este bloque existe para medir.
  assert.equal(claveComercio('ACME INC'), claveComercio('ACME'));
  assert.equal(claveComercio('WIDGET.IO'), claveComercio('WIDGET'));
  assert.equal(claveComercio('WIDGET 845423'), claveComercio('WIDGET'));
  // Pero no colapsa comercios que sí son distintos.
  assert.notEqual(claveComercio('ACME'), claveComercio('WIDGET'));

  const mk = (desc, n) => ({
    id: desc + n, descripcion: desc, fecha: new Date(2026, n, 5), valor: 100,
    valorMovimiento: 3600, valorCuota: 100, saldoPendiente: 3000,
    cuotas: { n, total: 36 }, tasaEA: 0.28,
  });
  const d = analizarDiferidos([mk('ACME INC', 1), mk('ACME', 2), mk('ACME INC 998877', 3)]);
  assert.equal(d.apiladas.length, 1, 'un solo comercio, no tres');
  assert.equal(d.apiladas[0].cuotasVivas, 3);
  assert.equal(d.apiladas[0].nombre, 'ACME', 'se queda con el nombre limpio');
});

test('bancolombia: lee el periodo del encabezado, no de las filas', () => {
  // Sin esto la app decía "esto te costó en 18 meses" sobre un extracto de UN
  // mes, porque las cuotas conservan la fecha de compra (hasta año y medio atrás).
  const p = periodoDelExtracto(['18 may - 15 jun. 2026 $ 5.000.000,00 $ 5.000.000,00 $ 5.000.000,00']);
  assert.equal(claveMes(p.fin), '2026-06');
  assert.equal(claveMes(p.inicio), '2026-05');
});

test('bancolombia: periodo que cruza de año', () => {
  const p = periodoDelExtracto(['18 dic - 15 ene. 2026 $ 1,00 $ 1,00 $ 1,00']);
  assert.equal(claveMes(p.fin), '2026-01');
  assert.equal(claveMes(p.inicio), '2025-12', 'el inicio cae en el año anterior');
});

test('bancolombia: sin encabezado de periodo devuelve null', () => {
  assert.equal(periodoDelExtracto(['845423 09/06/2026 SUSCRIPCION EJEMPLO $ 3.600.000,00 1/36 $ 100.000,00 2,1285 % 28,7548 % $ 3.500.000,00']), null);
});

test('ningún NaN se cuela a los totales', () => {
  // Un NaN envenena todo en silencio (NaN + 1 = NaN) y deja la tarjeta en "—"
  // sin explicar por qué. El guard debe ser explícito, no depender de que
  // parseNumero casualmente devuelva null en vez de NaN.
  const csv = `Fecha;Descripcion;Valor
15/01/2026;INTERESES CORRIENTES;abc
16/01/2026;CUOTA DE MANEJO;$19.900
17/01/2026;NETFLIX;n/a`;
  const { filas } = parsearCSV(csv);
  const enc = detectarEncabezados(filas);
  const { transacciones, descartadas } = filasATransacciones(filas, enc.mapa, { filaEncabezado: enc.fila });

  assert.equal(transacciones.length, 1, 'solo la fila con monto legible');
  assert.equal(descartadas, 2, 'las dos basuras se descartan');
  assert.ok(transacciones.every((t) => Number.isFinite(t.valor)), 'ni un valor no finito');

  const r = analizarInteres(transacciones);
  assert.ok(Number.isFinite(r.costoTotal), 'el total sobrevive');
  assert.equal(r.costoTotal, 19900);
});

test('bancolombia: una fila con monto ilegible se descarta, no se vuelve NaN', () => {
  const { transacciones, descartadas } = transaccionesDeLineas([
    '845423 09/06/2026 BUENA $ 3.600.000,00 1/36 $ 100.000,00 2,1285 % 28,7548 % $ 3.500.000,00',
    '845424 09/06/2026 BASURA $ ---,-- $ ---,-- $ ---,--',
  ]);
  assert.equal(transacciones.length, 1);
  assert.ok(transacciones.every((t) => Number.isFinite(t.valor)));
});

// ══════════════════════════════════════════════════════════════════════════
// LA INVARIANTE, COMO PROPIEDAD
// ──────────────────────────────────────────────────────────────────────────
// Los tests de arriba prueban CASOS. Este prueba la REGLA: para cualquier
// conjunto de transacciones, la plata que salió tiene que aparecer completa y
// una sola vez. Cuatro bugs reales vivían debajo de 74 tests verdes porque
// ninguno afirmaba esto en general.
// ══════════════════════════════════════════════════════════════════════════

function bucketsCuadran(tx, opciones = {}) {
  const interes = analizarInteres(tx, { separarFX: true, ...opciones });
  const subs = analizarSuscripciones(tx, { comisionesFX: interes.cargosFX, ...opciones });

  const salidas = tx.filter((t) => t.valor > 0);
  const total = salidas.reduce((a, t) => a + t.valor, 0);

  const contados = new Set([
    ...interes.detalle.map((d) => d.id),
    ...subs.comercios.flatMap((c) => c.items.map((i) => i.id)),
  ]);
  const normales = salidas.filter((t) => !contados.has(t.id)).reduce((a, t) => a + t.valor, 0);

  const suma = interes.costoTotal + subs.cobradoTotal + subs.recargosTotal
    + interes.totalAvances + normales;
  return { suma, total, dif: suma - total, interes, subs };
}

test('INVARIANTE: la comisión FX sin atribuir no se cae del total', () => {
  // Una comisión de una compra suelta (no de suscripción): separarFX la saca de
  // la deuda y la atribución no la engancha. Estaba quedando en el limbo.
  const tx = [
    { id: '1', valor: 5000, descripcion: 'COMISION TRANSACCION INTERNACIONAL', fecha: new Date(2026, 5, 9) },
    { id: '2', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 0, 15) },
  ];
  const r = bucketsCuadran(tx);
  assert.equal(Math.round(r.dif), 0, `se perdieron ${-r.dif} pesos`);
  assert.equal(r.subs.comisionesSinAtribuirTotal, 5000, 'listada Y sumada');
});

test('INVARIANTE: el 4x1000 del extracto no se cuenta dos veces', () => {
  // El GMF tiene la misma forma que la comisión FX: línea real + estimación.
  const tx = [
    { id: '1', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 0, 5) },
    { id: '2', valor: 108, descripcion: 'GRAVAMEN A LOS MOVIMIENTOS FINANCIEROS', fecha: new Date(2026, 0, 5) },
  ];
  const interes = analizarInteres(tx);
  const subs = analizarSuscripciones(tx, { esCuentaDebito: true, gmfEnExtracto: true });
  const suma = interes.costoTotal + subs.costoRealTotal;
  assert.ok(Math.abs(suma - 27008) < 0.5, `inflado en ${(suma - 27008).toFixed(1)}`);
});

test('INVARIANTE: sin línea de GMF sí lo estimamos', () => {
  const tx = [{ id: '1', valor: 100000, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 0, 5) }];
  const subs = analizarSuscripciones(tx, { esCuentaDebito: true, gmfEnExtracto: false });
  assert.equal(Math.round(subs.comercios[0].recargos.gmf), 400);
});

test('INVARIANTE: no inventamos comisión si el extracto ya declaró las suyas', () => {
  // Adobe factura en COP desde Colombia: no tiene comisión. Si el extracto trae
  // comisiones y ninguna es de Adobe, es que no la tuvo — no que se nos perdió.
  const tx = [
    { id: '1', valor: 88400, descripcion: 'OPENAI CHATGPT COMPRA INTERNACIONAL', fecha: new Date(2026, 0, 5) },
    { id: '2', valor: 100000, descripcion: 'ADOBE', fecha: new Date(2026, 0, 20) },
    { id: '3', valor: 2652, descripcion: 'COMISION TRANSACCION INTERNACIONAL', fecha: new Date(2026, 0, 5) },
  ];
  const r = bucketsCuadran(tx);
  assert.equal(Math.round(r.dif), 0, `se inventaron ${r.dif} pesos`);
  const adobe = r.subs.comercios.find((c) => c.nombre === 'Adobe');
  assert.equal(adobe.recargos.total, 0, 'Adobe no tuvo comisión, no le inventamos una');
});

test('INVARIANTE: el ejemplo completo cuadra al peso', () => {
  const { filas } = parsearCSV(fs.readFileSync('ejemplos/ejemplo-extracto.csv', 'utf8'));
  const enc = detectarEncabezados(filas);
  const { transacciones } = filasATransacciones(filas, enc.mapa, { filaEncabezado: enc.fila });
  const r = bucketsCuadran(transacciones);
  assert.equal(Math.round(r.dif), 0, `descuadre de ${r.dif}`);
});

test('diferidos: restantes * cuota siempre da el saldo pendiente', () => {
  // La regla que atrapa el off-by-one. Antes restantes era (total - n) + 1, y
  // eso dejaba una cuota fantasma de capital: 36 * 100.000 = 3.600.000 contra
  // un saldo real de 3.500.000. Con diferidos de distinta antigüedad, ese pago
  // fantasma borraba saldo antes de tiempo y SUBESTIMABA el interés proyectado.
  const mk = (n, total, compra) => ({
    id: `x${n}`, descripcion: 'COMERCIO', fecha: new Date(2026, 5, 1),
    valorMovimiento: compra, valorCuota: compra / total,
    saldoPendiente: compra - (compra / total) * n,
    valor: compra / total, cuotas: { n, total }, tasaEA: 0.28,
  });
  const d = analizarDiferidos([mk(1, 36, 3600000), mk(12, 36, 1800000), mk(35, 36, 720000)]);
  for (const i of d.items) {
    assert.ok(Math.abs(i.restantes * i.valorCuota - i.saldoPendiente) < 0.01,
      `${i.cuotaN}/${i.cuotaTotal}: ${i.restantes} * ${i.valorCuota} != ${i.saldoPendiente}`);
  }
});

test('minimo: no reporta ahorro con una cuota que nunca salda', () => {
  // Le decía a alguien que un plan que lo arruina le ahorra $6.871.045.
  const c = compararConCuotaFija(10000000, 0.28, 100000);
  assert.equal(c.fija.nuncaTermina, true, 'esa cuota no cubre ni el interés');
  assert.equal(c.ahorro, null, 'no hay ahorro que reportar');
  assert.equal(c.mesesMenos, null);

  // Y con una cuota que sí salda, el ahorro sí sale.
  const b = compararConCuotaFija(5000000, 0.28, 500000);
  assert.ok(b.ahorro > 0);
  assert.ok(b.mesesMenos > 0);
});

test('tasaEA: una fila al 0% pesa en el promedio, no se ignora', () => {
  const ea = tasaEADelExtracto([
    { tasaEA: 0, saldoPendiente: 10000000 },        // diferido promocional
    { tasaEA: 0.287548, saldoPendiente: 1000000 },
  ]);
  assert.ok(Math.abs(ea - 0.02614) < 0.001, `dio ${(ea * 100).toFixed(2)}%, esperado 2,61%`);
});

test('bancolombia: no confunde un extracto genérico con uno diferido', () => {
  // El fallback 'filas >= 8' reintroducía el bug original: un extracto de
  // (fecha, desc, valor, saldo) se detectaba como Bancolombia y `valor` pasaba
  // a ser el SALDO. 10 filas con centavos, que es lo que el test viejo no tenía.
  const generico = Array.from({ length: 10 }, (_, i) =>
    `0${i + 1}/01/2026 COMERCIO ${i} $ 26.900,00 $ 1.234.567,89`);
  assert.equal(esBancolombiaVisa(generico), false, 'sin cuotas ni tasas no es este formato');
});

test('bancolombia: un abono con el menos antes del peso es negativo', () => {
  const f = parsearFila('15/06/2026 PAGO RECIBIDO -$ 500.000,00 -$ 500.000,00 $ 0,00');
  assert.ok(f.valor < 0, `dio ${f.valor}: un pago contado como gasto`);
  assert.equal(f.valor, -500000);
});

test('bancolombia: un "$" en la descripción no corre los montos', () => {
  // Los montos de la tabla son los ÚLTIMOS tres, no los primeros.
  const f = parsearFila('845423 09/06/2026 COMPRA USD $ 9,99 MERCADO $ 3.600.000,00 1/36 $ 100.000,00 2,1285 % 28,7548 % $ 3.500.000,00');
  assert.equal(f.valorMovimiento, 3600000);
  assert.equal(f.valor, 100000, 'la cuota, no el valor movimiento');
  assert.equal(f.saldoPendiente, 3500000);
});

test('pdf genérico: un monto sin separador de miles no se trunca', () => {
  // '26900' salía 900, y '45000' desaparecía entero (los últimos 3 son '000',
  // parseNumero da 0 y la fila se descarta en silencio).
  const { transacciones } = lineasATransacciones([
    '15/01/2026 NETFLIX 26900',
    '16/01/2026 ARRIENDO 45000',
    '17/01/2026 MERCADO $ 1.234.567,89',
  ]);
  assert.equal(transacciones.length, 3, 'ninguna se pierde');
  assert.deepEqual(transacciones.map((t) => t.valor), [26900, 45000, 1234567.89]);
});

test('csv: "Valor movimiento" no se lo roba la columna descripción', () => {
  // 'movimiento' es sinónimo de descripcion y hacía match PARCIAL contra
  // "Valor movimiento", quedándose con la columna antes de que `valor` pudiera
  // matchearla EXACTO. valor quedaba en null, cada fila se descartaba por no
  // tener monto, y el extracto salía vacío sin un solo error. Y "Valor
  // movimiento" es literalmente el nombre de la columna en Bancolombia.
  const { filas } = parsearCSV(
    'Fecha;Descripcion;Valor movimiento;Saldo\n15/01/2026;NETFLIX.COM;26.900;1.000.000');
  const enc = detectarEncabezados(filas);
  assert.equal(enc.mapa.descripcion, 1, 'descripcion se queda con la suya');
  assert.equal(enc.mapa.valor, 2, 'y valor gana la suya por match exacto');
  const { transacciones } = filasATransacciones(filas, enc.mapa, { filaEncabezado: enc.fila });
  assert.equal(transacciones.length, 1);
  assert.equal(transacciones[0].valor, 26900);
});

test('csv: "Clase de movimiento" tampoco confunde el mapeo', () => {
  // El otro encabezado que colisiona entre categorías.
  const { filas } = parsearCSV(
    'Fecha;Clase de movimiento;Valor;Saldo\n15/01/2026;COMPRA NETFLIX;26.900;1.000.000');
  const enc = detectarEncabezados(filas);
  assert.equal(enc.mapa.valor, 2);
  const { transacciones } = filasATransacciones(filas, enc.mapa, { filaEncabezado: enc.fila });
  assert.equal(transacciones[0].valor, 26900);
});

test('parseNumero: un guion en el texto no vuelve negativo un cargo', () => {
  // '-' se buscaba en TODA la celda cruda.
  assert.equal(parseNumero('NETFLIX-SUSCRIP 26.900'), null, 'celda con texto: null, no adivinar');
  assert.equal(parseNumero('15-01 1.500'), null, 'antes daba -15.011.500, un número inexistente');
  // Paréntesis contables, con moneda pegada.
  assert.equal(parseNumero('$(1.500)'), -1500);
  assert.equal(parseNumero('(45.000,00) COP'), -45000);
  assert.equal(parseNumero('1.500-'), -1500);
  // Y lo normal sigue igual.
  assert.equal(parseNumero('45.000'), 45000);
  assert.equal(parseNumero('50.000 CR'), -50000);
});

test('claveComercio: si la limpieza vacía el nombre, no agrupa a ciegas', () => {
  // 'APP 845423' pierde el número y el sufijo y queda en ''. Dos comercios sin
  // relación caían en la misma clave vacía y se reportaba apilamiento falso.
  const mk = (desc) => ({
    id: desc, descripcion: desc, fecha: new Date(2026, 5, 1), valor: 100,
    valorMovimiento: 3600, valorCuota: 100, saldoPendiente: 3500,
    cuotas: { n: 1, total: 36 }, tasaEA: 0.28,
  });
  const d = analizarDiferidos([mk('APP 845423'), mk('CO 998877')]);
  assert.equal(d.apiladas.length, 2, 'dos comercios distintos, no uno apilado');
  assert.equal(d.seApilan.length, 0);
});

test('avances: junta el retiro con sus cargos y saca el % instantáneo', () => {
  // Sacar $500.000 y que cueste $38.700 (comisión + intereses del mes) es un
  // 7,74% que se va de una, antes de contar el interés futuro. La app contaba
  // esos cargos pero nunca los juntaba ni les ponía nombre.
  const tx = [
    { id: '1', valor: 500000, descripcion: 'AVANCE EN EFECTIVO CAJERO', fecha: new Date(2026, 0, 9) },
    { id: '2', valor: 27500, descripcion: 'COMISION POR AVANCE', fecha: new Date(2026, 0, 9) },
    { id: '3', valor: 11200, descripcion: 'INTERESES DE AVANCE', fecha: new Date(2026, 0, 28) },
    { id: '4', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 0, 15) },
  ];
  const a = analizarAvances(analizarInteres(tx));
  assert.equal(a.montoRetirado, 500000);
  assert.equal(a.comisionTotal, 27500);
  assert.equal(a.interesTotal, 11200);
  assert.equal(a.costoEsteMes, 38700);
  assert.ok(Math.abs(a.proporcionInstantanea - 0.0774) < 0.0001, `dio ${a.proporcionInstantanea}`);
});

test('avances: sin avances no hay bloque', () => {
  const tx = [{ id: '1', valor: 26900, descripcion: 'NETFLIX.COM', fecha: new Date(2026, 0, 15) }];
  assert.equal(analizarAvances(analizarInteres(tx)), null);
});
