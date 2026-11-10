// Persistencia, validación y migración del estado guardado.

import { isSupportedCurrency } from './money.js';
import { equalShares } from './ledger.js';

export const SCHEMA_VERSION = 2;
export const STORAGE_KEY = 'divisor-gastos-v2';
export const LEGACY_KEY = 'divisor-gastos-v1';

const LEGACY_CURRENCIES = {
  'MX$': 'MXN',
  '$': 'USD',
  '€': 'EUR',
  'S/': 'PEN',
  'AR$': 'ARS',
  'R$': 'BRL',
  'CLP$': 'CLP',
  'COP$': 'COP'
};

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createGroup(name = 'Mi grupo', currency = 'MXN') {
  return {
    id: uid(),
    name,
    currency: isSupportedCurrency(currency) ? currency : 'MXN',
    people: [],
    expenses: [],
    payments: [],
    createdAt: Date.now()
  };
}

export function createState() {
  const group = createGroup();
  return {
    version: SCHEMA_VERSION,
    activeGroupId: group.id,
    groups: [group]
  };
}

export function normalizeState(input) {
  let raw = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;

  // Formato de exportación: { app, version, state }
  if (raw.state && typeof raw.state === 'object') return normalizeState(raw.state);

  if (Array.isArray(raw.groups)) {
    const groups = raw.groups.map(sanitizeGroup).filter(Boolean);
    if (groups.length === 0) return null;
    const activeGroupId = groups.some((group) => group.id === raw.activeGroupId)
      ? raw.activeGroupId
      : groups[0].id;
    return { version: SCHEMA_VERSION, activeGroupId, groups };
  }

  // Estado v1: { currency, people, expenses }
  if (Array.isArray(raw.people) && Array.isArray(raw.expenses)) {
    return migrateLegacyState(raw);
  }

  return null;
}

function migrateLegacyState(raw) {
  const group = createGroup('Mi grupo', LEGACY_CURRENCIES[raw.currency] || 'MXN');
  const idMap = new Map();

  for (const person of raw.people) {
    if (!person || typeof person.name !== 'string') continue;
    const newId = typeof person.id === 'string' && person.id ? person.id : uid();
    idMap.set(person.id || newId, newId);
    group.people.push({ id: newId, name: person.name.trim().slice(0, 60) || 'Sin nombre' });
  }

  const validIds = new Set(group.people.map((person) => person.id));

  for (const expense of raw.expenses) {
    if (!expense || typeof expense.description !== 'string') continue;
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const payer = idMap.get(expense.paidBy);
    if (!payer || !validIds.has(payer)) continue;

    const participants = Array.isArray(expense.participants)
      ? [...new Set(expense.participants.map((id) => idMap.get(id)).filter((id) => id && validIds.has(id)))]
      : [];
    if (participants.length === 0) continue;

    const amountCents = Math.round(amount * 100);
    group.expenses.push({
      id: typeof expense.id === 'string' && expense.id ? expense.id : uid(),
      description: expense.description.trim().slice(0, 100) || 'Gasto',
      amountCents,
      paidBy: payer,
      shares: equalShares(amountCents, participants),
      splitMode: 'equal',
      createdAt: Date.now()
    });
  }

  return {
    version: SCHEMA_VERSION,
    activeGroupId: group.id,
    groups: [group]
  };
}

function sanitizeGroup(rawGroup) {
  if (!rawGroup || typeof rawGroup !== 'object') return null;

  const group = {
    id: typeof rawGroup.id === 'string' && rawGroup.id ? rawGroup.id : uid(),
    name:
      typeof rawGroup.name === 'string' && rawGroup.name.trim()
        ? rawGroup.name.trim().slice(0, 60)
        : 'Mi grupo',
    currency: isSupportedCurrency(rawGroup.currency) ? rawGroup.currency : 'MXN',
    people: [],
    expenses: [],
    payments: [],
    createdAt: Number.isFinite(rawGroup.createdAt) ? rawGroup.createdAt : Date.now()
  };

  const seenPeople = new Set();
  for (const person of Array.isArray(rawGroup.people) ? rawGroup.people : []) {
    if (!person || typeof person.name !== 'string') continue;
    const id = typeof person.id === 'string' && person.id ? person.id : uid();
    if (seenPeople.has(id)) continue;
    seenPeople.add(id);
    const name = person.name.trim().slice(0, 60);
    if (!name) continue;
    group.people.push({ id, name });
  }

  const personIds = new Set(group.people.map((person) => person.id));

  for (const expense of Array.isArray(rawGroup.expenses) ? rawGroup.expenses : []) {
    if (!expense || typeof expense !== 'object') continue;
    const amountCents = Number.isInteger(expense.amountCents) ? expense.amountCents : NaN;
    if (!Number.isInteger(amountCents) || amountCents <= 0) continue;
    if (!personIds.has(expense.paidBy)) continue;

    const shares = {};
    if (expense.shares && typeof expense.shares === 'object') {
      for (const [personId, cents] of Object.entries(expense.shares)) {
        if (!personIds.has(personId)) continue;
        if (!Number.isInteger(cents) || cents < 0) continue;
        shares[personId] = cents;
      }
    }

    if (Object.keys(shares).length === 0) continue;

    group.expenses.push({
      id: typeof expense.id === 'string' && expense.id ? expense.id : uid(),
      description:
        typeof expense.description === 'string' && expense.description.trim()
          ? expense.description.trim().slice(0, 100)
          : 'Gasto',
      amountCents,
      paidBy: expense.paidBy,
      shares,
      splitMode: ['equal', 'amount', 'percent'].includes(expense.splitMode)
        ? expense.splitMode
        : 'equal',
      createdAt: Number.isFinite(expense.createdAt) ? expense.createdAt : Date.now()
    });
  }

  for (const payment of Array.isArray(rawGroup.payments) ? rawGroup.payments : []) {
    if (!payment || typeof payment !== 'object') continue;
    if (!personIds.has(payment.from) || !personIds.has(payment.to)) continue;
    if (payment.from === payment.to) continue;
    if (!Number.isInteger(payment.amountCents) || payment.amountCents <= 0) continue;
    group.payments.push({
      id: typeof payment.id === 'string' && payment.id ? payment.id : uid(),
      from: payment.from,
      to: payment.to,
      amountCents: payment.amountCents,
      createdAt: Number.isFinite(payment.createdAt) ? payment.createdAt : Date.now()
    });
  }

  return group;
}

export function loadState(storage) {
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }
  if (!storage) return createState();

  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (saved) {
      const normalized = normalizeState(saved);
      if (normalized) return normalized;
      try {
        storage.setItem(`${STORAGE_KEY}-corrupto`, saved);
      } catch {
        // Si no se puede respaldar, seguimos con un estado limpio.
      }
    }
  } catch (error) {
    console.warn('No se pudo leer el estado guardado', error);
  }

  try {
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy) {
      const normalized = normalizeState(legacy);
      if (normalized) {
        saveState(normalized, storage);
        try {
          storage.removeItem(LEGACY_KEY);
        } catch {
          // La migración ya se guardó; el borrado es solo limpieza.
        }
        return normalized;
      }
    }
  } catch (error) {
    console.warn('No se pudo migrar el estado anterior', error);
  }

  return createState();
}

export function saveState(state, storage) {
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn('No se pudo guardar el estado', error);
    return false;
  }
}
