import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./ui/App";
import { AuthSessionProvider } from "./ui/auth/AuthSessionContext";
import "./ui/styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthSessionProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthSessionProvider>
  </React.StrictMode>,
);

