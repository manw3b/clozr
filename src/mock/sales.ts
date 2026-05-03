import type { Sale } from '../types/domain';

function daysAgo(d: number, h?: number) {
  const ms = d * 86400_000 + (h || 0) * 3600_000;
  return new Date(Date.now() - ms).toISOString();
}

/**
 * 25 ventas mock distribuidas en los últimos 30 días.
 * Mezcla de pagado / parcial / pendiente, distintas formas de pago.
 */
export const salesMock: Sale[] = [
  // Hoy
  { id: 's001', number: 'V-0042', clientId: 'c013', clientName: 'Juan Pérez', clientInitials: 'JP',
    amount: 1_290_000, status: 'paid', paid: 1_290_000, product: 'iPhone 15 128GB',
    paymentMethod: 'transferencia', createdAt: daysAgo(0, 6), paidAt: daysAgo(0, 6), ownerName: 'Pyter' },
  { id: 's002', number: 'V-0041', clientId: 'c005', clientName: 'Sofía Castro', clientInitials: 'SC',
    amount: 850_000, status: 'partial', paid: 425_000, pending: 425_000, product: 'iPhone 14 128GB',
    paymentMethod: 'efectivo', createdAt: daysAgo(0, 4), dueAt: daysAgo(-2), ownerName: 'Pyter',
    notes: '50% seña — saldo a 48hs' },
  { id: 's003', number: 'V-0040', clientId: 'c015', clientName: 'Martín Sosa', clientInitials: 'MS',
    amount: 180_000, status: 'paid', paid: 180_000, product: 'AirPods Pro 2',
    paymentMethod: 'mercadopago', createdAt: daysAgo(0, 1.5), paidAt: daysAgo(0, 1.5), ownerName: 'Pyter' },

  // Ayer
  { id: 's004', number: 'V-0039', clientId: 'c014', clientName: 'Ana Rodríguez', clientInitials: 'AR',
    amount: 1_290_000, status: 'paid', paid: 1_290_000, product: 'iPhone 15 128GB',
    paymentMethod: 'transferencia', createdAt: daysAgo(1, 5), paidAt: daysAgo(1, 5), ownerName: 'Pyter' },
  { id: 's005', number: 'V-0038', clientId: 'c020', clientName: 'Mariano Acosta', clientInitials: 'MA',
    amount: 1_550_000, status: 'pending', paid: 0, pending: 1_550_000, product: 'iPhone 15 Pro 256GB',
    paymentMethod: 'cuenta-corriente', createdAt: daysAgo(1, 2), dueAt: daysAgo(-5), ownerName: 'Pyter',
    notes: 'Cuenta corriente — vence en 5 días' },

  // Hace 2-3 días
  { id: 's006', number: 'V-0037', clientId: 'c004', clientName: 'Distribuidora Norte SA', clientInitials: 'DN',
    amount: 12_500_000, status: 'partial', paid: 6_250_000, pending: 6_250_000, product: 'Lote 10x iPhone 14',
    paymentMethod: 'transferencia', createdAt: daysAgo(2, 3), dueAt: daysAgo(-7), ownerName: 'Pyter',
    notes: '50% transferencia, saldo a 7 días' },
  { id: 's007', number: 'V-0036', clientId: 'c001', clientName: 'Carlos Méndez', clientInitials: 'CM',
    amount: 1_780_000, status: 'paid', paid: 1_780_000, product: 'iPhone 15 Pro 128GB',
    paymentMethod: 'usdt', createdAt: daysAgo(2), paidAt: daysAgo(2), ownerName: 'Pyter' },
  { id: 's008', number: 'V-0035', clientId: 'c025', clientName: 'Romina Ferrari', clientInitials: 'RF',
    amount: 1_290_000, status: 'paid', paid: 1_290_000, product: 'iPhone 15 128GB',
    paymentMethod: 'tarjeta-credito', createdAt: daysAgo(3), paidAt: daysAgo(3), ownerName: 'Pyter' },

  // Hace 5-7 días
  { id: 's009', number: 'V-0034', clientId: 'c008', clientName: 'Roberto Silva', clientInitials: 'RS',
    amount: 320_000, status: 'pending', paid: 0, pending: 320_000, product: 'Apple Watch Series 9',
    paymentMethod: 'cuenta-corriente', createdAt: daysAgo(5), dueAt: daysAgo(1), ownerName: 'Pyter',
    notes: 'Vencido hace 1 día' },
  { id: 's010', number: 'V-0033', clientId: 'c022', clientName: 'TechShop SA', clientInitials: 'TS',
    amount: 18_500_000, status: 'partial', paid: 9_250_000, pending: 9_250_000, product: 'Lote 12x mixto',
    paymentMethod: 'transferencia', createdAt: daysAgo(6), dueAt: daysAgo(-1), ownerName: 'Pyter' },
  { id: 's011', number: 'V-0032', clientId: 'c026', clientName: 'Cristian Romero', clientInitials: 'CR',
    amount: 1_290_000, status: 'paid', paid: 1_290_000, product: 'iPhone 15 128GB',
    paymentMethod: 'transferencia', createdAt: daysAgo(7), paidAt: daysAgo(7), ownerName: 'Pyter' },

  // Hace 10-15 días
  { id: 's012', number: 'V-0031', clientId: 'c010', clientName: 'TechReseller SRL', clientInitials: 'TR',
    amount: 8_900_000, status: 'paid', paid: 8_900_000, product: 'Lote 6x iPhone 14',
    paymentMethod: 'transferencia', createdAt: daysAgo(10), paidAt: daysAgo(10), ownerName: 'Pyter' },
  { id: 's013', number: 'V-0030', clientId: 'c009', clientName: 'Patricia Núñez', clientInitials: 'PN',
    amount: 95_000, status: 'pending', paid: 0, pending: 95_000, product: 'AirPods 3',
    paymentMethod: 'cuenta-corriente', createdAt: daysAgo(11), dueAt: daysAgo(3), ownerName: 'Pyter',
    notes: 'Vencido hace 3 días' },
  { id: 's014', number: 'V-0029', clientId: 'c029', clientName: 'Pablo Gutiérrez', clientInitials: 'PG',
    amount: 980_000, status: 'paid', paid: 980_000, product: 'iPhone 14',
    paymentMethod: 'efectivo', createdAt: daysAgo(12), paidAt: daysAgo(12), ownerName: 'Pyter' },
  { id: 's015', number: 'V-0028', clientId: 'c024', clientName: 'Esteban Álvarez', clientInitials: 'EA',
    amount: 4_200_000, status: 'paid', paid: 4_200_000, product: '3x iPhone 14 Pro',
    paymentMethod: 'transferencia', createdAt: daysAgo(14), paidAt: daysAgo(14), ownerName: 'Pyter' },

  // Hace 18-25 días
  { id: 's016', number: 'V-0027', clientId: 'c023', clientName: 'Florencia Méndez', clientInitials: 'FM',
    amount: 1_290_000, status: 'paid', paid: 1_290_000, product: 'iPhone 15 128GB',
    paymentMethod: 'mercadopago', createdAt: daysAgo(18), paidAt: daysAgo(18), ownerName: 'Pyter' },
  { id: 's017', number: 'V-0026', clientId: 'c021', clientName: 'Sofía Bianchi', clientInitials: 'SB',
    amount: 850_000, status: 'paid', paid: 850_000, product: 'iPhone 14',
    paymentMethod: 'transferencia', createdAt: daysAgo(20), paidAt: daysAgo(20), ownerName: 'Pyter' },
  { id: 's018', number: 'V-0025', clientId: 'c027', clientName: 'Distribuidora Sur', clientInitials: 'DS',
    amount: 6_400_000, status: 'paid', paid: 6_400_000, product: 'Lote 5x iPhone 13',
    paymentMethod: 'transferencia', createdAt: daysAgo(22), paidAt: daysAgo(22), ownerName: 'Pyter' },
  { id: 's019', number: 'V-0024', clientId: 'c028', clientName: 'Nicolás Vázquez', clientInitials: 'NV',
    amount: 1_290_000, status: 'paid', paid: 1_290_000, product: 'iPhone 15 128GB',
    paymentMethod: 'tarjeta-credito', createdAt: daysAgo(24), paidAt: daysAgo(24), ownerName: 'Pyter' },

  // Hace 26-30 días
  { id: 's020', number: 'V-0023', clientId: 'c011', clientName: 'Diego Fernández', clientInitials: 'DF',
    amount: 1_550_000, status: 'paid', paid: 1_550_000, product: 'iPhone 15 Pro',
    paymentMethod: 'transferencia', createdAt: daysAgo(26), paidAt: daysAgo(26), ownerName: 'Pyter' },
  { id: 's021', number: 'V-0022', clientId: 'c003', clientName: 'Lucas Pereyra', clientInitials: 'LP',
    amount: 350_000, status: 'paid', paid: 350_000, product: 'AirPods Pro 2',
    paymentMethod: 'efectivo', createdAt: daysAgo(27), paidAt: daysAgo(27), ownerName: 'Pyter' },
  { id: 's022', number: 'V-0021', clientId: 'c012', clientName: 'Federico Ramos', clientInitials: 'FR',
    amount: 1_290_000, status: 'paid', paid: 1_290_000, product: 'iPhone 15 128GB',
    paymentMethod: 'transferencia', createdAt: daysAgo(28), paidAt: daysAgo(28), ownerName: 'Pyter' },
  { id: 's023', number: 'V-0020', clientId: 'c002', clientName: 'María González', clientInitials: 'MG',
    amount: 1_290_000, status: 'paid', paid: 1_290_000, product: 'iPhone 15 128GB',
    paymentMethod: 'mercadopago', createdAt: daysAgo(29), paidAt: daysAgo(29), ownerName: 'Pyter' },
  { id: 's024', number: 'V-0019', clientId: 'c006', clientName: 'Marcos Gutiérrez', clientInitials: 'MG',
    amount: 980_000, status: 'paid', paid: 980_000, product: 'iPhone 14',
    paymentMethod: 'efectivo', createdAt: daysAgo(30), paidAt: daysAgo(30), ownerName: 'Pyter' },
  { id: 's025', number: 'V-0018', clientId: 'c007', clientName: 'Valentina López', clientInitials: 'VL',
    amount: 5_800_000, status: 'paid', paid: 5_800_000, product: 'Lote 4x iPhone 14',
    paymentMethod: 'transferencia', createdAt: daysAgo(30, 12), paidAt: daysAgo(30, 12), ownerName: 'Pyter' },
];

/**
 * Datos para el gráfico de evolución (últimos N días).
 */
export function buildSalesTimeline(sales: Sale[], days: number = 30) {
  const buckets: { date: string; total: number; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    d.setHours(0, 0, 0, 0);
    const start = d.getTime();
    const end = start + 86400_000;
    let total = 0;
    let count = 0;
    for (const s of sales) {
      const t = new Date(s.createdAt).getTime();
      if (t >= start && t < end) {
        total += s.amount;
        count++;
      }
    }
    buckets.push({ date: d.toISOString(), total, count });
  }
  return buckets;
}
