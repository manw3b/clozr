import { MyDayHero } from './components/MyDayHero';
import { TasksBlock } from './components/TasksBlock';
import { FollowUpsBlock } from './components/FollowUpsBlock';
import { SalesBlock } from './components/SalesBlock';
import { CollectionsBlock } from './components/CollectionsBlock';
import { InactiveClientsBlock } from './components/InactiveClientsBlock';
import { space } from '../../tokens';
import type { MyDayData, Task } from '../../types/domain';
import { buildFollowupWhatsAppMessage } from '../../lib/followupTemplates';

interface MyDayProps {
  data: MyDayData;
  /** Handlers — en producción, estos disparan acciones que llaman a TanStack Query mutations */
  onToggleTask?: (id: string) => void;
  onTaskClick?: (task: Task) => void;
  onWhatsApp?: (clientId: string, opts?: { message?: string }) => void;
  onCall?: (clientId: string) => void;
  onMarkPaid?: (collectionId: string) => void;
  onSaleClick?: (saleId: string) => void;
  onClientClick?: (clientId: string) => void;
  onNewSale?: () => void;
  onSetGoal?: (amountUsd: number) => void;
  onSetSalesGoal?: (count: number) => void;
  onCreateTask?: () => void;
  onTaskProgressDelta?: (taskId: string, delta: 1 | -1) => void;
  onNavigate?: (page: string) => void;
}

/**
 * Pantalla "Mi Día".
 *
 * Layout: Hero arriba (full width) + grid 2 columnas abajo:
 *   - Columna izquierda (más ancha): Tareas + Seguimientos + Clientes en riesgo
 *   - Columna derecha: Ventas de hoy + Cobros pendientes
 *
 * Es responsive: en pantallas <1200px las columnas se apilan.
 */
export function MyDay({
  data,
  onToggleTask = () => {},
  onTaskClick = () => {},
  onWhatsApp = () => {},
  onCall = () => {},
  onMarkPaid = () => {},
  onSaleClick = () => {},
  onClientClick = () => {},
  onNewSale = () => {},
  onSetGoal,
  onSetSalesGoal,
  onCreateTask = () => {},
  onTaskProgressDelta,
  onNavigate = () => {},
}: MyDayProps) {
  // Antes había un `useState(data.tasks)` local para hacer toggle instantáneo,
  // pero ese patrón es buggy: useState con prop como initial value sólo
  // captura el valor en el primer render, así que cuando la query del
  // container resolvía después del primer paint, las tareas nunca aparecían
  // hasta que el componente se desmontaba/remontaba (ej: navegar y volver).
  //
  // La fix correcta es leer data.tasks directo. La latencia de la mutation
  // + invalidate + refetch contra SQLite local es <50ms — imperceptible.
  // Si necesitamos optimistic UI a futuro, lo implementamos con
  // useMutation onMutate + setQueryData en el container.
  function handleToggleTask(id: string) {
    onToggleTask(id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      {/* HERO */}
      <MyDayHero
        greeting={data.greeting}
        userName={data.user.name}
        date={data.date}
        workspaceName={data.workspace.name}
        goal={data.goal}
        score={data.score}
        onNewSale={onNewSale}
        onSetGoal={onSetGoal}
        onSetSalesGoal={onSetSalesGoal}
      />

      {/* GRID — 2 columnas en desktop, 1 en pantallas chicas */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: space[5],
        }}
      >
        {/* COLUMNA IZQUIERDA — acción */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], minWidth: 0 }}>
          <TasksBlock
            tasks={data.tasks}
            onToggleTask={handleToggleTask}
            onTaskClick={onTaskClick}
            onViewAll={() => onNavigate('tareas')}
            onCreateTask={onCreateTask}
            onProgressDelta={onTaskProgressDelta}
          />

          <FollowUpsBlock
            followUps={data.followUps}
            onWhatsApp={(f) => onWhatsApp(f.clientId, { message: buildFollowupWhatsAppMessage(f) })}
            onCall={(f) => onCall(f.clientId)}
            onViewAll={() => onNavigate('pipeline')}
          />

          <InactiveClientsBlock
            clients={data.inactiveClients}
            onWhatsApp={(c) => onWhatsApp(c.client.id)}
            onCall={(c) => onCall(c.client.id)}
            onClientClick={(c) => onClientClick(c.client.id)}
            onViewAll={() => onNavigate('clientes')}
          />
        </div>

        {/* COLUMNA DERECHA — dinero */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], minWidth: 0 }}>
          <SalesBlock
            sales={data.todaySales}
            onSaleClick={(s) => onSaleClick(s.id)}
            onNewSale={onNewSale}
            onViewAll={() => onNavigate('ventas')}
          />

          <CollectionsBlock
            collections={data.dueCollections}
            onMarkPaid={onMarkPaid}
            onCollectionClick={(c) => onClientClick(c.clientId)}
            onViewAll={() => onNavigate('deudas')}
          />
        </div>
      </div>
    </div>
  );
}
