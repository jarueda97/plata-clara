import test from 'node:test';
import assert from 'node:assert/strict';

import { parseNumero } from '../src/parse/numero.js';
import { parseFecha, claveMes, diasEntre } from '../src/parse/fecha.js';
import { contienePatron, normalizarDescripcion } from '../src/parse/normalizar.js';
import { detectarDelimitador, parsearCSV, detectarEncabezados, filasATransacciones, sugiereInvertirSigno } from '../src/parse/csv.js';
import { clasificarCargo, analizarInteres, estimarEA, eaAMensual } from '../src/motor/interes.js';
import { identificarComercio, analizarSuscripciones, calcularRecargos, mediana } from '../src/motor/suscripciones.js';
import { simularMinimo, simularCuotaFija, equivalencia } from '../src/motor/minimo.js';

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
