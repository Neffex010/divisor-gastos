// Utilidades de dinero. Todo el estado interno se guarda en centavos enteros.

export const CURRENCIES = [
  { code: 'MXN', label: 'Peso mexicano (MXN)' },
  { code: 'USD', label: 'Dólar estadounidense (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'PEN', label: 'Sol peruano (PEN)' },
  { code: 'ARS', label: 'Peso argentino (ARS)' },
  { code: 'BRL', label: 'Real brasileño (BRL)' },
  { code: 'CLP', label: 'Peso chileno (CLP)' },
  { code: 'COP', label: 'Peso colombiano (COP)' }
];

const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code));

export function isSupportedCurrency(code) {
  return CURRENCY_CODES.has(code);
}

/**
 * Convierte texto escrito por una persona a centavos enteros.
 * Acepta "1,50", "1.234,56", "1,234.56", "$ 12.00" y números.
 * Devuelve NaN si no es un importe válido.
 */
export function parseAmountToCents(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw * 100) : NaN;
  }
  if (typeof raw !== 'string') return NaN;

  let value = raw.trim().replace(/\s+/g, '');
  if (!value) return NaN;

  // Quita símbolos de moneda, letras y separadores de miles no numéricos.
  value = value.replace(/[^\d.,-]/g, '');
  if (!value || !/\d/.test(value)) return NaN;

  const negative = value.startsWith('-');
  value = value.replace(/-/g, '');

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // 1.234,56
      value = value.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.56
      value = value.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const parts = value.split(',');
    // "1,234" suele ser miles; "1,50" es decimal. Si hay más de una coma, son miles.
    // "0,500" es decimal porque la parte entera es cero.
    const looksLikeThousands =
      parts.length === 2 && parts[1].length === 3 && parts[0].length > 0 && parts[0] !== '0';
    if (parts.length > 2 || looksLikeThousands) {
      value = value.replace(/,/g, '');
    } else {
      value = value.replace(',', '.');
    }
  }

  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return Math.round(number * 100) * (negative ? -1 : 1);
}

export function centsToInput(cents) {
  if (!Number.isFinite(cents)) return '';
  return (cents / 100).toFixed(2);
}

export function formatCents(cents, currency, locale = 'es-MX') {
  const safeCents = Number.isFinite(cents) ? cents : 0;
  const amount = safeCents / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: isSupportedCurrency(currency) ? currency : 'MXN',
      currencyDisplay: 'narrowSymbol'
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || ''}`.trim();
  }
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(value)} %`;
}

/**
 * Reparte un total entero en partes proporcionales usando el método del mayor
 * residuo. La suma de las partes siempre es exactamente `totalCents`.
 */
export function allocateCents(totalCents, weights) {
  const total = Math.trunc(totalCents);
  if (!Array.isArray(weights) || weights.length === 0) return [];
  if (!Number.isFinite(total) || total === 0) return weights.map(() => 0);

  const safeWeights = weights.map((w) => {
    const n = Number(w);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const weightSum = safeWeights.reduce((acc, w) => acc + w, 0);
  if (weightSum === 0) return weights.map(() => 0);

  const sign = total < 0 ? -1 : 1;
  const absolute = Math.abs(total);

  const exact = safeWeights.map((w) => (absolute * w) / weightSum);
  const parts = exact.map((n) => Math.floor(n));
  let remainder = absolute - parts.reduce((acc, n) => acc + n, 0);

  const order = exact
    .map((n, index) => ({ index, fraction: n - Math.floor(n) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; remainder > 0; i += 1) {
    parts[order[i % order.length].index] += 1;
    remainder -= 1;
  }

  return parts.map((n) => n * sign);
}
