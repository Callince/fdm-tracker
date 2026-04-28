import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

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
