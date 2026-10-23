export const VERSION = 9;
export const STORAGE_KEY = 'monthly-salary-planner:v1';
export const LEGACY_STORAGE_KEY = 'monthly-salary-planner:v1';
export const uid = () => globalThis.crypto?.randomUUID?.() || `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const cents = value => Math.round(Number(value) * 100);
export const money = value => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
export const percent = basis => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(basis / 100);
export function makePlan() {
  return { income: 0, categories: [
    ['房租', 'required', 'fixed'], ['工作日餐饮', 'required', 'fixed'],
    ['交通', 'required', 'fixed'], ['周末预算', 'required', 'fixed'],
    ['储蓄', 'flexible', 'percent'], ['奖励自己', 'flexible', 'percent'], ['投资', 'flexible', 'percent']
  ].map(([name, kind, mode]) => ({ id: uid(), name, kind, mode, value: 0 })) };
}
export function calculate(plan) {
  const income = cents(plan.income);
  const fixed = plan.categories.filter(row => row.mode === 'fixed');
  const percentage = plan.categories.filter(row => row.mode === 'percent');
  const fixedTotal = fixed.reduce((sum, row) => sum + cents(row.value), 0);
  const requiredFixed = fixed.filter(row => row.kind === 'required').reduce((sum, row) => sum + cents(row.value), 0);
  const gap = Math.max(0, fixedTotal - income);
  const pool = Math.max(0, income - fixedTotal);
  const rateTotal = percentage.reduce((sum, row) => sum + cents(row.value), 0);
  const valid = rateTotal <= 10000;
  const amounts = Object.fromEntries(fixed.map(row => [row.id, cents(row.value)]));
  // Largest remainder apportionment keeps the displayed cents equal to the distributed total.
  const shares = percentage.map((row, index) => {
    const raw = pool * cents(row.value) / 10000;
    return { id: row.id, index, whole: Math.floor(raw), fraction: raw - Math.floor(raw) };
  });
  let residual = Math.round(pool * rateTotal / 10000) - shares.reduce((sum, share) => sum + share.whole, 0);
  [...shares].sort((a, b) => b.fraction - a.fraction || a.index - b.index).forEach(share => {
    if (residual > 0) { share.whole++; residual--; }
  });
  shares.forEach(share => { amounts[share.id] = share.whole; });
  const distributed = shares.reduce((sum, share) => sum + share.whole, 0);
  const groups = { required: 0, flexible: 0 };
  plan.categories.forEach(row => { groups[row.kind === 'savings' ? 'flexible' : row.kind] += amounts[row.id] || 0; });
  return { income, fixedTotal, requiredFixed, requiredFixedRatio: income > 0 ? requiredFixed / income * 100 : null,
    gap, pool, rateTotal, valid, amounts, distributed, remaining: valid ? Math.max(0, pool - distributed) : null, groups };
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validMonth(value) { return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
export function investmentPerformance(records) {
  let previous = null; const totalsByCurrency = {};
  const ordered = Object.entries(records).sort(([idA, a], [idB, b]) => {
    const dateA = a.date || `${a.legacyMonth || '0000-00'}-01`, dateB = b.date || `${b.legacyMonth || '0000-00'}-01`;
    return dateA.localeCompare(dateB) || (a.order || 0) - (b.order || 0) || idA.localeCompare(idB);
  });
  return ordered.map(([id, record]) => {
    const currency = record.currency || 'USD'; const complete = validDate(record.date) && record.before !== null;
    const after = record.before === null ? null : cents(record.before) + cents(record.amount);
    const gain = complete && previous?.complete && previous.currency === currency ? cents(record.before) - previous.after : null;
    const rate = gain !== null && previous.after > 0 ? gain / previous.after * 100 : null;
    const reason = !complete ? (!validDate(record.date) ? '待补到账日期' : '待补入金前账户总值') : !previous ? '首条记录，作为起点' : !previous.complete ? '上条记录资料未完整' : previous.currency !== currency ? '币种不同，无法比较区间收益' : previous.after === 0 ? '上次入金后总值为 0' : '';
    totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + cents(record.amount);
    const cumulativeByCurrency = { ...totalsByCurrency };
    const month = validDate(record.date) ? record.date.slice(0, 7) : record.legacyMonth || '';
    const result = { id, ...record, month, currency, complete, after, gain, rate, reason, start: previous?.date ?? null, cumulative: totalsByCurrency[currency], cumulativeByCurrency };
    previous = result; return result;
  });
}
export function validateBackup(data) {
  if (!data || ![1, 2, 3, 4, 5, 6, 7, 8, VERSION].includes(data.version) || !data.plans || typeof data.plans !== 'object' || Array.isArray(data.plans)) throw new Error('这不是本工具的有效备份文件。');
  const keys = Object.keys(data.plans);
  if (!keys.length || keys.length > 1200) throw new Error('备份应包含 1 至 1200 个月份。');
  const plans = {};
  for (const month of keys) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('备份中的月份格式不正确。');
    const source = data.plans[month];
    if (!source || !Number.isFinite(source.income) || source.income < 0 || source.income > 1e9 || !Array.isArray(source.categories) || source.categories.length > 200) throw new Error(`${month} 的收入或类别不正确。`);
    const ids = new Set();
    const categories = source.categories.map(row => {
      if (!row || typeof row.id !== 'string' || !row.id || row.id.length > 100 || ids.has(row.id) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 60 || !['required', 'flexible', 'savings'].includes(row.kind) || !['fixed', 'percent'].includes(row.mode) || !Number.isFinite(row.value) || row.value < 0 || row.value > (row.mode === 'percent' ? 100 : 1e9)) throw new Error(`${month} 有无效的预算项目。`);
      ids.add(row.id);
      return { id: row.id, name: row.name.trim(), kind: row.kind === 'savings' ? 'flexible' : row.kind, mode: row.mode, value: Math.round(row.value * 100) / 100 };
    });
    if (data.version === 1 && categories.length < 200 && !categories.some(row => ['投资', '股市投资'].includes(row.name))) {
      let id = uid(); while (ids.has(id)) id = uid();
      categories.push({ id, name: '投资', kind: 'flexible', mode: 'percent', value: 0 });
    }
    const plan = { income: Math.round(source.income * 100) / 100, categories };
    if (!calculate(plan).valid) throw new Error(`${month} 的百分比合计超过了 100%。`);
    plans[month] = plan;
  }
  const investmentRecords = { usstock: {} }, nextOrder = { usstock: 0 };
  const accountIds = ['usstock'];
  const sourceRecords = data.investmentRecords ?? {};
  if (!sourceRecords || typeof sourceRecords !== 'object' || Array.isArray(sourceRecords)) throw new Error('股市投入记录格式不正确。');
  const nestedRecords = Object.keys(sourceRecords).some(key => accountIds.includes(key));
  const normalizeInvestmentRecord = (recordKey, source, sourceAccount) => {
    const record = data.version < 4 ? { date: null, amount: source, before: null } : source;
    const currency = record?.currency ?? 'USD';
    const isCurrentSchema = data.version >= 8;
    const date = record?.date ?? null;
    const month = isCurrentSchema ? (validDate(date) ? date.slice(0, 7) : record?.legacyMonth) : recordKey;
    if (!recordKey || recordKey.length > 100 || !validMonth(month) || !record || typeof record !== 'object' || !['USD'].includes(currency) || !Number.isFinite(record.amount) || record.amount < 0 || record.amount > 1e9 || (record.before !== null && record.before !== undefined && (!Number.isFinite(record.before) || record.before < 0 || record.before > 1e9)) || (date !== null && (!validDate(date) || (!isCurrentSchema && date.slice(0, 7) !== recordKey)))) throw new Error('股市投入记录中有无效的到账日期、账户总值或金额。');
    const account = 'usstock';
    const id = isCurrentSchema ? (record.id || recordKey) : `legacy-${account}-${recordKey}`;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || (isCurrentSchema && id !== recordKey)) throw new Error('股市投入记录 ID 不正确。');
    const order = record.order === undefined ? nextOrder[account] : record.order;
    if (!Number.isSafeInteger(order) || order < 0 || order > 1e9) throw new Error('股市投入记录顺序不正确。');
    nextOrder[account] = Math.max(nextOrder[account] + 1, order + 1);
    const normalized = { id, date, amount: Math.round(record.amount * 100) / 100, before: record.before == null ? null : Math.round(record.before * 100) / 100, currency, account, order };
    if (date === null) normalized.legacyMonth = month;
    return normalized;
  };
  const insertRecord = (recordKey, source, sourceAccount) => {
    const record = normalizeInvestmentRecord(recordKey, source, sourceAccount);
    if (Object.hasOwn(investmentRecords[record.account], record.id)) throw new Error('投入记录 ID 重复，请检查备份文件。');
    investmentRecords[record.account][record.id] = record;
  };
  if (nestedRecords) {
    for (const [account, rows] of Object.entries(sourceRecords)) {
      if (!accountIds.includes(account) || !rows || typeof rows !== 'object' || Array.isArray(rows) || Object.keys(rows).length > (data.version >= 8 ? 10000 : 1200)) throw new Error('股市账户或记录格式不正确，每种币种最多支持 10000 条记录。');
      const entries = Object.entries(rows); if (data.version < 8) entries.sort(([a], [b]) => a.localeCompare(b));
      for (const [recordKey, source] of entries) insertRecord(recordKey, source, account);
    }
  } else {
    if (Object.keys(sourceRecords).length > 1200) throw new Error('旧版股市投入记录超过 1200 条。');
    const entries = Object.entries(sourceRecords); if (data.version < 8) entries.sort(([a], [b]) => a.localeCompare(b));
    for (const [recordKey, source] of entries) {
      const currency = data.version < 4 ? 'USD' : source?.currency ?? 'USD';
      const sourceAccount = ['usstock'].includes(source?.account) ? source.account : 'usstock';
      insertRecord(recordKey, source, sourceAccount);
    }
  }
  for (const account of accountIds) if (Object.keys(investmentRecords[account]).length > 10000) throw new Error('每种币种最多支持 10000 条记录。');
  const currentValuations = {};
  const valuationSource = data.currentValuations ?? {};
  if (!valuationSource || typeof valuationSource !== 'object' || Array.isArray(valuationSource)) throw new Error('当前总值记录格式不正确。');
  for (const [currency, source] of Object.entries(valuationSource)) {
    if (!['USD'].includes(currency) || !source || typeof source !== 'object' || !validDate(source.date) || !Number.isFinite(source.total) || source.total < 0 || source.total > 1e9) throw new Error('当前总值记录中有无效的币种、日期或金额。');
    currentValuations[currency] = { date: source.date, total: Math.round(source.total * 100) / 100 };
  }
  const opening = data.savingsOpeningBalance ?? 0;
  if (!Number.isFinite(opening) || opening < 0 || opening > 1e9) throw new Error('储蓄期初余额格式不正确。');
  const savingsSource = data.savingsEntries ?? [];
  if (!Array.isArray(savingsSource) || savingsSource.length > 10000) throw new Error('储蓄流水格式不正确，最多支持 10000 条。');
  const savingsIds = new Set();
  const savingsEntries = savingsSource.map(entry => {
    if (!entry || typeof entry.id !== 'string' || !entry.id || entry.id.length > 100 || savingsIds.has(entry.id) || !validDate(entry.date) || !['surplus_in', 'overspend_out', 'other_in', 'other_out'].includes(entry.type) || !Number.isFinite(entry.amount) || entry.amount <= 0 || entry.amount > 1e9 || (entry.note !== undefined && (typeof entry.note !== 'string' || entry.note.length > 120))) throw new Error('储蓄流水中有无效的日期、类型或金额。');
    savingsIds.add(entry.id);
    return { id: entry.id, date: entry.date, type: entry.type, amount: Math.round(entry.amount * 100) / 100, note: (entry.note || '').trim() };
  });
  return { version: VERSION, plans, investmentRecords, currentValuations, savingsOpeningBalance: Math.round(opening * 100) / 100, savingsEntries, activeMonth: keys.includes(data.activeMonth) ? data.activeMonth : keys.sort().at(-1), activeInvestmentCurrency: 'USD' };
}
export function nextMonth(month) {
  const [year, value] = month.split('-').map(Number);
  return `${value === 12 ? year + 1 : year}-${String(value === 12 ? 1 : value + 1).padStart(2, '0')}`;
}
