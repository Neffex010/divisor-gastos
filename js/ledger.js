// Lógica contable pura: reparto, balances, liquidación y operaciones sobre un grupo.

import { allocateCents, formatCents } from './money.js';

export function sumCents(values) {
  return values.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
}

export function equalShares(amountCents, participantIds) {
  const ids = [...new Set(participantIds)];
  const parts = allocateCents(amountCents, ids.map(() => 1));
  return Object.fromEntries(ids.map((id, index) => [id, parts[index]]));
}

export function sharesFromWeights(amountCents, entries) {
  const valid = entries.filter(([, weight]) => Number.isFinite(weight) && weight > 0);
  const parts = allocateCents(amountCents, valid.map(([, weight]) => weight));
  const shares = {};
  valid.forEach(([id], index) => {
    shares[id] = parts[index];
  });
  return shares;
}

/**
 * Calcula pagado, consumido y neto por persona.
 * Un neto positivo significa que le deben; negativo, que debe.
 */
export function computeBalances(people, expenses, payments = []) {
  const result = new Map(
    people.map((person) => [person.id, { id: person.id, paid: 0, consumed: 0, net: 0 }])
  );

  for (const expense of expenses) {
    const amount = Number.isInteger(expense.amountCents) ? expense.amountCents : 0;
    const payer = result.get(expense.paidBy);
    if (payer && amount > 0) payer.paid += amount;

    for (const [personId, share] of Object.entries(expense.shares || {})) {
      const entry = result.get(personId);
      if (!entry || !Number.isInteger(share)) continue;
      entry.consumed += share;
    }
  }

  for (const entry of result.values()) {
    entry.net = entry.paid - entry.consumed;
  }

  for (const payment of payments) {
    const amount = Number.isInteger(payment.amountCents) ? payment.amountCents : 0;
    const from = result.get(payment.from);
    const to = result.get(payment.to);
    if (from) from.net += amount;
    if (to) to.net -= amount;
  }

  return result;
}

/**
 * Liquidación greedy: genera un conjunto pequeño de transferencias que deja a
 * todos en cero. No muta los balances recibidos.
 */
export function settle(balances) {
  const creditors = [];
  const debtors = [];

  const entries = balances instanceof Map ? [...balances.values()] : Object.values(balances || {});
  for (const entry of entries) {
    const net = Number.isInteger(entry.net) ? entry.net : 0;
    if (net > 0) creditors.push({ id: entry.id, amount: net });
    else if (net < 0) debtors.push({ id: entry.id, amount: -net });
  }

  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const transactions = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0) {
      transactions.push({ from: debtor.id, to: creditor.id, amountCents: amount });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }

  return transactions;
}

/**
 * Elimina a una persona de un grupo sin destruir información de los demás.
 * mode:
 *  - "reassign": reasigna sus pagos a `reassignTo` y reparte su parte entre el resto.
 *  - "delete": elimina los gastos en los que participa o pagó.
 */
export function removePersonFromGroup(group, personId, { mode = 'reassign', reassignTo } = {}) {
  const next = structuredCloneSafe(group);
  next.people = next.people.filter((person) => person.id !== personId);

  const hasFallback = next.people.some((person) => person.id === reassignTo);

  if (mode === 'delete' || !hasFallback) {
    next.expenses = next.expenses.filter(
      (expense) => expense.paidBy !== personId && !(personId in expense.shares)
    );
  } else {
    next.expenses = next.expenses
      .map((expense) => {
        const updated = { ...expense, shares: { ...expense.shares } };
        if (updated.paidBy === personId) updated.paidBy = reassignTo;

        if (personId in updated.shares) {
          const removedShare = updated.shares[personId];
          delete updated.shares[personId];
          const remaining = Object.keys(updated.shares);

          if (remaining.length === 0) return null;

          const extra = allocateCents(removedShare, remaining.map(() => 1));
          remaining.forEach((id, index) => {
            updated.shares[id] += extra[index];
          });
        }

        return updated;
      })
      .filter(Boolean);
  }

  next.payments = next.payments.filter(
    (payment) => payment.from !== personId && payment.to !== personId
  );

  return next;
}

export function groupTotals(group) {
  const totalCents = sumCents(group.expenses.map((expense) => expense.amountCents));
  return {
    totalCents,
    expenseCount: group.expenses.length,
    peopleCount: group.people.length,
    paymentCount: group.payments.length
  };
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function expensesToCsv(group) {
  const nameById = new Map(group.people.map((person) => [person.id, person.name]));
  const rows = [
    ['Fecha', 'Descripción', 'Monto', 'Moneda', 'Pagó', 'Participantes', 'Reparto']
  ];

  for (const expense of group.expenses) {
    const participants = Object.keys(expense.shares)
      .map((id) => nameById.get(id) || id)
      .join(' | ');
    const split = Object.entries(expense.shares)
      .map(([id, cents]) => `${nameById.get(id) || id}: ${(cents / 100).toFixed(2)}`)
      .join(' | ');
    rows.push([
      expense.createdAt ? new Date(expense.createdAt).toLocaleDateString('es-MX') : '',
      expense.description,
      (expense.amountCents / 100).toFixed(2),
      group.currency,
      nameById.get(expense.paidBy) || expense.paidBy,
      participants,
      split
    ]);
  }

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}

export function buildShareText(group) {
  const balances = computeBalances(group.people, group.expenses, group.payments);
  const transactions = settle(balances);
  const nameById = new Map(group.people.map((person) => [person.id, person.name]));
  const totals = groupTotals(group);
  const money = (cents) => formatCents(cents, group.currency);

  const lines = [
    `Divisor de Gastos — ${group.name}`,
    `Total: ${money(totals.totalCents)} · ${totals.expenseCount} gasto(s) · ${totals.peopleCount} persona(s)`,
    ''
  ];

  if (transactions.length === 0) {
    lines.push('Todo cuadrado: nadie debe nada.');
  } else {
    lines.push('Liquidación:');
    for (const transaction of transactions) {
      lines.push(
        `• ${nameById.get(transaction.from) || '—'} → ${nameById.get(transaction.to) || '—'}: ${money(transaction.amountCents)}`
      );
    }
  }

  return lines.join('\n');
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
