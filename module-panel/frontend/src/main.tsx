import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// HashRouter, not BrowserRouter: the device serves this as static files via
// busybox httpd, which has no rewrite/fallback rule for unknown paths - a
// hard reload or direct link to e.g. /sms would 404 with History-API
// routing. Hash routes (/#/sms) never hit the server for routing.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
