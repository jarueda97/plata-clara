// Gráfico de amortización: tu saldo mes a mes, pagando el mínimo vs. una
// cuota fija. Es change-over-time con dos series → línea, un solo eje.
//
// Los colores NO son los acentos de marca: son escalones oscurecidos de los
// mismos tonos, dentro del band de L 0.48–0.67 que exige el modo oscuro.
// Validados con el script del skill de dataviz (ΔE 9.7 deutan, 30.7 normal,
// contraste ≥3:1 contra el panel). Además van con etiqueta directa y leyenda,
// así que el color nunca es el único canal que carga la identidad.

import { formatoCOP } from '../parse/numero.js';

const COLOR = { min: '#ed4a7b', fija: '#6c8e00' };
const W = 760, H = 260;
const M = { t: 18, r: 92, b: 30, l: 60 };

/**
 * @param {HTMLElement} cont
 * @param {{curva: Array}} min  simulación del mínimo
 * @param {{curva: Array}|null} fija simulación de cuota fija (opcional)
 */
export function dibujarAmortizacion(cont, min, fija = null) {
  if (!min?.curva?.length) { cont.innerHTML = ''; return null; }

  const series = [{ clave: 'min', nombre: 'Pagando el mínimo', datos: min.curva, color: COLOR.min }];
  if (fija?.curva?.length) {
    series.push({ clave: 'fija', nombre: 'Cuota fija', datos: fija.curva, color: COLOR.fija });
  }

  const maxMes = Math.max(...series.map((s) => s.datos.length));
  const maxSaldo = Math.max(...series.flatMap((s) => s.datos.map((p) => p.saldo)), 0);
  if (maxMes < 2 || maxSaldo <= 0) { cont.innerHTML = ''; return null; }

  const x = (mes) => M.l + (mes / Math.max(maxMes - 1, 1)) * (W - M.l - M.r);
  const y = (saldo) => M.t + (1 - saldo / maxSaldo) * (H - M.t - M.b);

  const ticksY = pasos(maxSaldo, 4);
  const ticksX = pasosX(maxMes);

  const grid = ticksY.map((v) =>
    `<line x1="${M.l}" y1="${y(v)}" x2="${W - M.r}" y2="${y(v)}"/>`).join('');

  const ejeY = ticksY.map((v) =>
    `<text x="${M.l - 10}" y="${y(v) + 3.5}" text-anchor="end">${corto(v)}</text>`).join('');

  const ejeX = ticksX.map((m) =>
    `<text x="${x(m)}" y="${H - M.b + 18}" text-anchor="middle">${m === 0 ? 'hoy' : `${m}m`}</text>`).join('');

  const lineas = series.map((s) => {
    const d = s.datos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ');
    return `<path class="line" d="${d}" stroke="${s.color}"/>`;
  }).join('');

  // Etiqueta directa al final de cada línea — el color no carga solo la identidad.
  const etiquetas = series.map((s) => {
    const ult = s.datos.length - 1;
    const py = Math.max(y(s.datos[ult].saldo), M.t + 8);
    return `<text class="dlabel" x="${x(ult) + 8}" y="${py + 3.5}" fill="${s.color}">${
      s.clave === 'min' ? 'mínimo' : 'cuota fija'}</text>`;
  }).join('');

  cont.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo mes a mes según cómo pagues">
      <g class="grid">${grid}</g>
      <g class="axis">${ejeY}${ejeX}</g>
      ${lineas}
      ${etiquetas}
      <g class="hover" style="opacity:0">
        <line class="hover-line" y1="${M.t}" y2="${H - M.b}"/>
        ${series.map((s) => `<circle class="hover-dot" r="4" fill="${s.color}"/>`).join('')}
      </g>
      <rect x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}" fill="transparent" class="capa"/>
    </svg>
    <div class="tip"></div>`;

  colgarHover(cont, series, { x, y, maxMes });
  return { series, colores: COLOR };
}

/** Leyenda: siempre presente con 2+ series. */
export function leyenda(series) {
  return series.map((s) =>
    `<span class="lg"><span class="sw" style="background:${s.color}"></span>${s.nombre}</span>`).join('');
}

// Crosshair + tooltip. Un gráfico en HTML es interactivo por defecto.
function colgarHover(cont, series, { x, y, maxMes }) {
  const svg = cont.querySelector('svg');
  const capa = cont.querySelector('.capa');
  const g = cont.querySelector('.hover');
  const linea = g.querySelector('.hover-line');
  const puntos = [...g.querySelectorAll('.hover-dot')];
  const tip = cont.querySelector('.tip');

  const mostrar = (ev) => {
    const caja = svg.getBoundingClientRect();
    const px = ((ev.clientX - caja.left) / caja.width) * W;
    // Mes más cercano al cursor.
    let mes = Math.round(((px - M.l) / (W - M.l - M.r)) * (maxMes - 1));
    mes = Math.max(0, Math.min(maxMes - 1, mes));

    g.style.opacity = '1';
    linea.setAttribute('x1', x(mes));
    linea.setAttribute('x2', x(mes));

    const filas = [];
    series.forEach((s, i) => {
      const p = s.datos[mes];
      if (!p) { puntos[i].style.opacity = '0'; return; }
      puntos[i].style.opacity = '1';
      puntos[i].setAttribute('cx', x(mes));
      puntos[i].setAttribute('cy', y(p.saldo));
      filas.push(`<div class="r"><span class="k">${s.clave === 'min' ? 'mínimo' : 'cuota fija'}</span><span>${formatoCOP(p.saldo)}</span></div>`);
    });

    tip.innerHTML = `<div class="r"><span class="k">mes</span><span>${mes + 1}</span></div>${filas.join('')}`;
    tip.classList.add('on');
    const tw = tip.offsetWidth;
    const izq = (x(mes) / W) * caja.width;
    tip.style.left = `${Math.min(Math.max(izq + 12, 0), caja.width - tw - 4)}px`;
    tip.style.top = `8px`;
  };

  const ocultar = () => { g.style.opacity = '0'; tip.classList.remove('on'); };

  capa.addEventListener('mousemove', mostrar);
  capa.addEventListener('mouseleave', ocultar);
  capa.addEventListener('touchmove', (e) => { e.preventDefault(); mostrar(e.touches[0]); }, { passive: false });
  capa.addEventListener('touchend', ocultar);
}

function pasos(max, n) {
  const bruto = max / n;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = Math.ceil(bruto / mag) * mag;
  const out = [];
  for (let v = 0; v <= max * 1.0001; v += paso) out.push(v);
  return out;
}

function pasosX(maxMes) {
  const n = Math.min(6, maxMes);
  const paso = Math.max(1, Math.floor((maxMes - 1) / (n - 1 || 1)));
  const out = [];
  for (let m = 0; m < maxMes; m += paso) out.push(m);
  if (out[out.length - 1] !== maxMes - 1) out.push(maxMes - 1);
  return out;
}

function corto(v) {
  if (v === 0) return '0';
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(Math.round(v));
}
