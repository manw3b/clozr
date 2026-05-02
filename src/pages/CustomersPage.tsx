export default function CustomersPage() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>
          Clientes
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
          Gestión de clientes
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
        Lista de clientes — próximamente
      </div>
    </div>
  );
}
