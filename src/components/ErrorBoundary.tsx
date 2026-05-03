import { Component, type ReactNode } from "react";
import { log } from "../lib/logger";
import { color, radius, space, text, weight } from "../tokens";
import { Button } from "./Button";
import logoIsotipo from "../assets/logo-isotipo.svg";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    log.error("React error boundary caught", {
      scope: "ErrorBoundary",
      err: error,
      data: { componentStack: info.componentStack ?? null },
    });
  }

  reset = () => this.setState({ error: null });
  reload = () => window.location.reload();

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: space[6],
          background: color.bg,
          color: color.text,
          gap: space[4],
        }}
      >
        <img src={logoIsotipo} alt="Clozr" style={{ height: 56, opacity: 0.6 }} />
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <h1
            style={{
              margin: 0,
              fontSize: text.xl,
              fontWeight: weight.bold,
              letterSpacing: "-0.3px",
              marginBottom: space[2],
            }}
          >
            Algo salió mal
          </h1>
          <p style={{ margin: 0, fontSize: text.sm, color: color.textMuted, lineHeight: 1.5 }}>
            La aplicación encontró un error inesperado. Tus datos están guardados — podés intentar
            recargar.
          </p>
        </div>

        <details
          style={{
            maxWidth: 560,
            width: "100%",
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            padding: space[3],
            fontSize: text.xs,
            color: color.textMuted,
            fontFamily: "var(--font-mono)",
          }}
        >
          <summary style={{ cursor: "pointer", color: color.text }}>Detalles técnicos</summary>
          <pre style={{ marginTop: space[2], whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {this.state.error.message}
            {"\n"}
            {this.state.error.stack}
          </pre>
        </details>

        <div style={{ display: "flex", gap: space[2] }}>
          <Button variant="secondary" onClick={this.reset}>
            Reintentar
          </Button>
          <Button variant="primary" onClick={this.reload}>
            Recargar app
          </Button>
        </div>
      </div>
    );
  }
}
