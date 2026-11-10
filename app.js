import {
  CURRENCIES,
  centsToInput,
  formatCents,
  formatPercent,
  parseAmountToCents
} from './js/money.js';
import {
  buildShareText,
  computeBalances,
  equalShares,
  expensesToCsv,
  groupTotals,
  removePersonFromGroup,
  settle,
  sharesFromWeights
} from './js/ledger.js';
import {
  SCHEMA_VERSION,
  createGroup,
  loadState,
  normalizeState,
  saveState,
  uid
} from './js/storage.js';

const $ = (id) => document.getElementById(id);

const els = {
  groupSelect: $('group-select'),
  currency: $('currency'),
  groupNew: $('group-new'),
  groupRename: $('group-rename'),
  groupDelete: $('group-delete'),
  summaryTotal: $('summary-total'),
  summaryCount: $('summary-count'),
  summaryPeople: $('summary-people'),
  personForm: $('person-form'),
  personName: $('person-name'),
  personError: $('person-error'),
  peopleList: $('people-list'),
  expenseForm: $('expense-form'),
  expenseDesc: $('expense-desc'),
  expenseAmount: $('expense-amount'),
  expensePaidBy: $('expense-paidby'),
  participantList: $('participant-list'),
  splitPreview: $('split-preview'),
  expenseError: $('expense-error'),
  expenseSubmit: $('expense-submit'),
  expenseCancel: $('expense-cancel'),
  expensesList: $('expenses-list'),
  balances: $('balances'),
  settlements: $('settlements'),
  settlementsTitle: $('settlements-title'),
  paymentsList: $('payments-list'),
  shareBtn: $('share-btn'),
  exportJson: $('export-json'),
  exportCsv: $('export-csv'),
  importBtn: $('import-btn'),
  importFile: $('import-file'),
  printBtn: $('print-btn'),
  resetBtn: $('reset-btn'),
  installBtn: $('install-btn'),
  offlineBadge: $('offline-badge'),
  confirmDialog: $('confirm-dialog'),
  confirmForm: $('confirm-form'),
  confirmTitle: $('confirm-title'),
  confirmMessage: $('confirm-message'),
  confirmOk: $('confirm-ok'),
  promptDialog: $('prompt-dialog'),
  promptForm: $('prompt-form'),
  promptTitle: $('prompt-title'),
  promptLabel: $('prompt-label'),
  promptInput: $('prompt-input'),
  promptError: $('prompt-error'),
  promptOk: $('prompt-ok'),
  personDeleteDialog: $('person-delete-dialog'),
  personDeleteForm: $('person-delete-form'),
  pdTitle: $('pd-title'),
  pdMessage: $('pd-message'),
  pdOptions: $('pd-options'),
  pdReassign: $('pd-reassign'),
  pdError: $('pd-error'),
  textDialog: $('text-dialog'),
  textTitle: $('text-title'),
  textOutput: $('text-output'),
  textCopy: $('text-copy'),
  toast: $('toast'),
  toastMessage: $('toast-message'),
  toastAction: $('toast-action'),
  toastClose: $('toast-close')
};

let state = loadState();
let draft = createDraft();
let editingExpenseId = null;
let pendingUndo = null;
let toastTimer = null;
let promptValidator = null;
let deferredInstallPrompt = null;

function createDraft() {
  return {
    description: '',
    amount: '',
    paidBy: '',
    participants: null,
    mode: 'equal',
    values: {},
    editingId: null
  };
}

function getActiveGroup() {
  let group = state.groups.find((item) => item.id === state.activeGroupId);
  if (!group) {
    group = state.groups[0];
    state.activeGroupId = group.id;
  }
  return group;
}

function money(cents) {
  return formatCents(cents, getActiveGroup().currency);
}

function snapshot() {
  return structuredClone(state);
}

function commit(message, { before = null, type = 'info' } = {}) {
  const saved = saveState(state);
  renderAll();

  if (!saved) {
    showToast('No se pudo guardar. Revisa el espacio del navegador o el modo privado.', {
      type: 'error',
      timeout: 9000
    });
    return false;
  }

  if (message) showToast(message, { undo: before });
  return true;
}

function setError(element, message) {
  element.textContent = message || '';
  element.hidden = !message;
}

function clearError(element) {
  setError(element, '');
}

function parsePercent(raw) {
  if (typeof raw !== 'string') return NaN;
  const cleaned = raw.replace(/%/g, '').trim().replace(',', '.');
  if (!cleaned) return NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

/* ===== Render ===== */
function renderAll() {
  renderGroupBar();
  renderSummary();
  renderPeople();
  renderExpenseForm();
  renderExpenses();
  renderResults();
  renderPayments();
}

function renderGroupBar() {
  const group = getActiveGroup();

  els.groupSelect.innerHTML = '';
  for (const item of state.groups) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    els.groupSelect.appendChild(option);
  }
  els.groupSelect.value = group.id;
  els.currency.value = group.currency;
  els.groupDelete.disabled = state.groups.length <= 1;
}

function renderSummary() {
  const group = getActiveGroup();
  const totals = groupTotals(group);
  els.summaryTotal.textContent = formatCents(totals.totalCents, group.currency);
  els.summaryCount.textContent = String(totals.expenseCount);
  els.summaryPeople.textContent = String(totals.peopleCount);
}

function renderPeople() {
  const group = getActiveGroup();
  els.peopleList.innerHTML = '';

  if (group.people.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Aún no hay personas. Agrega al menos 2.';
    els.peopleList.appendChild(li);
    return;
  }

  for (const person of group.people) {
    const li = document.createElement('li');

    const name = document.createElement('span');
    name.className = 'person-name';
    name.textContent = person.name;

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-btn edit';
    edit.dataset.action = 'edit-person';
    edit.dataset.id = person.id;
    edit.setAttribute('aria-label', `Renombrar a ${person.name}`);
    edit.title = 'Renombrar';
    edit.textContent = '✎';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.dataset.action = 'remove-person';
    remove.dataset.id = person.id;
    remove.setAttribute('aria-label', `Eliminar a ${person.name}`);
    remove.title = 'Eliminar';
    remove.textContent = '✕';

    actions.append(edit, remove);
    li.append(name, actions);
    els.peopleList.appendChild(li);
  }
}

function ensureDraftDefaults(group) {
  if (!group.people.some((person) => person.id === draft.paidBy)) {
    draft.paidBy = group.people[0]?.id || '';
  }

  if (draft.participants) {
    const valid = new Set(group.people.map((person) => person.id));
    for (const id of [...draft.participants]) {
      if (!valid.has(id)) draft.participants.delete(id);
    }
  }
}

function resolveParticipantIds(group) {
  const all = group.people.map((person) => person.id);
  if (draft.participants === null) return all;
  return all.filter((id) => draft.participants.has(id));
}

function renderExpenseForm() {
  const group = getActiveGroup();
  ensureDraftDefaults(group);

  if (els.expenseDesc.value !== draft.description) els.expenseDesc.value = draft.description;
  if (els.expenseAmount.value !== draft.amount) els.expenseAmount.value = draft.amount;

  els.expensePaidBy.innerHTML = '';
  if (group.people.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Agrega personas primero';
    els.expensePaidBy.appendChild(option);
    els.expensePaidBy.disabled = true;
  } else {
    els.expensePaidBy.disabled = false;
    for (const person of group.people) {
      const option = document.createElement('option');
      option.value = person.id;
      option.textContent = person.name;
      els.expensePaidBy.appendChild(option);
    }
    els.expensePaidBy.value = draft.paidBy;
  }

  for (const radio of document.querySelectorAll('input[name="split-mode"]')) {
    radio.checked = radio.value === draft.mode;
  }

  els.expenseSubmit.textContent = editingExpenseId ? 'Guardar cambios' : 'Agregar gasto';
  els.expenseCancel.hidden = !editingExpenseId;

  renderParticipantList();
  updateSplitPreview();
}

function renderParticipantList() {
  const group = getActiveGroup();
  els.participantList.innerHTML = '';

  if (group.people.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin personas todavía.';
    els.participantList.appendChild(li);
    return;
  }

  const isEqual = draft.mode === 'equal';

  for (const person of group.people) {
    const checked = draft.participants === null || draft.participants.has(person.id);

    const li = document.createElement('li');
    li.className = 'participant-row';

    const label = document.createElement('label');
    label.className = 'check';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.participant = person.id;
    checkbox.checked = checked;

    const labelText = document.createElement('span');
    labelText.textContent = person.name;

    label.append(checkbox, labelText);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'share-input';
    input.dataset.share = person.id;
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.value = draft.values[person.id] || '';
    input.hidden = isEqual;
    input.placeholder = draft.mode === 'percent' ? '%' : '0.00';
    input.setAttribute(
      'aria-label',
      `${draft.mode === 'percent' ? 'Porcentaje' : 'Monto'} para ${person.name}`
    );

    const preview = document.createElement('span');
    preview.className = 'share-preview';
    preview.dataset.preview = person.id;
    preview.textContent = '—';

    li.append(label, input, preview);
    els.participantList.appendChild(li);
  }
}

function updateSplitPreview() {
  const group = getActiveGroup();
  const ids = resolveParticipantIds(group);
  const amountCents = parseAmountToCents(draft.amount);
  const preview = els.splitPreview;

  preview.classList.remove('is-error');
  els.participantList.querySelectorAll('[data-preview]').forEach((cell) => {
    cell.textContent = '—';
  });

  if (group.people.length === 0) {
    preview.textContent = 'Agrega personas para empezar.';
    return;
  }

  if (ids.length === 0) {
    preview.classList.add('is-error');
    preview.textContent = 'Marca al menos un participante.';
    return;
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    preview.textContent = 'Escribe un monto mayor a 0 para ver el reparto.';
    return;
  }

  let shares = null;
  let message = '';

  if (draft.mode === 'equal') {
    shares = equalShares(amountCents, ids);
    message = `Partes iguales: ${money(amountCents)} entre ${ids.length} persona(s).`;
  } else if (draft.mode === 'amount') {
    const values = ids.map((id) => parseAmountToCents(draft.values[id] ?? ''));
    const valid = values.every((value) => Number.isInteger(value) && value >= 0);
    const sum = values.reduce((acc, value) => acc + (Number.isInteger(value) ? value : 0), 0);

    if (!valid) {
      message = 'Escribe un monto válido para cada participante.';
    } else if (sum !== amountCents) {
      message = `Las partes suman ${money(sum)} y el total es ${money(amountCents)}.`;
    } else {
      shares = Object.fromEntries(ids.map((id, index) => [id, values[index]]));
      message = `Reparto manual: ${money(sum)} en total.`;
    }

    if (!valid || sum !== amountCents) preview.classList.add('is-error');
  } else {
    const percents = ids.map((id) => parsePercent(draft.values[id] ?? ''));
    const valid = percents.every((value) => Number.isFinite(value) && value >= 0);
    const sum = percents.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);

    if (!valid) {
      message = 'Escribe un porcentaje válido para cada participante.';
    } else if (Math.abs(sum - 100) > 0.01) {
      message = `Los porcentajes suman ${formatPercent(sum)}; deben sumar 100 %.`;
    } else {
      shares = sharesFromWeights(amountCents, ids.map((id, index) => [id, percents[index]]));
      message = `Reparto por porcentaje sobre ${money(amountCents)}.`;
    }

    if (!valid || Math.abs(sum - 100) > 0.01) preview.classList.add('is-error');
  }

  preview.textContent = message;

  if (!shares) return;

  for (const cell of els.participantList.querySelectorAll('[data-preview]')) {
    const id = cell.dataset.preview;
    if (Number.isInteger(shares[id])) cell.textContent = money(shares[id]);
  }
}

function renderExpenses() {
  const group = getActiveGroup();
  els.expensesList.innerHTML = '';

  if (group.expenses.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin gastos registrados aún.';
    els.expensesList.appendChild(li);
    return;
  }

  const nameById = new Map(group.people.map((person) => [person.id, person.name]));

  for (const expense of group.expenses) {
    const li = document.createElement('li');
    li.className = 'expense-item';

    const main = document.createElement('div');
    main.className = 'expense-main';

    const title = document.createElement('div');
    title.className = 'expense-title';
    title.textContent = expense.description;

    const participants = Object.keys(expense.shares).map((id) => nameById.get(id) || '—');
    const meta = document.createElement('div');
    meta.className = 'expense-meta';
    const modeLabel = expense.splitMode && expense.splitMode !== 'equal' ? ' · reparto personalizado' : '';
    meta.textContent = `Pagó ${nameById.get(expense.paidBy) || '—'} · entre ${participants.length}: ${participants.join(', ')}${modeLabel}`;

    main.append(title, meta);

    const right = document.createElement('div');
    right.className = 'expense-right';

    const amount = document.createElement('span');
    amount.className = 'amount';
    amount.textContent = money(expense.amountCents);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-btn edit';
    edit.dataset.action = 'edit-expense';
    edit.dataset.id = expense.id;
    edit.setAttribute('aria-label', `Editar gasto ${expense.description}`);
    edit.title = 'Editar';
    edit.textContent = '✎';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.dataset.action = 'remove-expense';
    remove.dataset.id = expense.id;
    remove.setAttribute('aria-label', `Eliminar gasto ${expense.description}`);
    remove.title = 'Eliminar';
    remove.textContent = '✕';

    actions.append(edit, remove);
    right.append(amount, actions);
    li.append(main, right);
    els.expensesList.appendChild(li);
  }
}

function renderResults() {
  const group = getActiveGroup();
  els.balances.innerHTML = '';
  els.settlements.innerHTML = '';

  if (group.people.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Agrega personas y gastos para ver el resultado.';
    els.balances.appendChild(empty);
    return;
  }

  const balances = computeBalances(group.people, group.expenses, group.payments);
  const nameById = new Map(group.people.map((person) => [person.id, person.name]));

  const rows = [...balances.values()].sort((a, b) => {
    if (b.net !== a.net) return b.net - a.net;
    return (nameById.get(a.id) || '').localeCompare(nameById.get(b.id) || '', 'es');
  });

  for (const row of rows) {
    const wrapper = document.createElement('div');
    wrapper.className = `balance-row ${row.net > 0 ? 'positive' : row.net < 0 ? 'negative' : 'neutral'}`;

    const main = document.createElement('div');
    main.className = 'balance-main';

    const name = document.createElement('div');
    name.className = 'balance-name';
    name.textContent = nameById.get(row.id) || '—';

    const detail = document.createElement('div');
    detail.className = 'balance-detail';
    detail.textContent = `Pagó ${money(row.paid)} · consumió ${money(row.consumed)}`;

    main.append(name, detail);

    const net = document.createElement('div');
    net.className = 'balance-net';
    if (row.net > 0) net.textContent = `${money(row.net)} le deben`;
    else if (row.net < 0) net.textContent = `${money(-row.net)} debe`;
    else net.textContent = 'En paz';

    wrapper.append(main, net);
    els.balances.appendChild(wrapper);
  }

  const transactions = settle(balances);

  if (transactions.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '🎉 Nadie debe nada. Todo cuadrado.';
    els.settlements.appendChild(li);
    return;
  }

  for (const transaction of transactions) {
    const li = document.createElement('li');
    li.className = 'settle-item';

    const main = document.createElement('div');
    main.className = 'settle-main';

    const from = document.createElement('strong');
    from.textContent = nameById.get(transaction.from) || '—';
    const arrow = document.createElement('span');
    arrow.textContent = '→';
    const to = document.createElement('strong');
    to.textContent = nameById.get(transaction.to) || '—';

    main.append(from, arrow, to);

    const actions = document.createElement('div');
    actions.className = 'settle-actions';

    const amount = document.createElement('span');
    amount.className = 'amount';
    amount.textContent = money(transaction.amountCents);

    const pay = document.createElement('button');
    pay.type = 'button';
    pay.className = 'ghost';
    pay.dataset.action = 'mark-paid';
    pay.dataset.from = transaction.from;
    pay.dataset.to = transaction.to;
    pay.dataset.amount = String(transaction.amountCents);
    pay.textContent = 'Marcar pagado';

    actions.append(amount, pay);
    li.append(main, actions);
    els.settlements.appendChild(li);
  }
}

function renderPayments() {
  const group = getActiveGroup();
  els.paymentsList.innerHTML = '';

  if (group.payments.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Aún no has marcado ningún pago.';
    els.paymentsList.appendChild(li);
    return;
  }

  const nameById = new Map(group.people.map((person) => [person.id, person.name]));

  for (const payment of [...group.payments].sort((a, b) => b.createdAt - a.createdAt)) {
    const li = document.createElement('li');
    li.className = 'payment-item';

    const main = document.createElement('div');
    main.className = 'payment-main';

    const text = document.createElement('div');
    text.textContent = `${nameById.get(payment.from) || '—'} pagó a ${nameById.get(payment.to) || '—'}`;

    const date = document.createElement('div');
    date.className = 'payment-meta';
    date.textContent = new Date(payment.createdAt).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    main.append(text, date);

    const right = document.createElement('div');
    right.className = 'row-actions';

    const amount = document.createElement('span');
    amount.className = 'amount';
    amount.textContent = money(payment.amountCents);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.dataset.action = 'remove-payment';
    remove.dataset.id = payment.id;
    remove.setAttribute('aria-label', 'Eliminar pago registrado');
    remove.title = 'Eliminar';
    remove.textContent = '✕';

    right.append(amount, remove);
    li.append(main, right);
    els.paymentsList.appendChild(li);
  }
}

/* ===== Acciones ===== */
function handlePersonSubmit(event) {
  event.preventDefault();
  const group = getActiveGroup();
  const name = els.personName.value.trim();
  clearError(els.personError);

  const validation = validatePersonName(name);
  if (validation) {
    setError(els.personError, validation);
    els.personName.focus();
    return;
  }

  const before = snapshot();
  const person = { id: uid(), name };
  group.people.push(person);
  if (draft.participants) draft.participants.add(person.id);

  els.personName.value = '';
  commit('Persona agregada.', { before });
  els.personName.focus();
}

function validatePersonName(name, ignoreId = null) {
  if (!name) return 'Escribe un nombre.';
  if (name.length > 60) return 'El nombre no puede pasar de 60 caracteres.';
  const group = getActiveGroup();
  const normalized = name.toLocaleLowerCase('es');
  if (
    group.people.some(
      (person) => person.id !== ignoreId && person.name.toLocaleLowerCase('es') === normalized
    )
  ) {
    return 'Ya existe una persona con ese nombre.';
  }
  return null;
}

function handleExpenseSubmit(event) {
  event.preventDefault();
  const group = getActiveGroup();
  clearError(els.expenseError);

  const description = els.expenseDesc.value.trim();
  const amountCents = parseAmountToCents(els.expenseAmount.value);
  const paidBy = els.expensePaidBy.value;
  const ids = resolveParticipantIds(group);

  const fail = (message) => {
    setError(els.expenseError, message);
  };

  if (!description) return fail('Escribe una descripción.');
  if (!Number.isInteger(amountCents) || amountCents <= 0) return fail('Escribe un monto mayor a 0.');
  if (group.people.length === 0) return fail('Agrega al menos una persona.');
  if (!group.people.some((person) => person.id === paidBy)) return fail('Selecciona quién pagó.');
  if (ids.length === 0) return fail('Marca al menos un participante.');

  let shares;

  if (draft.mode === 'equal') {
    shares = equalShares(amountCents, ids);
  } else if (draft.mode === 'amount') {
    const values = ids.map((id) => parseAmountToCents(draft.values[id] ?? ''));
    if (values.some((value) => !Number.isInteger(value) || value < 0)) {
      return fail('Revisa los montos por participante.');
    }
    const sum = values.reduce((acc, value) => acc + value, 0);
    if (sum !== amountCents) {
      return fail(`La suma de las partes (${money(sum)}) debe ser igual al total (${money(amountCents)}).`);
    }
    shares = Object.fromEntries(ids.map((id, index) => [id, values[index]]));
  } else {
    const percents = ids.map((id) => parsePercent(draft.values[id] ?? ''));
    if (percents.some((value) => !Number.isFinite(value) || value < 0)) {
      return fail('Revisa los porcentajes.');
    }
    const sum = percents.reduce((acc, value) => acc + value, 0);
    if (Math.abs(sum - 100) > 0.01) {
      return fail(`Los porcentajes deben sumar 100 % (suman ${formatPercent(sum)}).`);
    }
    shares = sharesFromWeights(amountCents, ids.map((id, index) => [id, percents[index]]));
  }

  if (!Object.values(shares).some((value) => value > 0)) {
    return fail('Al menos una persona debe pagar una parte.');
  }

  const before = snapshot();

  if (editingExpenseId) {
    const expense = group.expenses.find((item) => item.id === editingExpenseId);
    if (!expense) {
      cancelEdit();
      return;
    }
    Object.assign(expense, {
      description,
      amountCents,
      paidBy,
      shares,
      splitMode: draft.mode
    });
    resetDraft();
    commit('Gasto actualizado.', { before });
  } else {
    group.expenses.push({
      id: uid(),
      description,
      amountCents,
      paidBy,
      shares,
      splitMode: draft.mode,
      createdAt: Date.now()
    });
    resetDraft();
    commit('Gasto agregado.', { before });
  }

  els.expenseDesc.focus();
}

function resetDraft() {
  draft = createDraft();
  editingExpenseId = null;
  clearError(els.expenseError);
}

function startEditExpense(expense) {
  const group = getActiveGroup();
  if (!group.expenses.some((item) => item.id === expense.id)) return;

  editingExpenseId = expense.id;
  draft = {
    description: expense.description,
    amount: centsToInput(expense.amountCents),
    paidBy: expense.paidBy,
    participants: new Set(Object.keys(expense.shares)),
    mode: expense.splitMode || 'equal',
    values: {},
    editingId: expense.id
  };

  for (const [id, cents] of Object.entries(expense.shares)) {
    if (draft.mode === 'percent') {
      draft.values[id] = (expense.amountCents > 0 ? (cents / expense.amountCents) * 100 : 0).toFixed(2);
    } else {
      draft.values[id] = centsToInput(cents);
    }
  }

  clearError(els.expenseError);
  renderExpenseForm();
  els.expenseDesc.focus();
  els.expenseForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEdit() {
  resetDraft();
  renderAll();
  els.expenseDesc.focus();
}

function handlePeopleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const group = getActiveGroup();
  if (button.dataset.action === 'edit-person') {
    editPerson(button.dataset.id);
  } else if (button.dataset.action === 'remove-person') {
    askRemovePerson(button.dataset.id);
  }
}

async function editPerson(personId) {
  const group = getActiveGroup();
  const person = group.people.find((item) => item.id === personId);
  if (!person) return;

  const name = await openPrompt({
    title: 'Renombrar persona',
    label: 'Nombre',
    value: person.name,
    confirmText: 'Guardar',
    validate: (value) => validatePersonName(value.trim(), personId)
  });

  if (name === null) return;
  const before = snapshot();
  person.name = name;
  commit('Nombre actualizado.', { before });
}

async function askRemovePerson(personId) {
  const group = getActiveGroup();
  const person = group.people.find((item) => item.id === personId);
  if (!person) return;

  const usedExpenses = group.expenses.filter(
    (expense) => expense.paidBy === personId || personId in expense.shares
  );
  const usedPayments = group.payments.filter(
    (payment) => payment.from === personId || payment.to === personId
  );

  if (usedExpenses.length === 0 && usedPayments.length === 0) {
    const confirmed = await openConfirm({
      title: `Eliminar a ${person.name}`,
      message: 'No participa en ningún gasto. ¿Quieres eliminarla del grupo?',
      confirmText: 'Eliminar',
      danger: true
    });
    if (!confirmed) return;

    const before = snapshot();
    removePersonClean(group, personId);
    commit('Persona eliminada.', { before });
    return;
  }

  const result = await openPersonDeleteDialog(person, usedExpenses.length);
  if (!result) return;

  const before = snapshot();
  const index = state.groups.findIndex((item) => item.id === group.id);
  const updated = removePersonFromGroup(group, personId, result);
  state.groups[index] = updated;
  if (state.activeGroupId !== updated.id) state.activeGroupId = updated.id;
  commit('Persona eliminada.', { before });
}

function removePersonClean(group, personId) {
  group.people = group.people.filter((person) => person.id !== personId);
  group.payments = group.payments.filter(
    (payment) => payment.from !== personId && payment.to !== personId
  );
}

function handleExpensesClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const group = getActiveGroup();
  const expense = group.expenses.find((item) => item.id === button.dataset.id);

  if (button.dataset.action === 'edit-expense' && expense) {
    startEditExpense(expense);
  } else if (button.dataset.action === 'remove-expense' && expense) {
    const before = snapshot();
    group.expenses = group.expenses.filter((item) => item.id !== expense.id);
    if (editingExpenseId === expense.id) resetDraft();
    commit('Gasto eliminado.', { before });
  }
}

function handleSettlementsClick(event) {
  const button = event.target.closest('[data-action="mark-paid"]');
  if (!button) return;

  const group = getActiveGroup();
  const from = button.dataset.from;
  const to = button.dataset.to;
  const amountCents = Number(button.dataset.amount);

  if (!group.people.some((person) => person.id === from) || !group.people.some((person) => person.id === to)) {
    showToast('Esa persona ya no existe en el grupo.', { type: 'error' });
    return;
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) return;

  const before = snapshot();
  group.payments.push({
    id: uid(),
    from,
    to,
    amountCents,
    createdAt: Date.now()
  });
  commit('Pago registrado.', { before });
}

function handlePaymentsClick(event) {
  const button = event.target.closest('[data-action="remove-payment"]');
  if (!button) return;
  const group = getActiveGroup();
  const before = snapshot();
  group.payments = group.payments.filter((payment) => payment.id !== button.dataset.id);
  commit('Pago eliminado.', { before });
}

async function createNewGroup() {
  const name = await openPrompt({
    title: 'Nuevo grupo',
    label: 'Nombre del grupo',
    value: `Grupo ${state.groups.length + 1}`,
    confirmText: 'Crear',
    validate: (value) => (value.trim() ? null : 'Escribe un nombre para el grupo.')
  });
  if (name === null) return;

  const before = snapshot();
  const group = createGroup(name, getActiveGroup().currency);
  state.groups.push(group);
  state.activeGroupId = group.id;
  resetDraft();
  commit('Grupo creado.', { before });
}

async function renameGroup() {
  const group = getActiveGroup();
  const name = await openPrompt({
    title: 'Renombrar grupo',
    label: 'Nombre del grupo',
    value: group.name,
    confirmText: 'Guardar',
    validate: (value) => (value.trim() ? null : 'Escribe un nombre para el grupo.')
  });
  if (name === null) return;

  const before = snapshot();
  group.name = name;
  commit('Grupo renombrado.', { before });
}

async function deleteGroup() {
  if (state.groups.length <= 1) return;
  const group = getActiveGroup();
  const confirmed = await openConfirm({
    title: `Eliminar el grupo "${group.name}"`,
    message: 'Se borrarán sus personas, gastos y pagos. Esta acción se puede deshacer.',
    confirmText: 'Eliminar grupo',
    danger: true
  });
  if (!confirmed) return;

  const before = snapshot();
  state.groups = state.groups.filter((item) => item.id !== group.id);
  state.activeGroupId = state.groups[0].id;
  resetDraft();
  commit('Grupo eliminado.', { before });
}

async function resetGroup() {
  const group = getActiveGroup();
  const confirmed = await openConfirm({
    title: `Reiniciar "${group.name}"`,
    message: 'Se borrarán todas las personas, gastos y pagos de este grupo. La moneda y el nombre se conservan.',
    confirmText: 'Reiniciar grupo',
    danger: true
  });
  if (!confirmed) return;

  const before = snapshot();
  group.people = [];
  group.expenses = [];
  group.payments = [];
  resetDraft();
  commit('Grupo reiniciado.', { before });
}

function exportJson() {
  const payload = {
    app: 'divisor-gastos',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state
  };
  download(
    `divisor-gastos-${dateStamp()}.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  );
  showToast('Respaldo exportado.');
}

function exportCsv() {
  const group = getActiveGroup();
  if (group.expenses.length === 0) {
    showToast('No hay gastos para exportar.', { type: 'error' });
    return;
  }
  const content = `\uFEFF${expensesToCsv(group)}`;
  download(
    `divisor-gastos-${slugify(group.name)}-${dateStamp()}.csv`,
    content,
    'text/csv;charset=utf-8'
  );
  showToast('CSV exportado.');
}

async function importJson(file) {
  let parsed;
  try {
    parsed = normalizeState(await file.text());
  } catch {
    parsed = null;
  }

  if (!parsed) {
    showToast('El archivo no es un respaldo válido de Divisor de Gastos.', {
      type: 'error',
      timeout: 8000
    });
    return;
  }

  const confirmed = await openConfirm({
    title: 'Importar respaldo',
    message: 'Se reemplazarán todos los grupos y datos actuales. ¿Continuar?',
    confirmText: 'Importar y reemplazar',
    danger: true
  });
  if (!confirmed) return;

  const before = snapshot();
  state = parsed;
  resetDraft();
  commit('Datos importados.', { before });
}

async function shareSettlement() {
  const group = getActiveGroup();
  if (group.people.length === 0) {
    showToast('Agrega personas y gastos primero.', { type: 'error' });
    return;
  }

  const text = buildShareText(group);

  if (navigator.share && navigator.canShare?.({ text }) !== false) {
    try {
      await navigator.share({ title: 'Divisor de Gastos', text });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }

  if (await copyText(text)) return;
  openTextDialog('Compartir liquidación', text);
}

async function copyText(text) {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    showToast('Texto copiado al portapapeles.');
    return true;
  } catch {
    return false;
  }
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStamp() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'grupo';
}

/* ===== Diálogos ===== */
function setDialogError(element, message) {
  element.textContent = message || '';
  element.hidden = !message;
}

function openPrompt({ title, label, value, confirmText = 'Guardar', validate }) {
  if (els.promptDialog.open) els.promptDialog.close('cancel');

  els.promptDialog.returnValue = '';
  els.promptTitle.textContent = title;
  els.promptLabel.textContent = label;
  els.promptInput.value = value || '';
  els.promptOk.textContent = confirmText;
  setDialogError(els.promptError, '');
  promptValidator = validate || ((input) => (input.trim() ? null : 'Escribe un valor.'));

  els.promptDialog.showModal();
  els.promptInput.focus();
  els.promptInput.select();

  return new Promise((resolve) => {
    els.promptDialog.addEventListener(
      'close',
      () => {
        const accepted = els.promptDialog.returnValue === 'ok';
        promptValidator = null;
        resolve(accepted ? els.promptInput.value.trim() : null);
      },
      { once: true }
    );
  });
}

function openConfirm({ title, message, confirmText = 'Confirmar', danger = false }) {
  if (els.confirmDialog.open) els.confirmDialog.close('cancel');

  els.confirmDialog.returnValue = '';
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  els.confirmOk.textContent = confirmText;
  els.confirmOk.className = danger ? 'danger' : '';

  els.confirmDialog.showModal();
  els.confirmOk.focus();

  return new Promise((resolve) => {
    els.confirmDialog.addEventListener(
      'close',
      () => resolve(els.confirmDialog.returnValue === 'ok'),
      { once: true }
    );
  });
}

function openPersonDeleteDialog(person, expenseCount) {
  if (els.personDeleteDialog.open) els.personDeleteDialog.close('cancel');

  els.personDeleteDialog.returnValue = '';
  const group = getActiveGroup();
  const remaining = group.people.filter((item) => item.id !== person.id);

  els.pdTitle.textContent = `Eliminar a ${person.name}`;
  els.pdMessage.textContent = `Aparece en ${expenseCount} gasto(s). Elige qué hacer con su información.`;
  setDialogError(els.pdError, '');

  els.pdReassign.innerHTML = '';
  for (const item of remaining) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    els.pdReassign.appendChild(option);
  }

  const reassignRadio = els.personDeleteForm.querySelector('input[name="pd-mode"][value="reassign"]');
  const deleteRadio = els.personDeleteForm.querySelector('input[name="pd-mode"][value="delete"]');

  if (remaining.length === 0) {
    reassignRadio.checked = false;
    reassignRadio.disabled = true;
    els.pdReassign.disabled = true;
    deleteRadio.checked = true;
    els.pdMessage.textContent += ' No quedan otras personas, así que se eliminarán los gastos afectados.';
  } else {
    reassignRadio.checked = true;
    reassignRadio.disabled = false;
    els.pdReassign.disabled = false;
  }

  els.personDeleteDialog.showModal();
  els.personDeleteDialog.querySelector('[name="pd-mode"]:checked')?.focus();

  return new Promise((resolve) => {
    els.personDeleteDialog.addEventListener(
      'close',
      () => {
        if (els.personDeleteDialog.returnValue !== 'ok') {
          resolve(null);
          return;
        }
        resolve({
          mode: els.personDeleteForm.elements['pd-mode'].value,
          reassignTo: els.pdReassign.value
        });
      },
      { once: true }
    );
  });
}

function openTextDialog(title, text) {
  if (els.textDialog.open) els.textDialog.close('cancel');
  els.textTitle.textContent = title;
  els.textOutput.value = text;
  els.textDialog.showModal();
  els.textOutput.focus();
  els.textOutput.select();
}

/* ===== Toast ===== */
function showToast(message, { undo = null, type = 'info', timeout } = {}) {
  clearTimeout(toastTimer);
  els.toastMessage.textContent = message;
  els.toast.classList.toggle('is-error', type === 'error');
  els.toast.hidden = false;
  pendingUndo = undo;
  els.toastAction.hidden = !undo;

  const duration = timeout ?? (undo ? 9000 : 4500);
  toastTimer = setTimeout(hideToast, duration);
}

function hideToast() {
  clearTimeout(toastTimer);
  els.toast.hidden = true;
  els.toastAction.hidden = true;
  pendingUndo = null;
}

function undoLast() {
  if (!pendingUndo) return;
  state = pendingUndo;
  pendingUndo = null;
  hideToast();

  if (saveState(state)) {
    resetDraft();
    renderAll();
    showToast('Cambios deshechos.');
  } else {
    showToast('No se pudo guardar el cambio.', { type: 'error' });
  }
}

/* ===== Utilidades DOM ===== */
function updateConnectivity() {
  els.offlineBadge.hidden = navigator.onLine;
}

/* ===== Eventos ===== */
function wireEvents() {
  els.personForm.addEventListener('submit', handlePersonSubmit);
  els.expenseForm.addEventListener('submit', handleExpenseSubmit);
  els.peopleList.addEventListener('click', handlePeopleClick);
  els.expensesList.addEventListener('click', handleExpensesClick);
  els.settlements.addEventListener('click', handleSettlementsClick);
  els.paymentsList.addEventListener('click', handlePaymentsClick);

  els.expenseForm.addEventListener('input', (event) => {
    const target = event.target;
    if (target === els.expenseDesc) draft.description = target.value;
    else if (target === els.expenseAmount) {
      draft.amount = target.value;
      updateSplitPreview();
    } else if (target.matches('[data-share]')) {
      draft.values[target.dataset.share] = target.value;
      updateSplitPreview();
    }
  });

  els.expenseForm.addEventListener('change', (event) => {
    const target = event.target;

    if (target === els.expensePaidBy) {
      draft.paidBy = target.value;
    } else if (target.matches('[data-participant]')) {
      const group = getActiveGroup();
      if (draft.participants === null) {
        draft.participants = new Set(group.people.map((person) => person.id));
      }
      if (target.checked) draft.participants.add(target.dataset.participant);
      else draft.participants.delete(target.dataset.participant);
      updateSplitPreview();
    } else if (target.name === 'split-mode') {
      draft.mode = target.value;
      renderParticipantList();
      updateSplitPreview();
    }
  });

  els.expenseCancel.addEventListener('click', cancelEdit);

  els.groupSelect.addEventListener('change', () => {
    state.activeGroupId = els.groupSelect.value;
    resetDraft();
    saveState(state);
    renderAll();
  });

  els.currency.addEventListener('change', () => {
    const group = getActiveGroup();
    group.currency = els.currency.value;
    saveState(state);
    renderAll();
  });

  els.groupNew.addEventListener('click', createNewGroup);
  els.groupRename.addEventListener('click', renameGroup);
  els.groupDelete.addEventListener('click', deleteGroup);
  els.shareBtn.addEventListener('click', shareSettlement);

  els.exportJson.addEventListener('click', exportJson);
  els.exportCsv.addEventListener('click', exportCsv);
  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', async () => {
    const file = els.importFile.files?.[0];
    if (file) await importJson(file);
    els.importFile.value = '';
  });
  els.printBtn.addEventListener('click', () => window.print());
  els.resetBtn.addEventListener('click', resetGroup);

  els.toastAction.addEventListener('click', undoLast);
  els.toastClose.addEventListener('click', hideToast);

  els.promptForm.addEventListener('submit', (event) => {
    if (event.submitter?.value !== 'ok') return;
    const value = els.promptInput.value.trim();
    const error = promptValidator ? promptValidator(value) : null;
    if (error) {
      event.preventDefault();
      setDialogError(els.promptError, error);
      els.promptInput.focus();
    }
  });

  els.personDeleteForm.addEventListener('submit', (event) => {
    if (event.submitter?.value !== 'ok') return;
    const mode = els.personDeleteForm.elements['pd-mode'].value;
    if (mode === 'reassign' && els.pdReassign.options.length > 0 && !els.pdReassign.value) {
      event.preventDefault();
      setDialogError(els.pdError, 'Elige a quién reasignar los pagos.');
    }
  });

  document.addEventListener('click', (event) => {
    const closeButton = event.target.closest('[data-close-dialog]');
    if (closeButton) closeButton.closest('dialog')?.close('cancel');
  });

  els.textCopy.addEventListener('click', async () => {
    const copied = await copyText(els.textOutput.value);
    if (copied) els.textDialog.close('ok');
  });

  window.addEventListener('online', updateConnectivity);
  window.addEventListener('offline', updateConnectivity);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installBtn.hidden = false;
  });

  els.installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installBtn.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    els.installBtn.hidden = true;
    showToast('App instalada. Ya puedes usarla sin conexión.');
  });
}

function initCurrencyOptions() {
  els.currency.innerHTML = '';
  for (const currency of CURRENCIES) {
    const option = document.createElement('option');
    option.value = currency.code;
    option.textContent = currency.label;
    els.currency.appendChild(option);
  }
}

/* ===== Init ===== */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Sin service worker la app sigue funcionando; solo se pierde el offline.
    });
  });
}

initCurrencyOptions();
wireEvents();
renderAll();
updateConnectivity();
registerServiceWorker();
