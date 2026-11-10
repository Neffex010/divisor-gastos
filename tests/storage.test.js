import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGACY_KEY,
  STORAGE_KEY,
  createState,
  loadState,
  normalizeState,
  saveState
} from '../js/storage.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map);
    }
  };
}

test('normalizeState migra el formato v1', () => {
  const state = normalizeState({
    currency: '€',
    people: [
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Beto' }
    ],
    expenses: [
      {
        id: 'e1',
        description: 'Cena',
        amount: 10.5,
        paidBy: 'a',
        participants: ['a', 'b']
      }
    ]
  });

  assert.equal(state.version, 2);
  assert.equal(state.groups.length, 1);
  assert.equal(state.groups[0].currency, 'EUR');
  assert.equal(state.groups[0].expenses[0].amountCents, 1050);
  assert.deepEqual(state.groups[0].expenses[0].shares, { a: 525, b: 525 });
});

test('loadState migra, guarda y limpia la clave anterior', () => {
  const legacy = {
    currency: 'MX$',
    people: [{ id: 'a', name: 'Ana' }],
    expenses: []
  };
  const storage = memoryStorage({ [LEGACY_KEY]: JSON.stringify(legacy) });

  const state = loadState(storage);

  assert.equal(state.groups[0].people[0].name, 'Ana');
  assert.equal(storage.getItem(LEGACY_KEY), null);
  assert.ok(storage.getItem(STORAGE_KEY));
});

test('saveState y loadState hacen round-trip', () => {
  const storage = memoryStorage();
  const state = createState();
  state.groups[0].people.push({ id: 'a', name: 'Ana' });

  assert.equal(saveState(state, storage), true);
  const loaded = loadState(storage);

  assert.equal(loaded.groups[0].people.length, 1);
  assert.equal(loaded.groups[0].people[0].name, 'Ana');
});

test('un estado corrupto se respalda y no rompe la app', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{esto no es json' });
  const state = loadState(storage);

  assert.ok(state.groups.length >= 1);
  assert.ok(storage.getItem(`${STORAGE_KEY}-corrupto`));
});

test('normalizeState descarta datos inválidos y corrige la moneda', () => {
  const state = normalizeState({
    version: 2,
    activeGroupId: 'g1',
    groups: [
      {
        id: 'g1',
        name: 'Grupo',
        currency: 'XXX',
        people: [{ id: 'a', name: 'Ana' }],
        expenses: [
          { amountCents: '100', paidBy: 'a', shares: { a: 100 } },
          { amountCents: 100, paidBy: 'desconocido', shares: { a: 100 } },
          { amountCents: 100, paidBy: 'a', shares: {} }
        ],
        payments: [{ from: 'a', to: 'a', amountCents: 10 }]
      }
    ]
  });

  assert.equal(state.groups[0].currency, 'MXN');
  assert.equal(state.groups[0].expenses.length, 0);
  assert.equal(state.groups[0].payments.length, 0);
});

test('normalizeState elige un grupo activo válido', () => {
  const state = normalizeState({
    version: 2,
    activeGroupId: 'no-existe',
    groups: [
      { id: 'g1', name: 'Uno', people: [], expenses: [], payments: [] },
      { id: 'g2', name: 'Dos', people: [], expenses: [], payments: [] }
    ]
  });

  assert.equal(state.activeGroupId, 'g1');
});

test('normalizeState acepta el envoltorio de exportación', () => {
  const state = normalizeState({
    app: 'divisor-gastos',
    version: 2,
    exportedAt: '2026-01-01T00:00:00.000Z',
    state: {
      version: 2,
      activeGroupId: 'g1',
      groups: [{ id: 'g1', name: 'Uno', people: [], expenses: [], payments: [] }]
    }
  });

  assert.equal(state.groups[0].name, 'Uno');
});

test('saveState devuelve false si el almacenamiento falla', () => {
  const storage = {
    setItem() {
      throw new Error('cuota llena');
    }
  };

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(saveState(createState(), storage), false);
  } finally {
    console.warn = originalWarn;
  }
});
