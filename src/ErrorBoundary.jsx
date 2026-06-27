import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    if (typeof this.props.onError === "function") {
      this.props.onError(error, info);
    }
  }

  render() {
    const { error, info } = this.state;
    if (error) {
      return (
        <div style={{
          minHeight: "100vh",
          background: "#000",
          color: "#ff2234f8",
          fontFamily: "monospace",
          padding: 24,
        }}>
          <div style={{ fontSize: 18, marginBottom: 12 }}>APP CRASHED</div>
          <div style={{ color: "#C8FFC8", marginBottom: 12 }}>{error.message}</div>
          {info?.componentStack && (
            <pre style={{
              whiteSpace: "pre-wrap",
              color: "#356135",
              fontSize: 12,
            }}>
              {info.componentStack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
