import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal, ModalField } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { Input, Select } from "../../../components/Input";
import { catalogDb } from "../../../lib/db/catalog";
import { pricingDb } from "../../../lib/db/pricing";
import { useUIStore } from "../../../store/uiStore";
import { space } from "../../../tokens";
import type { CatalogItemWithImeis } from "../../../lib/db/types";

interface Props {
  open: boolean;
  onClose: () => void;
  wid: string;
  /** Cuando se crea, se llama con el item recién creado (con shape de WithImeis) */
  onCreated?: (item: CatalogItemWithImeis) => void;
}

const CATEGORY_OPTIONS = [
  "iPhone",
  "iPad",
  "Mac",
  "Apple Watch",
  "AirPods",
  "Accesorios",
  "Otro",
];

export function AddProductSimpleModal({ open, onClose, wid, onCreated }: Props) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("iPhone");
  const [costUsd, setCostUsd] = useState("");
  const [trackStock, setTrackStock] = useState(true);

  const reset = () => {
    setName("");
    setCategory("iPhone");
    setCostUsd("");
    setTrackStock(true);
  };

  const mut = useMutation({
    mutationFn: async () => {
      const item = await catalogDb.create(wid, {
        name: name.trim(),
        category,
        track_stock: trackStock,
        currency: "ARS",
      });
      const cost = parseFloat(costUsd);
      if (Number.isFinite(cost) && cost > 0) {
        await pricingDb.setCatalogCost(item.id, cost);
      }
      return item;
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ["inventario"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
      showToast("Producto creado", "success");
      const withImeis: CatalogItemWithImeis = {
        ...item,
        cost_usd: parseFloat(costUsd) || 0,
        available_imeis: 0,
        total_imeis: 0,
      } as CatalogItemWithImeis;
      onCreated?.(withImeis);
      reset();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Agregar producto"
      subtitle="Cargá los datos básicos. Las unidades (IMEIs) se cargan después."
      maxWidth={520}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => mut.mutate()}
            loading={mut.isPending}
            disabled={!name.trim()}
          >
            Crear
          </Button>
        </>
      }
    >
      <ModalField label="Nombre" hint="Ej: iPhone 17 256GB Black">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="iPhone 17 256GB Black"
          autoFocus
        />
      </ModalField>

      <ModalField label="Categoría">
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </ModalField>

      <ModalField label="Costo (USD)" hint="Lo que pagaste. Opcional, podés cargarlo después.">
        <Input
          type="number"
          step="0.01"
          value={costUsd}
          onChange={(e) => setCostUsd(e.target.value)}
          placeholder="0"
        />
      </ModalField>

      <div style={{ display: "flex", alignItems: "center", gap: space[2], marginTop: space[2] }}>
        <input
          type="checkbox"
          id="trackStock"
          checked={trackStock}
          onChange={(e) => setTrackStock(e.target.checked)}
        />
        <label htmlFor="trackStock" style={{ fontSize: "13px" }}>
          Llevar stock por unidad (IMEIs)
        </label>
      </div>
    </Modal>
  );
}
