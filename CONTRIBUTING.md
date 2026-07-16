# Cómo contribuir

Gracias por venir. Este proyecto sirve exactamente en la medida en que reconozca
los comercios y los cargos de **tu** banco, y eso no lo puede hacer una sola
persona: hay decenas de bancos y cientos de comercios, cada uno escribiendo las
cosas a su manera.

**No necesitás saber programar para las dos contribuciones más útiles.**

---

## 1. Agregar un comercio al diccionario ⭐ lo más útil

Si tenés una suscripción que Plata Clara no reconoció, agregala.

Abrí `src/datos/suscripciones.js` y agregá una línea:

```js
{ nombre: 'Nombre Bonito', categoria: 'streaming', moneda: 'COP', patrones: ['COMO SALE EN EL EXTRACTO'] },
```

**Reglas:**

- `patrones` va **como sale en tu extracto**, en mayúsculas y sin tildes, pero
  **sin el número de referencia**. Si tu extracto dice
  `NETFLIX.COM 8829 LOS GATOS`, el patrón es `NETFLIX` — lo más corto que
  identifique al comercio sin pegarle a otra cosa.
- `moneda` es `'USD'` si ese comercio suele facturar en dólares desde Colombia,
  `'COP'` si factura en pesos. Es solo una pista: si tu extracto dice
  explícitamente que fue compra internacional, esa evidencia manda.
- `categoria` tiene que ser una de las que ya existen en `CATEGORIAS` al final
  del archivo. Si de verdad hace falta una nueva, agregala ahí.

**Ojo con los patrones muy cortos.** `MAX` pegaría con `MAXIMILIANO PIZZA`. Los
patrones matchean palabras completas, pero igual pensá si tu patrón puede
aparecer adentro del nombre de otro comercio. Cuando dudes, usá el patrón más
largo que siga funcionando.

**No pongas tus datos.** No necesitamos tu extracto, solo el nombre del comercio.

---

## 2. Agregar un cargo de tu banco

Si tu banco nombra los cargos distinto (y lo hace), abrí `src/datos/cargos.js`
y agregá el texto a los `patrones` del cargo que corresponda.

**El orden importa.** La lista se evalúa de arriba hacia abajo y gana el primero
que matchee. Por eso `interes_mora` va antes que `interes_corriente`: si no,
`INTERESES DE MORA` caería en el patrón `INTERES` y quedaría mal clasificado.
Si agregás un patrón nuevo, poné el más específico arriba.

---

## 3. Reportar un extracto que se leyó mal

Abrí un issue con:

- Qué banco y qué tipo de producto (tarjeta, ahorros).
- **La fila de encabezados de tu CSV**, tal cual, sin ninguna fila de datos.
  Ejemplo: `Fecha;Descripcion;Valor;Saldo`.
- Qué esperabas y qué salió.

**Nunca subas tu extracto a un issue.** Tiene tus movimientos, tu saldo y a
veces tu número de cuenta. Los encabezados y una descripción del problema
alcanzan. Si necesitás mandar una fila de ejemplo, inventá los números.

---

## 4. Código

```bash
git clone https://github.com/jarueda97/plata-clara
cd plata-clara
python3 -m http.server 8000     # no hay build ni npm install
node --test tests/test.mjs      # los tests corren con Node pelado
```

### Antes de mandar un PR

- Que `node --test tests/test.mjs` pase.
- Si tocaste un motor, agregá un test. Los de `no se cuenta dos veces` son los
  más importantes del repo: si los rompés, la herramienta miente.

### La regla que no se rompe

**Ningún peso se cuenta dos veces, y ningún peso se inventa.** Concretamente:

- La comisión internacional que ya viene en el extracto no se vuelve a estimar,
  y vive en **una sola** de las dos tarjetas (la de suscripciones — es costo de
  comprar en dólares, no de deber plata).
- El margen de cambio (spread de TRM) **no se suma nunca**. Ya está adentro del
  monto en pesos que el banco cobró. Se muestra como descomposición de lo que ya
  pagaste, jamás como algo que se agrega.

Si tu cambio hace que la suma de las dos tarjetas deje de ser exactamente la
plata que salió de la cuenta, el cambio está mal.

### Filosofía

- **Preferimos decir "no sé" antes que inventar.** Por eso no quemamos la tasa
  de usura en el código, y por eso no rellenamos la tasa de interés del usuario:
  nuestra estimación tira para arriba, y ese campo alimenta una acusación de
  delito. Un dato desactualizado o inflado es peor que un campo vacío con un
  link.
- **El usuario confirma antes de que sumemos.** Ningún parser es perfecto sobre
  extractos que no hemos visto. La tabla de revisión no es un paso de más: es lo
  que hace que un parser imperfecto sea honesto.
- **Sin build, sin dependencias, sin framework.** Cualquiera tiene que poder
  clonar esto y leerlo completo en una tarde.
- **En español.** El código, los comentarios y la interfaz. Es una herramienta
  para Colombia.

---

## Código de conducta

Sé decente. Este proyecto existe para gente a la que le están sacando plata sin
que se dé cuenta; tratemos bien a quien llega a entender su extracto por primera
vez.
