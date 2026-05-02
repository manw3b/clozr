export default function PipelinePage() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>
          Pipeline
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
          Seguimiento de oportunidades
        </p>
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          color: "var(--text-tertiary)",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        Pipeline de ventas — próximamente
      </div>
    </div>
  );
}
