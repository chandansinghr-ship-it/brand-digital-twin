import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>
  );
  // Belt-and-suspenders: also cleared by useEffect in Root after mount
  window.__clearTanmatraLoader?.();
});

// Register service worker for offline support and "Add to Home Screen" eligibility.
// Only active in production — Vite's dev server serves files differently.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // SW registration failure is non-fatal.
  });
}

declare global {
  interface Window {
    __clearTanmatraLoader?: () => void;
  }
}
