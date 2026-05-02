export default function MorePage() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>
          Más
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
          Configuración y ajustes
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
        Configuración — próximamente
      </div>
    </div>
  );
}
