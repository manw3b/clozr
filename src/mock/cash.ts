import type { CashMovement, CashSummary } from '../types/domain';

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

const USD_RATE = 1080;

const movements: CashMovement[] = [
  /* INGRESOS */
  {
    id: 'm001',
    kind: 'income',
    amount: 1_290_000,
    currency: 'ARS',
    description: 'Venta V-0042 — iPhone 15 128GB',
    category: 'sale-payment',
    createdAt: hoursAgo(6),
    saleId: 's001',
    saleNumber: 'V-0042',
    clientName: 'Juan Pérez',
    paymentMethod: 'transferencia',
    by: 'Pyter',
  },
  {
    id: 'm002',
    kind: 'income',
    amount: 425_000,
    currency: 'ARS',
    description: 'Seña V-0041 — iPhone 14 (50%)',
    category: 'sale-payment',
    createdAt: hoursAgo(4),
    saleId: 's002',
    saleNumber: 'V-0041',
    clientName: 'Sofía Castro',
    paymentMethod: 'efectivo',
    by: 'Pyter',
  },
  {
    id: 'm003',
    kind: 'income',
    amount: 180_000,
    currency: 'ARS',
    description: 'Venta V-0040 — AirPods Pro 2',
    category: 'sale-payment',
    createdAt: hoursAgo(1.5),
    saleId: 's003',
    saleNumber: 'V-0040',
    clientName: 'Martín Sosa',
    paymentMethod: 'mercadopago',
    by: 'Pyter',
  },
  {
    id: 'm004',
    kind: 'income',
    amount: 1_650,
    currency: 'USD',
    description: 'Pago USDT — Carlos Méndez (cuota 2/3)',
    category: 'transfer-in',
    createdAt: hoursAgo(8),
    clientName: 'Carlos Méndez',
    paymentMethod: 'usdt',
    by: 'Pyter',
  },
  {
    id: 'm005',
    kind: 'income',
    amount: 6_250_000,
    currency: 'ARS',
    description: 'Pago parcial V-0037 — Distribuidora Norte',
    category: 'sale-payment',
    createdAt: hoursAgo(10),
    saleId: 's006',
    saleNumber: 'V-0037',
    clientName: 'Distribuidora Norte SA',
    paymentMethod: 'transferencia',
    by: 'Pyter',
  },

  /* EGRESOS */
  {
    id: 'm006',
    kind: 'expense',
    amount: 4_500_000,
    currency: 'ARS',
    description: 'Pago a proveedor — Lote 5x iPhone 14',
    category: 'supplier',
    createdAt: hoursAgo(11),
    paymentMethod: 'transferencia',
    by: 'Pyter',
  },
  {
    id: 'm007',
    kind: 'expense',
    amount: 800,
    currency: 'USD',
    description: 'Compra USDT — Binance',
    category: 'supplier',
    createdAt: hoursAgo(9),
    by: 'Pyter',
  },
  {
    id: 'm008',
    kind: 'expense',
    amount: 25_000,
    currency: 'ARS',
    description: 'Cadetería — entregas zona oeste',
    category: 'transport',
    createdAt: hoursAgo(7),
    paymentMethod: 'efectivo',
    by: 'Pyter',
  },
  {
    id: 'm009',
    kind: 'expense',
    amount: 18_500,
    currency: 'ARS',
    description: 'Comisión MercadoPago (3 ventas)',
    category: 'fees',
    createdAt: hoursAgo(2),
    paymentMethod: 'mercadopago',
    by: 'Pyter',
  },
  {
    id: 'm010',
    kind: 'expense',
    amount: 350_000,
    currency: 'ARS',
    description: 'Retiro caja — gastos personales',
    category: 'cash-out',
    createdAt: hoursAgo(5),
    paymentMethod: 'efectivo',
    by: 'Pyter',
  },
  {
    id: 'm011',
    kind: 'expense',
    amount: 12_400,
    currency: 'ARS',
    description: 'Internet + electricidad',
    category: 'utilities',
    createdAt: hoursAgo(12),
    paymentMethod: 'transferencia',
    by: 'Pyter',
  },
  {
    id: 'm012',
    kind: 'expense',
    amount: 450_000,
    currency: 'ARS',
    description: 'Sueldo medio-mes — empleado',
    category: 'salary',
    createdAt: hoursAgo(13),
    paymentMethod: 'transferencia',
    by: 'Pyter',
  },
];

const openingBalanceArs = 1_250_000;
const openingBalanceUsd = 850;

const totalIncomeArs = movements
  .filter((m) => m.kind === 'income' && m.currency === 'ARS')
  .reduce((s, m) => s + m.amount, 0);
const totalIncomeUsd = movements
  .filter((m) => m.kind === 'income' && m.currency === 'USD')
  .reduce((s, m) => s + m.amount, 0);
const totalExpenseArs = movements
  .filter((m) => m.kind === 'expense' && m.currency === 'ARS')
  .reduce((s, m) => s + m.amount, 0);
const totalExpenseUsd = movements
  .filter((m) => m.kind === 'expense' && m.currency === 'USD')
  .reduce((s, m) => s + m.amount, 0);

export const cashSummaryMock: CashSummary = {
  date: new Date().toISOString(),
  openingBalance: { ars: openingBalanceArs, usd: openingBalanceUsd },
  totalIncome: { ars: totalIncomeArs, usd: totalIncomeUsd },
  totalExpense: { ars: totalExpenseArs, usd: totalExpenseUsd },
  currentBalance: {
    ars: openingBalanceArs + totalIncomeArs - totalExpenseArs,
    usd: openingBalanceUsd + totalIncomeUsd - totalExpenseUsd,
  },
  usdRate: USD_RATE,
  movements,
};
