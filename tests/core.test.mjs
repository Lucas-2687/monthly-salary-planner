import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, investmentPerformance, validateBackup } from '../public/planner/core.js';
import { fixture } from './fixtures.mjs';
test('existing version 9 records, preferences, savings, and valuations survive round trip', () => {
  const original = fixture(); assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(original))), original);
});
test('budget deducts fixed amounts before percentage allocations', () => {
  const result = calculate(fixture().plans['2025-01']);
  assert.equal(result.pool, 8000); assert.equal(result.amounts.invest, 4000); assert.equal(result.remaining, 4000);
});
test('cent apportionment preserves the complete distributed amount', () => {
  const result = calculate({ income: 0.01, categories: ['a', 'b'].map(id => ({ id, mode: 'percent', kind: 'flexible', value: 50 })) });
  assert.equal(Object.values(result.amounts).reduce((a, b) => a + b, 0), 1);
});
test('investment return uses prior post-deposit valuation and stable same-day ordering', () => {
  const records = fixture().investmentRecords.usstock;
  records.two.date = records.one.date;
  const performance = investmentPerformance(records);
  assert.equal(performance[1].gain, 1100); assert.equal(performance[1].rate, 10);
});
test('legacy monthly records upgrade without dropping savings or budget settings', () => {
  const legacy = fixture(); legacy.version = 3; legacy.investmentRecords = { '2025-01': 10 };
  const migrated = validateBackup(legacy);
  assert.equal(migrated.version, 9); assert.equal(migrated.investmentRecords.usstock['legacy-usstock-2025-01'].amount, 10);
  assert.deepEqual(migrated.savingsEntries, legacy.savingsEntries);
});
test('invalid records and overallocated budgets cannot be persisted', () => {
  const data = fixture(); data.plans['2025-02'].categories[0].value = 101;
  assert.throws(() => validateBackup(data));
  const invalid = fixture(); invalid.investmentRecords.usstock.one.date = '2025-02-30';
  assert.throws(() => validateBackup(invalid));
});
