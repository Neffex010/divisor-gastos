import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShareText,
  computeBalances,
  equalShares,
  expensesToCsv,
  removePersonFromGroup,
  settle,
  sharesFromWeights
} from '../js/ledger.js';

function makeGroup(overrides = {}) {
  return {
    id: 'g1',
    name: 'Viaje',
    currency: 'MXN',
    people: [
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Beto' },
      { id: 'c', name: 'Carla' }
    ],
    expenses: [],
    payments: [],
    createdAt: 0,
    ...overrides
  };
}

test('equalShares reparte y suma exactamente el total', () => {
  const shares = equalShares(1000, ['a', 'b', 'c']);
  assert.deepEqual(shares, { a: 334, b: 333, c: 333 });
  assert.equal(Object.values(shares).reduce((x, y) => x + y, 0), 1000);
});

test('sharesFromWeights aplica porcentajes', () => {
  const shares = sharesFromWeights(1000, [
    ['a', 60],
    ['b', 40]
  ]);
  assert.deepEqual(shares, { a: 600, b: 400 });
});

test('computeBalances contempla pagos y consumos', () => {
  const group = makeGroup({
    expenses: [
      {
        id: 'e1',
        description: 'Cena',
        amountCents: 1000,
        paidBy: 'a',
        shares: { a: 334, b: 333, c: 333 },
        splitMode: 'equal',
        createdAt: 0
      },
      {
        id: 'e2',
        description: 'Taxi',
        amountCents: 600,
        paidBy: 'b',
        shares: { b: 300, c: 300 },
        splitMode: 'equal',
        createdAt: 0
      }
    ]
  });

  const balances = computeBalances(group.people, group.expenses, group.payments);
  assert.equal(balances.get('a').net, 666);
  assert.equal(balances.get('b').net, -33);
  assert.equal(balances.get('c').net, -633);
  assert.equal(
    [...balances.values()].reduce((acc, row) => acc + row.net, 0),
    0
  );
});

test('computeBalances permite que quien paga no participe', () => {
  const group = makeGroup({
    expenses: [
      {
        id: 'e1',
        description: 'Regalo',
        amountCents: 1000,
        paidBy: 'a',
        shares: { b: 500, c: 500 },
        splitMode: 'equal',
        createdAt: 0
      }
    ]
  });

  const balances = computeBalances(group.people, group.expenses);
  assert.equal(balances.get('a').paid, 1000);
  assert.equal(balances.get('a').consumed, 0);
  assert.equal(balances.get('a').net, 1000);
  assert.equal(balances.get('b').net, -500);
  assert.equal(balances.get('c').net, -500);
});

test('los pagos registrados reducen la deuda', () => {
  const group = makeGroup({
    expenses: [
      {
        id: 'e1',
        description: 'Cena',
        amountCents: 1200,
        paidBy: 'a',
        shares: { a: 400, b: 400, c: 400 },
        splitMode: 'equal',
        createdAt: 0
      }
    ],
    payments: [{ id: 'p1', from: 'b', to: 'a', amountCents: 200, createdAt: 0 }]
  });

  const balances = computeBalances(group.people, group.expenses, group.payments);
  assert.equal(balances.get('a').net, 600);
  assert.equal(balances.get('b').net, -200);
  assert.equal(balances.get('c').net, -400);
});

test('settle genera transferencias que cuadran y no muta la entrada', () => {
  const group = makeGroup({
    expenses: [
      {
        id: 'e1',
        description: 'Cena',
        amountCents: 1000,
        paidBy: 'a',
        shares: { a: 334, b: 333, c: 333 },
        splitMode: 'equal',
        createdAt: 0
      },
      {
        id: 'e2',
        description: 'Taxi',
        amountCents: 600,
        paidBy: 'b',
        shares: { b: 300, c: 300 },
        splitMode: 'equal',
        createdAt: 0
      }
    ]
  });

  const balances = computeBalances(group.people, group.expenses);
  const before = [...balances.values()].map((row) => row.net);
  const transactions = settle(balances);

  assert.equal(transactions.length, 2);
  assert.equal(
    transactions.reduce((acc, tx) => acc + tx.amountCents, 0),
    666
  );
  assert.deepEqual(
    [...balances.values()].map((row) => row.net),
    before
  );
});

test('removePersonFromGroup reasigna y reparte sin perder centavos', () => {
  const group = makeGroup({
    expenses: [
      {
        id: 'e1',
        description: 'Cena',
        amountCents: 900,
        paidBy: 'a',
        shares: { a: 300, b: 300, c: 300 },
        splitMode: 'equal',
        createdAt: 0
      }
    ]
  });

  const updated = removePersonFromGroup(group, 'a', { mode: 'reassign', reassignTo: 'b' });

  assert.deepEqual(
    updated.people.map((person) => person.id),
    ['b', 'c']
  );
  assert.equal(updated.expenses.length, 1);
  assert.equal(updated.expenses[0].paidBy, 'b');
  assert.deepEqual(updated.expenses[0].shares, { b: 450, c: 450 });
  assert.equal(
    Object.values(updated.expenses[0].shares).reduce((x, y) => x + y, 0),
    900
  );
});

test('removePersonFromGroup puede eliminar los gastos afectados', () => {
  const group = makeGroup({
    expenses: [
      {
        id: 'e1',
        description: 'Cena',
        amountCents: 900,
        paidBy: 'a',
        shares: { a: 300, b: 300, c: 300 },
        splitMode: 'equal',
        createdAt: 0
      }
    ],
    payments: [{ id: 'p1', from: 'a', to: 'b', amountCents: 100, createdAt: 0 }]
  });

  const updated = removePersonFromGroup(group, 'a', { mode: 'delete' });
  assert.equal(updated.expenses.length, 0);
  assert.equal(updated.payments.length, 0);
  assert.deepEqual(
    updated.people.map((person) => person.id),
    ['b', 'c']
  );
});

test('expensesToCsv escapa comillas y comas', () => {
  const group = makeGroup({
    people: [{ id: 'a', name: 'Ana "La Jefa"' }],
    expenses: [
      {
        id: 'e1',
        description: 'Cena, postre',
        amountCents: 1050,
        paidBy: 'a',
        shares: { a: 1050 },
        splitMode: 'equal',
        createdAt: 0
      }
    ]
  });

  const csv = expensesToCsv(group);
  assert.match(csv, /"Cena, postre"/);
  assert.match(csv, /"Ana ""La Jefa"""/);
  assert.match(csv, /"10.50"/);
});

test('buildShareText resume la liquidación', () => {
  const group = makeGroup({
    expenses: [
      {
        id: 'e1',
        description: 'Cena',
        amountCents: 1000,
        paidBy: 'a',
        shares: { a: 334, b: 333, c: 333 },
        splitMode: 'equal',
        createdAt: 0
      }
    ]
  });

  const text = buildShareText(group);
  assert.match(text, /Divisor de Gastos — Viaje/);
  assert.match(text, /Liquidación:/);
  assert.match(text, /Beto/);
  assert.match(text, /Carla/);
});

test('buildShareText indica cuando todo está cuadrado', () => {
  const text = buildShareText(makeGroup());
  assert.match(text, /Todo cuadrado/);
});
