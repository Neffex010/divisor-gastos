# 💸 Divisor de Gastos

**[Abrir la app →](https://neffex010.github.io/divisor-gastos/)**

Aplicación web para dividir gastos compartidos y calcular quién debe pagar a quién.
Funciona sin servidor, sin cuentas y sin conexión: todos los datos viven en el
`localStorage` de tu navegador.

## Características

- **Varios grupos** independientes (viaje, casa, oficina…) con su propia moneda.
- **Reparto flexible**: partes iguales, montos exactos o porcentajes.
- **Dinero en centavos**: todos los cálculos usan enteros y reparto por mayor
  residuo, así que nunca se pierde ni se inventa un centavo.
- **Liquidación mínima**: calcula el menor conjunto de transferencias para dejar
  las cuentas en cero.
- **Pagos registrados**: marca una liquidación como pagada y queda en el historial.
- **Edición completa**: renombra personas y grupos, edita o elimina gastos y
  deshaz la última acción desde el aviso.
- **Protección de datos**: exporta/importa respaldo JSON, exporta CSV y detecta
  estados corruptos guardando una copia antes de continuar.
- **PWA instalable** con service worker, caché propia y uso offline.
- **Accesible**: etiquetas, foco visible, objetivos táctiles de 44 px, diálogos
  nativos, modo claro/oscuro y respeto por `prefers-reduced-motion`.
- **Sin dependencias** de runtime ni de build.

## Uso

Abre `index.html` con un servidor local (los módulos ES y el service worker no
funcionan correctamente desde `file://`):

```bash
npm run serve
# o
python -m http.server 8080
```

Luego visita <http://localhost:8080>.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm test` | Ejecuta los tests con el runner nativo de Node. |
| `npm run check` | Valida manifest, iconos, service worker, referencias del HTML e imports. |
| `npm run verify` | `check` + `test`. Es lo que corre la CI. |
| `npm run serve` | Sirve la app en `http://localhost:8080`. |

Requiere Node.js 18 o superior para los tests.

## Estructura

```
index.html            Interfaz y diálogos
style.css             Tokens, temas, responsive e impresión
app.js                Conexión de la UI con la lógica
js/money.js           Parseo, formato y reparto en centavos
js/ledger.js          Balances, liquidación y operaciones de grupo
js/storage.js         Persistencia, validación y migración v1 → v2
sw.js                 Caché offline con prefijo propio
manifest.json         Metadatos de la PWA
scripts/check.mjs     Verificación estructural
scripts/generate-icons.ps1  Regenera los iconos (Windows + System.Drawing)
tests/                Tests de dinero, contabilidad y almacenamiento
```

## Datos y privacidad

- No hay backend ni analítica. Nada sale del dispositivo.
- La clave de almacenamiento es `divisor-gastos-v2`.
- Los estados del formato anterior (`divisor-gastos-v1`) se migran
  automáticamente.
- Si el JSON guardado está corrupto, se conserva una copia en
  `divisor-gastos-v2-corrupto` y la app arranca con un grupo limpio.

Exporta un respaldo antes de limpiar los datos del navegador o cambiar de
dispositivo.

## Regenerar iconos

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
```

## Licencia

Uso personal y educativo.
