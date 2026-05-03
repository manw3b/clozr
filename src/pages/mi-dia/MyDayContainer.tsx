import { MyDay } from "./MyDay";
import { myDayMock } from "../../mock/myDay";
import { useUIStore } from "../../store/uiStore";

/**
 * Container de Mi Día.
 *
 * TODO: Reemplazar myDayMock con TanStack Query queries reales:
 *   - useQuery(['my-day']) → invoke('get_my_day_data') o composición de:
 *     useQuery(['tasks', date]), useQuery(['followups']), useQuery(['sales-today']),
 *     useQuery(['due-collections']), useQuery(['inactive-clients'])
 *   - useMutation toggleTask, markPaid, etc.
 */
export function MyDayContainer() {
  const { setActiveScreen, setQuickModal } = useUIStore();

  return (
    <MyDay
      data={myDayMock}
      onNewSale={() => setQuickModal("sale")}
      onNavigate={(page) => {
        const map: Record<string, string> = {
          tareas: "tasks",
          pipeline: "pipeline",
          clientes: "customers",
          ventas: "sales",
          deudas: "cash",
        };
        const target = map[page];
        if (target) setActiveScreen(target as never);
      }}
    />
  );
}
