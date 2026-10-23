import { VERSION, STORAGE_KEY, LEGACY_STORAGE_KEY, uid, cents, money, percent, makePlan, calculate, validDate, validMonth, investmentPerformance, validateBackup, nextMonth } from './core.js';
import { initializeCloud, queueCloudSave, connectCloud } from './cloud.js';
const $ = selector => document.querySelector(selector);
const currentMonth = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = month => `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`;
const accountForCurrency = () => 'usstock';
const todayDate = () => { const date = new Date(); return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); };
const formatRate = value => (value > 0 ? '+' : '') + new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value) + '%';
let toastTimer, confirmCallback;
const makeBlank = () => { const month = currentMonth(); return { version: VERSION, activeMonth: month, plans: { [month]: makePlan() }, investmentRecords: { usstock: {} }, currentValuations: {}, activeInvestmentCurrency: 'USD', savingsOpeningBalance: 0, savingsEntries: [] }; };
const cloud = await initializeCloud(makeBlank);
let state = cloud.state;
const plan = () => state.plans[state.activeMonth];
function save() { queueCloudSave(state); }
function toast(message, undo) {
  clearTimeout(toastTimer); $('#toast-message').textContent = message; $('#toast').hidden = false;
  $('#toast-undo').hidden = !undo; $('#toast-undo').onclick = undo ? () => { undo(); $('#toast').hidden = true; } : null;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, undo ? 12000 : 5000);
}
function setText(id, value) { $(id).textContent = value; }
function textElement(tag, text, className) { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; }
function selectElement(options, selected, className, label) {
  const element = document.createElement('select'); element.className = className; element.setAttribute('aria-label', label);
  options.forEach(([value, name]) => { const option = textElement('option', name); option.value = value; element.append(option); }); element.value = selected; return element;
}
function render() {
  $('#month-select').replaceChildren(); Object.keys(state.plans).sort().reverse().forEach(month => { const option = textElement('option', monthLabel(month)); option.value = month; $('#month-select').append(option); });
  $('#month-select').value = state.activeMonth; $('#income').value = plan().income || ''; $('#income-error').hidden = true; $('#income').setCustomValidity(''); $('#category-rows').replaceChildren();
  [...plan().categories].sort((a, b) => Number(b.mode === 'fixed') - Number(a.mode === 'fixed')).forEach(row => { $('#category-rows').append(buildRow(row)); });
  if (!plan().categories.length) $('#category-rows').append(textElement('p', '还没有预算项目。添加一项，开始安排这个月的资金。', 'empty-rows'));
  renderTotals();
  $('#record-currency').value = state.activeInvestmentCurrency || 'USD';
  renderInvestmentRecords();
  renderSavings();
}
function buildRow(row) {
  const element = document.createElement('div'); element.className = 'budget-row'; element.dataset.id = row.id; element.dataset.kind = row.kind;
  const nameCell = document.createElement('div'); nameCell.className = 'name-cell';
  const name = document.createElement('input'); name.className = 'category-name'; name.type = 'text'; name.value = row.name; name.maxLength = 60; name.setAttribute('aria-label', `${row.name}的项目名称`); nameCell.append(name);
  name.addEventListener('change', () => { if (!name.value.trim()) { name.value = row.name; toast('项目名称不能为空。'); return; } row.name = name.value.trim(); name.value = row.name; save(); });
  const kind = selectElement([['required', '必须支出'], ['flexible', '可调整支出']], row.kind, 'kind-select', `${row.name}的用途`); kind.dataset.kind = row.kind;
  kind.addEventListener('change', () => { row.kind = kind.value; kind.dataset.kind = row.kind; element.dataset.kind = row.kind; changed(); });
  const mode = selectElement([['fixed', '定额'], ['percent', '百分比']], row.mode, 'mode-select', `${row.name}的分配方式`);
  const control = document.createElement('div'); control.className = 'value-control';
  const input = document.createElement('input'); input.type = 'number'; input.className = 'value-input'; input.min = '0'; input.max = row.mode === 'percent' ? '100' : '1000000000'; input.step = '0.01'; input.inputMode = 'decimal'; input.placeholder = '0'; input.value = row.value || ''; input.setAttribute('aria-label', `${row.name}的${row.mode === 'percent' ? '百分比' : '固定金额'}`);
  const unit = textElement('span', row.mode === 'percent' ? '%' : '元', 'value-unit'); control.append(input, unit);
  mode.addEventListener('change', () => { row.mode = mode.value; row.value = 0; input.value = ''; input.max = row.mode === 'percent' ? '100' : '1000000000'; input.setAttribute('aria-label', `${row.name}的${row.mode === 'percent' ? '百分比' : '固定金额'}`); unit.textContent = row.mode === 'percent' ? '%' : '元'; changed(); render(); const updated = [...document.querySelectorAll('.budget-row')].find(item => item.dataset.id === row.id); updated?.querySelector('.value-input')?.focus(); toast('分配方式已切换，请填写新的预算数值。'); });
  input.addEventListener('input', () => {
    const value = input.value === '' ? 0 : Number(input.value); const old = row.value;
    if (input.validity.badInput || !Number.isFinite(value) || value < 0 || value > Number(input.max)) { input.value = old || ''; toast(`请输入 0 至 ${input.max} 的数值。`); return; }
    row.value = Math.round(value * 100) / 100;
    if (row.mode === 'percent' && !calculate(plan()).valid) { row.value = old; input.value = old || ''; const other = calculate(plan()).rateTotal - cents(old); toast(`百分比合计不能超过 100%。此项最多可填 ${percent(10000 - other)}%。`); return; }
    changed();
  });
  input.addEventListener('blur', () => { input.value = row.value || ''; });
  const amount = textElement('span', '¥ 0.00', 'row-amount'); amount.dataset.amountId = row.id;
  const remove = textElement('button', '×', 'delete-row'); remove.type = 'button'; remove.setAttribute('aria-label', `删除${row.name}`);
  remove.addEventListener('click', () => {
    const targetMonth = state.activeMonth, index = plan().categories.indexOf(row); plan().categories.splice(index, 1); save(); render();
    toast(`已删除“${row.name}”`, () => { const target = state.plans[targetMonth]; if (!target || target.categories.some(item => item.id === row.id)) return; target.categories.splice(Math.min(index, target.categories.length), 0, row); if (!calculate(target).valid) { target.categories.splice(target.categories.indexOf(row), 1); toast('当前百分比设置与该项目冲突，无法撤销。'); return; } save(); render(); });
  });
  element.append(nameCell, kind, mode, control, amount, remove); return element;
}
function changed() { save(); renderTotals(); }
function renderTotals() {
  const result = calculate(plan());
  setText('#result-month', monthLabel(state.activeMonth)); setText('#result-income', `¥ ${money(result.income)}`); setText('#result-fixed', `− ¥ ${money(result.fixedTotal)}`); setText('#result-pool', `¥ ${money(result.pool)}`); setText('#result-percent', `− ¥ ${money(result.distributed)}`);
  setText('#investment-value', result.valid ? money(result.remaining) : '待调整');
  setText('#investment-rate', `剩余 ${percent(Math.max(0, 10000 - result.rateTotal))}%`); setText('#percentage-total', `${percent(result.rateTotal)}%`); $('#rate-fill').style.width = `${Math.min(100, result.rateTotal / 100)}%`;
  setText('#required-ratio', result.requiredFixedRatio === null ? '—' : `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(result.requiredFixedRatio)}%`); $('#required-fill').style.width = `${Math.min(100, result.requiredFixedRatio || 0)}%`;
  setText('#required-hint', `必须支出的定额合计 ¥ ${money(result.requiredFixed)}，占本月到手收入的比例。`);
  setText('#investment-hint', result.gap > 0 ? '定额预算超过收入，本月尚无待分配余额。' : result.income <= 0 ? '填写收入后，各项目的计划金额会自动计算。' : result.rateTotal === 10000 ? '百分比余额已全部分配。投资金额请查看投资项目。' : '此金额尚未安排到项目中，可调整投资等项目的比例。');
  const gapNotice = $('#gap-notice'); gapNotice.hidden = result.gap <= 0 && result.valid;
  gapNotice.replaceChildren(); if (result.gap > 0) { gapNotice.append(textElement('strong', `预算缺口 ¥ ${money(result.gap)}`), textElement('span', '定额预算已超过收入。请调整收入或定额预算；百分比项目的计划金额为 0。')); } else if (!result.valid) gapNotice.append(textElement('strong', '百分比合计超过 100%'), textElement('span', '请调整百分比预算后再查看分配结果。'));
  document.querySelectorAll('[data-amount-id]').forEach(element => { element.textContent = `¥ ${money(result.amounts[element.dataset.amountId] || 0)}`; });
  const entries = [['required', '必须支出', '#b9782a', result.groups.required], ['flexible', '可调整支出', '#437ab3', result.groups.flexible], ['remaining', '待分配余额', '#127f79', result.remaining || 0]];
  const total = entries.reduce((sum, entry) => sum + entry[3], 0); $('#allocation-bar').replaceChildren(); $('#allocation-legend').replaceChildren();
  entries.forEach(([, label, color, amount]) => {
    if (total > 0 && amount > 0) { const segment = document.createElement('div'); segment.className = 'allocation-segment'; segment.style.background = color; segment.style.width = `${amount / total * 100}%`; segment.title = `${label} ¥ ${money(amount)}`; $('#allocation-bar').append(segment); }
    const line = document.createElement('div'); line.className = 'legend-row'; const left = document.createElement('span'); left.className = 'legend-label'; const dot = document.createElement('i'); dot.style.background = color; left.append(dot, textElement('span', label)); line.append(left, textElement('strong', `¥ ${money(amount)}`)); $('#allocation-legend').append(line);
  });
}
function loadInvestmentRecord(recordId = null, sourceAccount = null) {
  const form = $('#investment-record-form');
  const oldAccount = sourceAccount || form.dataset.editAccount;
  const record = recordId ? state.investmentRecords[oldAccount]?.[recordId] : null;
  const currency = record?.currency || $('#record-currency').value || state.activeInvestmentCurrency || 'USD';
  form.dataset.editId = record?.id || ''; form.dataset.editAccount = record ? oldAccount : '';
  const currencySelect = $('#record-currency');
  currencySelect.querySelector('[data-legacy-currency]')?.remove();
  currencySelect.value = currency;
  $('#record-date').value = record ? record.date || '' : todayDate();
  $('#record-amount').value = record ? record.amount : '';
  $('#record-before').value = record ? record.before ?? '' : '';
  setText('#save-record', record ? '更新记录' : '保存记录');
  $('#cancel-record-edit').hidden = !record;
  setText('#record-note', record && (!record.date || record.before === null) ? '这条旧记录缺少到账日期或入金前账户总值，请补填后保存。' : record ? '更新后会重算此记录及后续区间。' : '同一天可添加多笔，按到账日期和录入顺序计算收益。两次记录之间应无其他资金进出。');
  $('#record-error').hidden = true;
  updateAfterPreview();
}
function nextInvestmentOrder(records) {
  return Object.values(records).reduce((maximum, record) => Math.max(maximum, Number.isSafeInteger(record.order) ? record.order : -1), -1) + 1;
}
function updateAfterPreview() {
  const before = $('#record-before'), amount = $('#record-amount');
  const valid = before.value !== '' && amount.value !== '' && before.validity.valid && amount.validity.valid;
  setText('#record-after-preview', valid ? ($('#record-currency').value || 'USD') + ' ' + money(cents(before.value) + cents(amount.value)) : '—');
}
function currencySummary(currency, performances) {
  const account = accountForCurrency(currency);
  const valuation = state.currentValuations[currency];
  const items = (performances[account] || []).filter(item => item.currency === currency && item.date);
  const intervals = items.filter(item => item.rate !== null);
  const factor = intervals.reduce((product, item) => product * (1 + item.rate / 100), 1);
  const lastItem = items.at(-1);
  const latestComplete = lastItem?.complete && lastItem.after !== null ? lastItem : null;
  const staleValuation = !!(valuation && lastItem && valuation.date < lastItem.date);
  const currentRate = valuation && !staleValuation && latestComplete && latestComplete.after > 0 ? (cents(valuation.total) - latestComplete.after) / latestComplete.after * 100 : null;
  const hasReturn = intervals.length > 0 || currentRate !== null;
  const totalRate = (factor * (currentRate === null ? 1 : 1 + currentRate / 100) - 1) * 100;
  return { currency, valuation, items, intervals, factor, latestComplete, currentRate, staleValuation, hasReturn, totalRate };
}
function renderCurrentValuations(performances, summaries) {
  for (const currency of ['USD']) {
    const suffix = 'usd';
    const valuation = state.currentValuations[currency];
    $('#valuation-date-' + suffix).value = valuation?.date || todayDate();
    $('#valuation-total-' + suffix).value = valuation ? valuation.total : '';
    const result = $('#valuation-result-' + suffix); result.replaceChildren();
    if (!valuation) { result.append(textElement('span', '输入并保存当前总值后，将显示当前区间和累计复利收益。')); continue; }
    const summary = summaries[currency];
    result.append(textElement('span', '估值总值：' + currency + ' ' + money(cents(valuation.total)) + ' · ' + valuation.date));
    if (summary.staleValuation) {
      result.append(textElement('span', '此估值早于最新入金（' + summary.items.at(-1).date + '），未计入累计收益。请保存新的账户总值。'));
      result.append(textElement('strong', '截至最新入金的区间复利收益：' + (summary.hasReturn ? formatRate(summary.totalRate) : '缺少可比区间')));
      continue;
    }
    result.append(textElement('span', '距最近一次入金后：' + (summary.currentRate === null ? '缺少可比的入金后基准' : formatRate(summary.currentRate))));
    result.append(textElement('strong', '截至估值日累计复合收益：' + (summary.hasReturn ? formatRate(summary.totalRate) : '缺少可比区间')));
  }
}
function renderAnnualSummary(performances, summaries) {
  const annual = new Map();
  const getYear = (year, currency) => {
    const key = year + ':' + currency;
    if (!annual.has(key)) annual.set(key, { year, currency, factor: 1, count: 0, crossYear: false, includesValuation: false });
    return annual.get(key);
  };
  for (const currency of ['USD']) {
    const account = accountForCurrency(currency);
    const valuation = state.currentValuations[currency];
    const items = (performances[account] || []).filter(item => item.currency === currency && item.date);
    for (const item of items) {
      if (item.rate === null) continue;
      const year = item.date.slice(0, 4); const row = getYear(year, currency);
      row.factor *= 1 + item.rate / 100; row.count++;
      if (item.start && item.start.slice(0, 4) !== year) row.crossYear = true;
    }
    if (valuation && summaries[currency].currentRate !== null) {
      const row = getYear(valuation.date.slice(0, 4), currency);
      row.factor *= 1 + summaries[currency].currentRate / 100; row.count++; row.includesValuation = true;
      if (summaries[currency].latestComplete && summaries[currency].latestComplete.date.slice(0, 4) !== valuation.date.slice(0, 4)) row.crossYear = true;
    }
  }
  const rows = [...annual.values()].sort((a, b) => b.year.localeCompare(a.year) || a.currency.localeCompare(b.currency));
  $('#annual-investment-rows').replaceChildren(...rows.map(item => {
    const row = document.createElement('tr');
    const note = [item.crossYear ? '含跨年区间，归入结束年份' : '', item.includesValuation ? '含手动估值区间' : ''].filter(Boolean).join('；') || '完整区间复利';
    row.append(textElement('td', item.year), textElement('td', item.currency), textElement('td', String(item.count)), textElement('td', formatRate((item.factor - 1) * 100)), textElement('td', note));
    const rateCell = row.children[3]; rateCell.className = item.factor >= 1 ? 'return-positive' : 'return-negative';
    return row;
  }));
  $('#annual-summary').hidden = rows.length === 0;
}
function renderInvestmentRecords(reloadForm = true) {
  if (reloadForm) loadInvestmentRecord();
  const accounts = ['usstock'];
  const performances = Object.fromEntries(accounts.map(account => [account, investmentPerformance(state.investmentRecords[account] || {})]));
  const summaries = { USD: currencySummary('USD', performances) };
  const allCount = accounts.reduce((sum, account) => sum + performances[account].length, 0);
  $('#actual-investment-total').replaceChildren(...['USD'].map(currency => {
    const summary = summaries[currency];
    return textElement('span', currency + '：' + (summary.hasReturn ? formatRate(summary.totalRate) : '待形成可比区间'), 'currency-total');
  }));
  setText('#record-count', allCount ? '已记录 ' + allCount + ' 条' : '尚无记录');
  $('#investment-record-rows').replaceChildren(); $('#monthly-investment-rows').replaceChildren(); $('#records-empty').hidden = allCount > 0;
  $('#performance-table-wrap').hidden = !allCount; $('#monthly-summary').hidden = !allCount;
  const monthly = new Map();
  accounts.forEach(account => performances[account].forEach(item => {
    const monthKey = item.month || 'unknown', currency = item.currency || 'USD', monthlyKey = monthKey + ':' + currency;
    const summary = monthly.get(monthlyKey) || { month: monthKey, currency, amount: 0, cumulative: 0 };
    summary.amount += cents(item.amount); summary.cumulative = item.cumulative; monthly.set(monthlyKey, summary);
  }));
  accounts.forEach(account => [...performances[account]].sort((a, b) => {
    const dateA = a.date || `${a.legacyMonth || '0000-00'}-01`, dateB = b.date || `${b.legacyMonth || '0000-00'}-01`;
    return dateB.localeCompare(dateA) || (a.order || 0) - (b.order || 0);
  }).forEach(item => {
    const key = item.month; const currency = item.currency || 'USD';
    const row = document.createElement('tr');
    const dateLabel = item.date || (validMonth(item.month) ? monthLabel(item.month) + ' · 日期待补' : '日期待补');
    row.append(textElement('td', dateLabel), textElement('td', currency), textElement('td', currency + ' ' + money(cents(item.amount))), textElement('td', item.before === null ? '待补填' : currency + ' ' + money(cents(item.before))), textElement('td', item.after === null ? '—' : currency + ' ' + money(item.after)));
    const gain = textElement('td', item.gain === null ? '无法计算' : (item.gain > 0 ? '+' : item.gain < 0 ? '−' : '') + currency + ' ' + money(Math.abs(item.gain)));
    gain.append(textElement('small', item.gain === null ? item.reason : item.start + ' → ' + item.date, 'interval-label'));
    const rate = textElement('td', item.rate === null ? '无法计算' : formatRate(item.rate));
    if (item.rate === null && item.gain !== null) rate.append(textElement('small', item.reason, 'interval-label'));
    if (item.gain !== null) gain.className = item.gain >= 0 ? 'return-positive' : 'return-negative';
    if (item.rate !== null) rate.className = item.rate >= 0 ? 'return-positive' : 'return-negative';
    row.append(gain, rate);
    const actions = document.createElement('td');
    const edit = textElement('button', '编辑', 'record-action'); edit.type = 'button'; edit.setAttribute('aria-label', '编辑 ' + currency + ' ' + dateLabel + ' 的投入记录');
    edit.addEventListener('click', () => { state.activeInvestmentCurrency = 'USD'; loadInvestmentRecord(item.id, account); save(); $('#record-amount').focus(); });
    const remove = textElement('button', '删除', 'record-action danger-text'); remove.type = 'button'; remove.setAttribute('aria-label', '删除 ' + currency + ' ' + dateLabel + ' 的投入记录');
    remove.addEventListener('click', () => { confirmAction('删除这条投入记录？', '将删除 ' + currency + ' ' + dateLabel + ' 的记录，后续区间收益会重算。', () => { delete state.investmentRecords[account][item.id]; save(); renderInvestmentRecords(); toast('区间收益已重算。'); }, '删除记录'); });
    actions.append(edit, remove); row.append(actions); $('#investment-record-rows').append(row);
  }));
  [...monthly.values()].sort((a, b) => b.month.localeCompare(a.month) || a.currency.localeCompare(b.currency)).forEach(item => {
    const summary = document.createElement('tr');
    summary.append(textElement('td', validMonth(item.month) ? monthLabel(item.month) : '日期待补'), textElement('td', item.currency), textElement('td', item.currency + ' ' + money(item.amount)), textElement('td', item.currency + ' ' + money(item.cumulative)));
    $('#monthly-investment-rows').append(summary);
  });
  renderCurrentValuations(performances, summaries);
  renderAnnualSummary(performances, summaries);
}
const savingsTypes = { surplus_in: '月度结余存入', overspend_out: '超支取出', other_in: '其他存入', other_out: '其他取出' };
const isSavingsDeposit = type => type.endsWith('_in');
function savingsBalanceThrough(date = '9999-12-31') {
  return Math.round((state.savingsOpeningBalance || 0) * 100) + state.savingsEntries.filter(entry => entry.date <= date).reduce((total, entry) => total + (isSavingsDeposit(entry.type) ? 1 : -1) * cents(entry.amount), 0);
}
function resetSavingsForm() {
  $('#savings-entry-form').reset(); $('#savings-date').value = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  $('#savings-entry-form').dataset.editId = ''; setText('#savings-save', '记一笔'); $('#savings-cancel').hidden = true; $('#savings-error').hidden = true;
}
function renderSavings() {
  const opening = Math.round((state.savingsOpeningBalance || 0) * 100);
  const deposits = state.savingsEntries.filter(entry => isSavingsDeposit(entry.type)).reduce((total, entry) => total + cents(entry.amount), 0);
  const withdrawals = state.savingsEntries.filter(entry => !isSavingsDeposit(entry.type)).reduce((total, entry) => total + cents(entry.amount), 0);
  setText('#savings-opening-total', `¥ ${money(opening)}`); setText('#savings-current', `¥ ${money(opening + deposits - withdrawals)}`);
  $('#savings-current').classList.toggle('return-negative', opening + deposits - withdrawals < 0);
  if (document.activeElement !== $('#savings-opening')) $('#savings-opening').value = state.savingsOpeningBalance || '';
  setText('#savings-deposits', `¥ ${money(deposits)}`); setText('#savings-withdrawals', `¥ ${money(withdrawals)}`);
  const month = state.activeMonth, monthEntries = state.savingsEntries.filter(entry => entry.date.slice(0, 7) === month);
  const monthIn = monthEntries.filter(entry => isSavingsDeposit(entry.type)).reduce((total, entry) => total + cents(entry.amount), 0);
  const monthOut = monthEntries.filter(entry => !isSavingsDeposit(entry.type)).reduce((total, entry) => total + cents(entry.amount), 0);
  setText('#savings-month-label', monthLabel(month)); setText('#savings-month-in', `¥ ${money(monthIn)}`); setText('#savings-month-out', `¥ ${money(monthOut)}`);
  setText('#savings-month-end', `¥ ${money(savingsBalanceThrough(`${month}-31`))}`);
  const rows = $('#savings-rows'); rows.replaceChildren(); $('#savings-empty').hidden = state.savingsEntries.length > 0;
  const sorted = [...state.savingsEntries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let running = opening;
  sorted.forEach(entry => {
    const row = document.createElement('tr'); const deposit = isSavingsDeposit(entry.type);
    running += (deposit ? 1 : -1) * cents(entry.amount);
    row.append(textElement('td', entry.date), textElement('td', savingsTypes[entry.type]), textElement('td', entry.note || '—'));
    const inCell = textElement('td', deposit ? `¥ ${money(cents(entry.amount))}` : '—'); if (deposit) inCell.className = 'deposit';
    const outCell = textElement('td', deposit ? '—' : `¥ ${money(cents(entry.amount))}`); if (!deposit) outCell.className = 'withdrawal';
    row.append(inCell, outCell, textElement('td', `¥ ${money(running)}`));
    const actions = document.createElement('td');
    const edit = textElement('button', '编辑', 'record-action'); edit.type = 'button'; edit.addEventListener('click', () => { $('#savings-entry-form').dataset.editId = entry.id; $('#savings-date').value = entry.date; $('#savings-type').value = entry.type; $('#savings-amount').value = entry.amount; $('#savings-note').value = entry.note; setText('#savings-save', '更新流水'); $('#savings-cancel').hidden = false; $('#savings-amount').focus(); });
    const remove = textElement('button', '删除', 'record-action danger-text'); remove.type = 'button'; remove.addEventListener('click', () => confirmAction('删除这条储蓄流水？', `${entry.date} 的${savingsTypes[entry.type]} ¥ ${money(cents(entry.amount))} 将被删除，累计余额会重算。`, () => { state.savingsEntries = state.savingsEntries.filter(item => item.id !== entry.id); save(); renderSavings(); toast('储蓄流水已删除。'); }, '删除流水'));
    actions.append(edit, remove); row.append(actions); rows.append(row);
  });
}
$('#savings-opening-form').addEventListener('submit', event => {
  event.preventDefault(); const input = $('#savings-opening'), amount = Number(input.value);
  if (input.value === '' || !input.validity.valid || !Number.isFinite(amount) || amount < 0 || amount > 1e9) { input.reportValidity(); return; }
  state.savingsOpeningBalance = Math.round(amount * 100) / 100; save(); renderSavings(); toast('储蓄期初余额已保存。');
});
$('#savings-cancel').addEventListener('click', resetSavingsForm);
$('#savings-entry-form').addEventListener('submit', event => {
  event.preventDefault(); const date = $('#savings-date').value, type = $('#savings-type').value, input = $('#savings-amount'), amount = Number(input.value), note = $('#savings-note').value.trim(), editId = $('#savings-entry-form').dataset.editId;
  let error = '';
  if (!validDate(date)) error = '请选择有效的储蓄流水日期。';
  else if (!Object.hasOwn(savingsTypes, type)) error = '请选择有效的流水类型。';
  else if (input.value === '' || !input.validity.valid || !Number.isFinite(amount) || amount <= 0 || amount > 1e9) error = '请输入大于 0 且不超过 1,000,000,000 元的金额。';
  else if (note.length > 120) error = '备注不能超过 120 个字符。';
  else if (!editId && state.savingsEntries.length >= 10000) error = '储蓄流水最多保存 10000 条，请先导出备份。';
  $('#savings-error').hidden = !error; $('#savings-error').textContent = error; if (error) return;
  const old = state.savingsEntries.find(entry => entry.id === editId); const entry = { id: old?.id || uid(), date, type, amount: Math.round(amount * 100) / 100, note };
  if (old) state.savingsEntries = state.savingsEntries.map(item => item.id === editId ? entry : item); else state.savingsEntries.push(entry);
  save(); resetSavingsForm(); renderSavings(); toast(old ? '储蓄流水已更新。' : '储蓄流水已记录。');
});
$('#record-currency').addEventListener('change', () => {
  state.activeInvestmentCurrency = 'USD'; save();
  if (!$('#investment-record-form').dataset.editId) $('#record-currency').querySelector('[data-legacy-currency]')?.remove();
  updateAfterPreview();
});
$('#record-before').addEventListener('input', updateAfterPreview);
$('#record-amount').addEventListener('input', updateAfterPreview);
$('#cancel-record-edit').addEventListener('click', () => { loadInvestmentRecord(); $('#record-date').focus(); });
$('#investment-record-form').addEventListener('submit', event => {
  event.preventDefault(); const form = $('#investment-record-form'), editId = form.dataset.editId, oldAccount = form.dataset.editAccount, oldRecord = editId ? state.investmentRecords[oldAccount]?.[editId] : null;
  const date = $('#record-date').value, currency = $('#record-currency').value, account = accountForCurrency(currency), input = $('#record-amount'), amount = Number(input.value), beforeInput = $('#record-before'), before = Number(beforeInput.value);
  const accountRecords = state.investmentRecords[account];
  let error = '';
  if (editId && !oldRecord) error = '找不到正在编辑的记录，请重新选择。';
  else if (!validDate(date)) error = '请选择有效的到账日期。';
  else if (!['USD'].includes(currency)) error = '请选择有效的入金币种。';
  else if (input.value === '' || input.validity.badInput || !Number.isFinite(amount) || amount < 0 || amount > 1e9) error = '请输入 0 至 1,000,000,000 之间的实际投入金额。';
  else if (beforeInput.value === '' || beforeInput.validity.badInput || !Number.isFinite(before) || before < 0 || before > 1e9) error = '请输入 0 至 1,000,000,000 之间的入金前账户总值。';
  else if ((!oldRecord || oldAccount !== account) && Object.keys(accountRecords).length >= 10000) error = '该币种最多保存 10000 条记录，请先导出备份。';
  else if (oldRecord && oldAccount !== account && Object.hasOwn(accountRecords, editId)) error = '目标币种中已有相同记录 ID，请重新导入或整理备份。';
  $('#record-error').hidden = !error; $('#record-error').textContent = error; if (error) return;
  state.activeInvestmentCurrency = 'USD';
  const id = oldRecord?.id || uid(); const order = oldRecord && oldAccount === account ? oldRecord.order : nextInvestmentOrder(accountRecords);
  if (oldRecord && oldAccount !== account) delete state.investmentRecords[oldAccount][editId];
  state.investmentRecords[account][id] = { id, date, amount: Math.round(amount * 100) / 100, before: Math.round(before * 100) / 100, currency, account, order };
  save(); renderInvestmentRecords(); toast(oldRecord ? '记录已更新，后续区间收益已重算。' : '记录已保存，区间复利和年度收益已重算。');
});
for (const currency of ['USD']) {
  const suffix = 'usd';
  $('#valuation-' + suffix + '-form').addEventListener('submit', event => {
    event.preventDefault(); const dateInput = $('#valuation-date-' + suffix), totalInput = $('#valuation-total-' + suffix), date = dateInput.value, total = Number(totalInput.value);
    let error = '';
    if (!validDate(date)) error = '请选择有效的估值日期。';
    else if (totalInput.value === '' || totalInput.validity.badInput || !Number.isFinite(total) || total < 0 || total > 1e9) error = '请输入 0 至 1,000,000,000 之间的当前总值。';
    $('#valuation-error-' + suffix).hidden = !error; $('#valuation-error-' + suffix).textContent = error; if (error) return;
    state.currentValuations[currency] = { date, total: Math.round(total * 100) / 100 };
    save(); renderInvestmentRecords(false); toast(currency + ' 当前总值已保存，收益已重算。');
  });
}
$('#income').addEventListener('input', () => {
  const input = $('#income'), value = input.value === '' ? 0 : Number(input.value);
  const error = input.validity.badInput || !Number.isFinite(value) || value < 0 || value > 1e9;
  $('#income-error').hidden = !error; $('#income-error').textContent = error ? '请输入 0 至 1,000,000,000 元之间的收入。' : ''; input.setCustomValidity(error ? '收入金额不正确' : '');
  if (!error) { plan().income = Math.round(value * 100) / 100; changed(); }
});
$('#income').addEventListener('blur', () => { $('#income').value = plan().income || ''; $('#income-error').hidden = true; $('#income').setCustomValidity(''); });
$('#month-select').addEventListener('change', () => { state.activeMonth = $('#month-select').value; save(); render(); });
$('#add-category').addEventListener('click', () => { if (plan().categories.length >= 200) { toast('一个月最多支持 200 个预算项目。'); return; } const row = { id: uid(), name: '新项目', kind: 'flexible', mode: 'fixed', value: 0 }; plan().categories.push(row); save(); render(); const input = [...document.querySelectorAll('.budget-row')].find(element => element.dataset.id === row.id).querySelector('.category-name'); input.focus(); input.select(); });
$('#new-month').addEventListener('click', () => { $('#new-month-value').value = nextMonth(state.activeMonth); $('#copy-previous').checked = true; $('#month-error').hidden = true; $('#month-dialog').showModal(); });
$('#month-form').addEventListener('submit', event => {
  event.preventDefault(); const month = $('#new-month-value').value;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { $('#month-error').textContent = '请选择有效的计划月份。'; $('#month-error').hidden = false; return; }
  if (state.plans[month]) { $('#month-error').textContent = '这个月份已有计划，请从顶部月份列表打开。'; $('#month-error').hidden = false; return; }
  if (Object.keys(state.plans).length >= 1200) { $('#month-error').textContent = '最多保存 1200 个月份，请先导出并整理历史计划。'; $('#month-error').hidden = false; return; }
  const sourceMonth = Object.keys(state.plans).filter(key => key < month).sort().at(-1);
  state.plans[month] = $('#copy-previous').checked && sourceMonth ? structuredClone(state.plans[sourceMonth]) : makePlan(); state.plans[month].income = 0; state.activeMonth = month; save(); render(); $('#month-dialog').close(); toast(sourceMonth && $('#copy-previous').checked ? `已沿用 ${monthLabel(sourceMonth)} 的预算，请填写本月收入。` : '已创建月度计划，请填写收入和预算。');
});
document.querySelectorAll('.close-dialog').forEach(button => { button.addEventListener('click', () => button.closest('dialog').close()); });
function confirmAction(title, body, callback, label = '确认') { confirmCallback = callback; setText('#confirm-title', title); setText('#confirm-body', body); setText('#confirm-action', label); $('#confirm-dialog').showModal(); }
$('#confirm-action').addEventListener('click', () => { const action = confirmCallback; confirmCallback = null; $('#confirm-dialog').close(); action?.(); });
$('#confirm-dialog').addEventListener('close', () => { confirmCallback = null; });
function closeMenu() { $('.more-menu').open = false; }
document.addEventListener('click', event => { if (!$('.more-menu').contains(event.target)) closeMenu(); });
$('#delete-month').addEventListener('click', () => { closeMenu(); const month = state.activeMonth; confirmAction('删除这份月度计划？', `${monthLabel(month)} 的收入和预算将从此浏览器中删除。建议先导出备份。`, () => { delete state.plans[month]; const remaining = Object.keys(state.plans).sort(); if (!remaining.length) { state.plans[month] = makePlan(); state.activeMonth = month; } else state.activeMonth = remaining.at(-1); save(); render(); toast('月度计划已删除。'); }, '删除计划'); });
$('#export').addEventListener('click', () => { closeMenu(); const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `月薪分配备份-${currentMonth()}.json`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('计划备份已导出。'); });
$('#import').addEventListener('click', () => { closeMenu(); $('#import-file').click(); });
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  if (file.size > 3 * 1024 * 1024) { toast('备份文件不能超过 3 MB。'); return; }
  try {
    const raw = JSON.parse(await file.text()); const imported = validateBackup(raw); const count = Object.keys(imported.plans).length; const overlap = Object.keys(imported.plans).filter(month => state.plans[month]).length;
    if (Object.keys({ ...state.plans, ...imported.plans }).length > 1200) throw new Error('合并后的月份超过 1200 个，请先整理历史计划。');
    const accountKeys = ['usstock']; const recordCount = accountKeys.reduce((sum, account) => sum + Object.keys(imported.investmentRecords[account] || {}).length, 0);
    const recordOverlap = accountKeys.reduce((sum, account) => sum + Object.keys(imported.investmentRecords[account] || {}).filter(id => Object.hasOwn(state.investmentRecords[account], id)).length, 0);
    if (accountKeys.some(account => Object.keys({ ...state.investmentRecords[account], ...imported.investmentRecords[account] }).length > 10000)) throw new Error('每种币种合并后最多保存 10000 条投入记录，请先整理记录。');
    const hasSavings = Array.isArray(raw.savingsEntries); const importedSavings = hasSavings ? imported.savingsEntries : [];
    if (state.savingsEntries.length + importedSavings.filter(item => !state.savingsEntries.some(existing => existing.id === item.id)).length > 10000) throw new Error('合并后的储蓄流水超过 10000 条，请先整理记录。');
    const savingsOverlap = importedSavings.filter(item => state.savingsEntries.some(existing => existing.id === item.id)).length;
    confirmAction('导入计划、投入与储蓄记录？', `包含 ${count} 个月份计划、${recordCount} 条投入记录${hasSavings ? `、${importedSavings.length} 条储蓄流水` : ''}。${overlap ? `其中 ${overlap} 个同名计划将被覆盖。` : ''}${recordOverlap ? `${recordOverlap} 条同 ID 投入记录将更新。` : ''}${savingsOverlap ? `${savingsOverlap} 条同 ID 储蓄流水将更新。` : ''}${hasSavings ? '备份中的储蓄期初余额将替换当前设置。' : ''}\n其他已有记录将保留。`, () => { state.plans = { ...state.plans, ...imported.plans }; state.investmentRecords = { usstock: { ...state.investmentRecords.usstock, ...imported.investmentRecords.usstock } }; state.activeInvestmentCurrency = 'USD'; state.currentValuations = { ...state.currentValuations, ...imported.currentValuations }; if (hasSavings) { state.savingsEntries = [...state.savingsEntries.filter(item => !importedSavings.some(entry => entry.id === item.id)), ...importedSavings]; state.savingsOpeningBalance = imported.savingsOpeningBalance; } state.activeMonth = imported.activeMonth; save(); render(); toast(`已导入 ${count} 份计划、${recordCount} 条投入记录${hasSavings ? `及 ${importedSavings.length} 条储蓄流水` : ''}。`); }, '导入备份');
  } catch (error) { toast(error instanceof SyntaxError ? '文件不是有效的 JSON 备份，请重新选择。' : error.message); }
});
$('#restore-backup').addEventListener('click', () => $('#restore-file').click());
$('#restore-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  if (file.size > 3 * 1024 * 1024) { toast('备份文件不能超过 3 MB。'); return; }
  try {
    const imported = validateBackup(JSON.parse(await file.text()));
    if (new TextEncoder().encode(JSON.stringify({ state: imported, revision: 0, userId: 'owner' })).length > 3 * 1024 * 1024) throw new Error('恢复后的记录超过 3 MB，请先整理备份。');
    const months = Object.keys(imported.plans).length, investments = Object.keys(imported.investmentRecords.usstock).length;
    confirmAction('完整恢复这份备份？', `将使用备份中的 ${months} 个月份、${investments} 条投入及 ${imported.savingsEntries.length} 条储蓄流水，替换当前全部记录和预算设置。当前版本会先导出为副本；云端若有其他设备更新，仍会提示同步冲突。`, () => {
      $('#export').click();
      state = imported; save(); render(); toast('已恢复备份，正在保存到云端。保存完成后请再次导出核对。');
    }, '导出当前副本并恢复');
  } catch (error) { toast(error instanceof SyntaxError ? '文件不是有效的 JSON 备份。' : error.message); }
});
connectCloud(remote => { state = remote || makeBlank(); render(); toast('已同步其他设备的记录。'); }, () => !document.querySelector('dialog[open]') && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) && !document.hidden);
render();
if (cloud.needsSave) save();
