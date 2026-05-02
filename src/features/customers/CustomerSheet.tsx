import CustomerDetailView from "./CustomerDetailView";
import CustomerForm from "./CustomerForm";
import type { Customer, CreateCustomerInput, CustomerTypeRow } from "../../lib/db/types";

type Mode = "view" | "edit";

interface CustomerSheetProps {
  customer: Customer;
  mode: Mode;
  customerTypes: CustomerTypeRow[];
  onClose?: () => void;
  onModeChange: (mode: Mode) => void;
  onUpdate: (data: CreateCustomerInput) => Promise<unknown>;
  onDelete: () => void;
}

export default function CustomerSheet({
  customer,
  mode,
  customerTypes,
  onModeChange,
  onUpdate,
  onDelete,
}: CustomerSheetProps) {
  return mode === "view" ? (
    <CustomerDetailView
      customer={customer}
      onEdit={() => onModeChange("edit")}
      onDelete={onDelete}
    />
  ) : (
    <CustomerForm
      initial={customer}
      customerTypes={customerTypes}
      onSubmit={onUpdate}
      onCancel={() => onModeChange("view")}
    />
  );
}
