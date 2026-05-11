/// <reference types="vite-plugin-pwa/client" />
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { installDevApiFetchShim } from "@/lib/dev-api-fetch";
import { installStaffOfflineFetchOverlayOnce } from "@/lib/offline/offline-fetch-overlay";
import "@/lib/i18n";
import App from "./App";
import "./index.css";

installDevApiFetchShim();
installStaffOfflineFetchOverlayOnce();

registerSW({
  immediate: true,
  onRegisterError(err) {
    console.warn("[PWA] service worker registration failed", err);
  },
});

createRoot(document.getElementById("root")!).render(<App />);
