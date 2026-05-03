import type { MyDayData } from '../types/domain';

/**
 * Datos mock realistas para Mi Día.
 * Simulan un día activo de un vendedor de iPhones a las 19hs (sábado).
 *
 * Cuando integres con TanStack Query, reemplazá esto por:
 *   const { data } = useQuery({ queryKey: ['my-day'], queryFn: fetchMyDay })
 */

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000).toISOString();
}
function inHours(h: number) {
  return new Date(Date.now() + h * 3600_000).toISOString();
}
function daysAgo(d: number) {
  return new Date(Date.now() - d * 86400_000).toISOString();
}

export const myDayMock: MyDayData = {
  greeting: 'evening',
  user: { name: 'Pyter' },
  workspace: { name: 'iPhone Club' },
  date: new Date().toISOString(),

  goal: {
    amount: 800_000,
    current: 540_000,
    salesCount: 3,
    salesGoal: 5,
  },

  score: 64,

  tasks: [
    {
      id: 't1',
      title: 'Llamar a Carlos Méndez por iPhone 15 Pro',
      type: 'puntual',
      status: 'pending',
      priority: 'high',
      dueAt: inHours(1.5),
      clientId: 'c1',
      clientName: 'Carlos Méndez',
    },
    {
      id: 't2',
      title: 'Enviar presupuesto a María González',
      type: 'puntual',
      status: 'pending',
      priority: 'high',
      dueAt: hoursAgo(2),
      clientId: 'c2',
      clientName: 'María González',
    },
    {
      id: 't3',
      title: 'Revisar stock de cargadores MagSafe',
      type: 'rutina',
      status: 'pending',
      priority: 'medium',
      dueAt: inHours(4),
    },
    {
      id: 't4',
      title: 'Cerrar caja del día',
      type: 'rutina',
      status: 'pending',
      priority: 'low',
      dueAt: inHours(2),
    },
  ],

  followUps: [
    {
      id: 'f1',
      clientId: 'c3',
      clientName: 'Lucas Pereyra',
      reason: 'cotizacion-enviada',
      dueAt: hoursAgo(3),
      daysSinceContact: 2,
      amount: 1_290_000,
      notes: 'Pasó cotización por iPhone 15 hace 2 días, sin respuesta',
    },
    {
      id: 'f2',
      clientId: 'c4',
      clientName: 'Ana Rodríguez',
      reason: 'lead-tibio',
      dueAt: inHours(0.5),
      daysSinceContact: 1,
      amount: 980_000,
    },
    {
      id: 'f3',
      clientId: 'c5',
      clientName: 'Diego Fernández',
      reason: 'sin-respuesta',
      dueAt: inHours(2),
      daysSinceContact: 3,
    },
  ],

  todaySales: [
    {
      id: 's1',
      clientId: 'c6',
      clientName: 'Juan Pérez',
      amount: 1_290_000,
      status: 'paid',
      paid: 1_290_000,
      product: 'iPhone 15 128GB',
      createdAt: hoursAgo(6),
    },
    {
      id: 's2',
      clientId: 'c7',
      clientName: 'Sofía Castro',
      amount: 850_000,
      status: 'partial',
      paid: 425_000,
      product: 'iPhone 14 128GB',
      createdAt: hoursAgo(4),
    },
    {
      id: 's3',
      clientId: 'c8',
      clientName: 'Martín Sosa',
      amount: 180_000,
      status: 'paid',
      paid: 180_000,
      product: 'AirPods Pro 2',
      createdAt: hoursAgo(1.5),
    },
  ],

  dueCollections: [
    {
      id: 'd1',
      saleId: 's2',
      clientId: 'c7',
      clientName: 'Sofía Castro',
      amount: 425_000,
      dueAt: inHours(48),
      daysOverdue: -2,
      product: 'iPhone 14 128GB',
    },
    {
      id: 'd2',
      saleId: 's10',
      clientId: 'c9',
      clientName: 'Roberto Silva',
      amount: 320_000,
      dueAt: hoursAgo(24),
      daysOverdue: 1,
      product: 'iPhone 13',
    },
    {
      id: 'd3',
      saleId: 's11',
      clientId: 'c10',
      clientName: 'Patricia Núñez',
      amount: 95_000,
      dueAt: hoursAgo(72),
      daysOverdue: 3,
      product: 'AirPods 3',
    },
  ],

  inactiveClients: [
    {
      client: {
        id: 'c11',
        name: 'Marcos Gutiérrez',
        phone: '+54 9 11 5555-7821',
        type: 'final',
        lastContactAt: daysAgo(45),
        lifetimeValue: 2_400_000,
      },
      daysSinceContact: 45,
      totalPurchases: 3,
    },
    {
      client: {
        id: 'c12',
        name: 'Valentina López',
        phone: '+54 9 11 5555-3340',
        type: 'revendedor',
        lastContactAt: daysAgo(60),
        lifetimeValue: 5_800_000,
      },
      daysSinceContact: 60,
      totalPurchases: 8,
    },
    {
      client: {
        id: 'c13',
        name: 'Federico Ramos',
        phone: '+54 9 11 5555-9912',
        type: 'final',
        lastContactAt: daysAgo(30),
        lifetimeValue: 1_290_000,
      },
      daysSinceContact: 30,
      totalPurchases: 1,
    },
  ],
};
