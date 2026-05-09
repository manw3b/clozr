import { useEffect, useState } from "react";
import { Modal, ModalField } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { DateTimePicker } from "../../../components/DateTimePicker";
import { Badge } from "../../../components/Badge";
import { WhatsAppIcon } from "../../../components/icons/WhatsAppIcon";
import { color, space, text, weight } from "../../../tokens";
import type { Lead } from "../../../types/domain";

export interface ScheduleVisitFormData {
  visitAt: string;
  product: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  lead: Lead | null;
  /** True si el cliente del lead es mayorista — cambia el copy y la
   *  intención del flujo (le vamos a generar un código). */
  isMayorista: boolean;
  /** Resuelve cuando la visita quedó persistida + devuelve el body del WA
   *  listo para mandar (renderizado con la plantilla del workspace). */
  onSubmit: (data: ScheduleVisitFormData) => Promise<{
    waMessage: string;
    wholesaleCode: string | null;
  }>;
  /** Llamado cuando el usuario hace click en "Mandar por WhatsApp". */
  onSendWhatsApp: (message: string) => void;
}

/**
 * Modal de 2 pasos:
 *   1. Día / hora / equipo
 *   2. Preview del mensaje con copy + WhatsApp
 *
 * El paso 2 sólo aparece después de guardar — así nos aseguramos de tener
 * el código mayorista persistido antes de generar el texto.
 */
export function ScheduleVisitModal({
  open,
  onClose,
  lead,
  isMayorista,
  onSubmit,
  onSendWhatsApp,
}: Props) {
  const [visitAt, setVisitAt] = useState("");
  const [product, setProduct] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [waMessage, setWaMessage] = useState<string | null>(null);
  const [wholesaleCode, setWholesaleCode] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setVisitAt("");
      setProduct(lead?.product ?? "");
      setWaMessage(null);
      setWholesaleCode(null);
    }
  }, [open, lead?.id, lead?.product]);

  const canSubmit = !!visitAt && !submitting;
  const isPreview = waMessage !== null;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await onSubmit({ visitAt, product: product.trim() });
      setWaMessage(result.waMessage);
      setWholesaleCode(result.wholesaleCode);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!waMessage) return;
    navigator.clipboard.writeText(waMessage).catch(() => {});
  };

  const handleWa = () => {
    if (waMessage) onSendWhatsApp(waMessage);
    onClose();
  };

  const isDirty = () => !isPreview && (!!visitAt || !!product.trim());

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar y descartar el turno?"
      title={isPreview ? "Mensaje listo" : "Agendar visita"}
      maxWidth={520}
      footer={
        isPreview ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button variant="secondary" onClick={handleCopy}>
              Copiar texto
            </Button>
            <Button
              variant="primary"
              iconLeft={<WhatsAppIcon size={14} color="#fff" />}
              onClick={handleWa}
            >
              Mandar por WhatsApp
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={!canSubmit}
              loading={submitting}
            >
              {isMayorista ? "Generar código y agendar" : "Agendar"}
            </Button>
          </>
        )
      }
    >
      {!isPreview && (
        <>
          {lead && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: space[2],
                marginBottom: space[3],
                padding: `${space[2]} ${space[3]}`,
                background: color.surface2,
                borderRadius: 8,
                fontSize: text.sm,
                color: color.textMuted,
              }}
            >
              <span style={{ color: color.text, fontWeight: weight.semibold }}>
                {lead.clientName}
              </span>
              {isMayorista && (
                <Badge tone="warning">Mayorista · se genera código</Badge>
              )}
            </div>
          )}

          <ModalField label="Día y horario" required>
            <DateTimePicker
              value={visitAt}
              onChange={setVisitAt}
              placeholder="Elegir día y hora"
              defaultHour={15}
            />
          </ModalField>

          <ModalField label={isMayorista ? "Pedido / equipo (opcional)" : "Equipo"}>
            <Input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="iPhone 15 Pro Max 256GB"
            />
          </ModalField>
        </>
      )}

      {isPreview && waMessage && (
        <>
          {wholesaleCode && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: space[2],
                marginBottom: space[3],
                padding: `${space[3]}`,
                background: color.surface2,
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: text.xs, color: color.textMuted }}>
                Código asignado:
              </span>
              <span
                style={{
                  fontSize: text.md,
                  fontWeight: weight.bold,
                  color: color.primary,
                  fontFamily: "monospace",
                }}
              >
                {wholesaleCode}
              </span>
            </div>
          )}

          <ModalField label="Mensaje a enviar">
            <textarea
              value={waMessage}
              onChange={(e) => setWaMessage(e.target.value)}
              rows={10}
              style={{
                width: "100%",
                padding: space[3],
                background: color.surface2,
                border: `1px solid ${color.border}`,
                borderRadius: 8,
                color: color.text,
                fontSize: text.sm,
                fontFamily: "inherit",
                lineHeight: 1.5,
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </ModalField>
          <p style={{ fontSize: text.xs, color: color.textDim, marginTop: -space[2] }}>
            Editás el texto antes de mandar. Las plantillas se configuran en
            Ajustes → Plantillas WhatsApp.
          </p>
        </>
      )}
    </Modal>
  );
}
