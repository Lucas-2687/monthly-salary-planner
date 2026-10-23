export function fixture() {
  // Synthetic values used exclusively by automated tests.
  return { version: 9, activeMonth: '2025-02', plans: {
    '2025-01': { income: 100, categories: [{ id: 'fixed', name: '测试定额', kind: 'required', mode: 'fixed', value: 20 }, { id: 'invest', name: '测试比例', kind: 'flexible', mode: 'percent', value: 50 }] },
    '2025-02': { income: 200, categories: [{ id: 'savings', name: '测试储蓄', kind: 'flexible', mode: 'percent', value: 25 }] },
  }, investmentRecords: { usstock: {
    one: { id: 'one', date: '2025-01-02', amount: 10, before: 100, currency: 'USD', account: 'usstock', order: 0 },
    two: { id: 'two', date: '2025-02-02', amount: 20, before: 121, currency: 'USD', account: 'usstock', order: 1 },
  } }, currentValuations: { USD: { date: '2025-02-10', total: 150 } }, savingsOpeningBalance: 50, savingsEntries: [
    { id: 's1', date: '2025-01-01', type: 'other_in', amount: 10, note: '虚构测试' },
    { id: 's2', date: '2025-02-01', type: 'other_out', amount: 5, note: '' },
  ], activeInvestmentCurrency: 'USD' };
}
