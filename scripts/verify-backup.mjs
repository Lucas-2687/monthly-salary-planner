import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateBackup, calculate, investmentPerformance, cents } from '../public/planner/core.js';
const [source, target] = process.argv.slice(2);
if (!source) throw new Error('Usage: npm run backup:verify -- path/to/backup.json [path/to/new-export.json]');
function summarize(raw) {
  const data = validateBackup(JSON.parse(raw));
  // Compare actual records and settings independently of export time and active UI month.
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
    return value;
  }
  const { activeMonth, ...records } = data;
  const performance = investmentPerformance(data.investmentRecords.usstock);
  let savings = cents(data.savingsOpeningBalance);
  for (const e of data.savingsEntries) savings += (e.type.endsWith('_in') ? 1 : -1) * cents(e.amount);
  return { months: Object.keys(data.plans).length, investments: performance.length, savingsEntries: data.savingsEntries.length,
    incomeCents: Object.values(data.plans).reduce((n, p) => n + calculate(p).income, 0),
    depositsCents: performance.reduce((n, p) => n + cents(p.amount), 0), savingsCents: savings,
    fingerprint: createHash('sha256').update(JSON.stringify(stable(records))).digest('hex') };
}
const first = summarize(await readFile(source, 'utf8'));
if (target) {
  const second = summarize(await readFile(target, 'utf8'));
  if (JSON.stringify(first) !== JSON.stringify(second)) { console.error('备份不一致。请保留旧站和原始备份，不要切换。'); process.exitCode = 1; }
  else console.log('两份备份的预算、投入、储蓄、设置及核对汇总一致。');
} else console.log(`备份格式有效：${first.months} 个月份、${first.investments} 条投入、${first.savingsEntries} 条储蓄流水。`);
