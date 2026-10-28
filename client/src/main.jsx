import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./auth.jsx";
import { BASE } from "./base.js";
import { detectMode } from "./mode.js";
import "./styles.css";

await detectMode();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter basename={BASE.replace(/\/$/, "") || "/"}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
