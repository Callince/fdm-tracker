import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/electron/renderer";
import App from "./App";
import "./index.css";

declare const __FDM_SENTRY_DSN__: string | undefined;
const dsn: string | undefined =
  typeof __FDM_SENTRY_DSN__ !== "undefined" ? __FDM_SENTRY_DSN__ : undefined;

if (dsn) {
  Sentry.init({});   // main-process init carries the DSN; renderer just hooks
}

// The floating widget shares the same bundle but needs a transparent body
// so the rounded, shadowed card is visible against the desktop.
if (window.location.hash === "#widget") {
  document.documentElement.classList.add("widget-mode");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
