import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allocateCents,
  centsToInput,
  formatCents,
  parseAmountToCents
} from '../js/money.js';

test('parseAmountToCents acepta formatos habituales', () => {
  assert.equal(parseAmountToCents('10'), 1000);
  assert.equal(parseAmountToCents('10.50'), 1050);
  assert.equal(parseAmountToCents('10,50'), 1050);
  assert.equal(parseAmountToCents('1.234,56'), 123456);
  assert.equal(parseAmountToCents('1,234.56'), 123456);
  assert.equal(parseAmountToCents('$ 12.00'), 1200);
  assert.equal(parseAmountToCents('0,500'), 50);
  assert.equal(parseAmountToCents('  -5,25 '), -525);
  assert.equal(parseAmountToCents('1,234'), 123400);
});

test('parseAmountToCents rechaza valores no numéricos', () => {
  assert.ok(Number.isNaN(parseAmountToCents('')));
  assert.ok(Number.isNaN(parseAmountToCents('abc')));
  assert.ok(Number.isNaN(parseAmountToCents('—')));
  assert.ok(Number.isNaN(parseAmountToCents(null)));
});

test('allocateCents reparte sin perder centavos', () => {
  const three = allocateCents(1000, [1, 1, 1]);
  assert.deepEqual(three, [334, 333, 333]);
  assert.equal(three.reduce((a, b) => a + b, 0), 1000);

  const one = allocateCents(1, [1, 1, 1]);
  assert.equal(one.reduce((a, b) => a + b, 0), 1);

  assert.deepEqual(allocateCents(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocateCents(100, [0, 0]), [0, 0]);
  assert.deepEqual(allocateCents(100, []), []);
});

test('allocateCents respeta pesos desiguales', () => {
  const parts = allocateCents(1000, [60, 40]);
  assert.deepEqual(parts, [600, 400]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 1000);

  const thirds = allocateCents(999, [1, 2, 3]);
  assert.equal(thirds.reduce((a, b) => a + b, 0), 999);
});

test('centsToInput y formatCents son estables', () => {
  assert.equal(centsToInput(1050), '10.50');
  assert.equal(centsToInput(0), '0.00');
  assert.match(formatCents(1050, 'MXN'), /10[.,]50/);
});
