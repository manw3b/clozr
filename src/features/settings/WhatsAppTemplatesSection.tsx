import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceSettings } from "../../lib/db/workspaceSettings";
import {
  VISIT_TEMPLATE_KEYS,
  DEFAULT_VISIT_TEMPLATES,
  PLACEHOLDER_HELP,
  applyVisitTemplate,
} from "../../lib/visitTemplates";
import { useUIStore } from "../../store/uiStore";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  background: "var(--surface-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  lineHeight: 1.5,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-muted)",
  marginBottom: 6,
  display: "block",
};

interface Props {
  wid: string;
}

const KEYS = [
  VISIT_TEMPLATE_KEYS.final,
  VISIT_TEMPLATE_KEYS.mayorista,
  VISIT_TEMPLATE_KEYS.address,
  VISIT_TEMPLATE_KEYS.codePrefix,
  VISIT_TEMPLATE_KEYS.codeCounter,
];

/**
 * Sección "Plantillas WhatsApp" — el usuario edita el cuerpo del mensaje
 * que se manda al agendar una visita (cliente final y mayorista) y la
 * dirección + prefijo del código que se inyectan como placeholders.
 *
 * El contador del código vive acá también (read-only en práctica, pero
 * dejamos el editor por si el dueño quiere reiniciarlo a inicio de mes).
 */
export function WhatsAppTemplatesSection({ wid }: Props) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();

  const { data: settings = {} } = useQuery({
    queryKey: ["workspace-settings", wid, "wa-templates"],
    queryFn: () => workspaceSettings.getMany(wid, KEYS),
    enabled: !!wid,
  });

  const [templateFinal, setTemplateFinal] = useState("");
  const [templateMayorista, setTemplateMayorista] = useState("");
  const [address, setAddress] = useState("");
  const [codePrefix, setCodePrefix] = useState("");
  const [codeCounter, setCodeCounter] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTemplateFinal(
      settings[VISIT_TEMPLATE_KEYS.final] ?? DEFAULT_VISIT_TEMPLATES.final,
    );
    setTemplateMayorista(
      settings[VISIT_TEMPLATE_KEYS.mayorista] ?? DEFAULT_VISIT_TEMPLATES.mayorista,
    );
    setAddress(settings[VISIT_TEMPLATE_KEYS.address] ?? DEFAULT_VISIT_TEMPLATES.address);
    setCodePrefix(
      settings[VISIT_TEMPLATE_KEYS.codePrefix] ?? DEFAULT_VISIT_TEMPLATES.codePrefix,
    );
    setCodeCounter(settings[VISIT_TEMPLATE_KEYS.codeCounter] ?? "");
    setDirty(false);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await workspaceSettings.setMany(wid, {
        [VISIT_TEMPLATE_KEYS.final]: templateFinal,
        [VISIT_TEMPLATE_KEYS.mayorista]: templateMayorista,
        [VISIT_TEMPLATE_KEYS.address]: address,
        [VISIT_TEMPLATE_KEYS.codePrefix]: codePrefix.trim() || "B",
        [VISIT_TEMPLATE_KEYS.codeCounter]: codeCounter.trim() || null,
      });
      qc.invalidateQueries({ queryKey: ["workspace-settings", wid] });
      showToast("Plantillas guardadas", "success");
      setDirty(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  const onChange = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  // Preview de cómo queda renderizado un mensaje con datos de ejemplo.
  const previewFinal = applyVisitTemplate(templateFinal, {
    nombre: "Carlos",
    equipo: "iPhone 15 Pro Max 256GB",
    dia: "Martes 30",
    hora: "15:00hs",
    direccion: address || DEFAULT_VISIT_TEMPLATES.address,
  });
  const previewMayorista = applyVisitTemplate(templateMayorista, {
    codigo: `${(codePrefix.trim() || "B")}1202`,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: -0.2 }}>
            Plantillas WhatsApp
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
            Mensajes que se envían al agendar una visita o un pedido mayorista.
          </p>
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 18px",
              background: "var(--primary)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        )}
      </div>

      {/* Placeholders disponibles */}
      <div
        style={{
          padding: 12,
          marginBottom: 24,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
          Placeholders disponibles
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PLACEHOLDER_HELP.map((p) => (
            <span
              key={p.token}
              style={{
                padding: "3px 8px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "monospace",
              }}
              title={p.label}
            >
              {p.token}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
          Pasá el mouse para ver para qué sirve cada uno.
        </div>
      </div>

      <div style={{ display: "grid", gap: 24, maxWidth: 720 }}>
        {/* Cliente final */}
        <section>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
            Cliente final
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
            Se manda cuando agendás una visita a un cliente común.
          </p>
          <textarea
            value={templateFinal}
            onChange={(e) => onChange<string>(setTemplateFinal)(e.target.value)}
            rows={9}
            style={inputStyle}
          />
          <PreviewBox text={previewFinal} />
        </section>

        {/* Mayorista */}
        <section>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
            Cliente mayorista
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
            Se manda cuando agendás un pedido a un cliente marcado como{" "}
            <strong>mayorista</strong>. Cada turno mayorista recibe un código único.
          </p>
          <textarea
            value={templateMayorista}
            onChange={(e) => onChange<string>(setTemplateMayorista)(e.target.value)}
            rows={6}
            style={inputStyle}
          />
          <PreviewBox text={previewMayorista} />
        </section>

        {/* Dirección */}
        <section>
          <label style={labelStyle}>Dirección del local (placeholder {"{direccion}"})</label>
          <input
            value={address}
            onChange={(e) => onChange<string>(setAddress)(e.target.value)}
            placeholder="calle 44 e/ 17 y 18 Número 1136 (Timbre 101)"
            style={inputStyle}
          />
        </section>

        {/* Código mayorista */}
        <section style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
            Código mayorista
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            Cada turno mayorista recibe un código autoincremental (ej: B1202, B1203…).
            Editá el contador si querés reiniciarlo a inicio de mes.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Prefijo</label>
              <input
                value={codePrefix}
                onChange={(e) => onChange<string>(setCodePrefix)(e.target.value)}
                placeholder="B"
                maxLength={4}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Próximo número</label>
              <input
                type="number"
                value={codeCounter}
                onChange={(e) => onChange<string>(setCodeCounter)(e.target.value)}
                placeholder="1200"
                style={inputStyle}
              />
              <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                Vacío = empieza desde 1200.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PreviewBox({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: 12,
        background: "rgba(48,209,88,0.06)",
        border: "1px solid rgba(48,209,88,0.2)",
        borderRadius: 8,
        fontSize: 12,
        color: "var(--text-muted)",
        whiteSpace: "pre-wrap",
        fontFamily: "inherit",
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
        Preview
      </div>
      {text}
    </div>
  );
}
