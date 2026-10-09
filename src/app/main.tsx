import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "./styles.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Application root element was not found.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
