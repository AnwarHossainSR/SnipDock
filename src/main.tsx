import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { usePlatformStore } from "./stores/platformStore";
import { useThemeStore } from "./stores/themeStore";
import "./styles/theme.css";
import "./styles/index.css";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1>Something went wrong</h1>
          <p style={{ color: "var(--text-secondary)" }}>{this.state.error.message}</p>
          <button
            type="button"
            style={{ marginTop: 12, padding: "6px 16px", cursor: "pointer" }}
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("SnipDock root element not found");

// The capability matrix decides which view tree renders and which controls
// exist, so it is read before the first paint rather than after it: a tree
// that mounts and then swaps would flash desktop chrome on a phone. It is a
// single local IPC call, and the store falls back to the desktop set if it
// fails, so a slow or failed read costs a frame, not the app.
// The accent and mode already on screen came from the pre-paint mirror in
// index.html. This reconciles them against the stored settings, which are
// authoritative; in the normal case the two agree and nothing repaints.
await Promise.all([usePlatformStore.getState().load(), useThemeStore.getState().load()]);

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
