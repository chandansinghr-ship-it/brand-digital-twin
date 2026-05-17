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
  // A1c: clear the branded splash once React has hydrated
  if (typeof window !== "undefined" && typeof window.__clearTanmatraLoader === "function") {
    window.__clearTanmatraLoader();
  }
});

declare global {
  interface Window {
    __clearTanmatraLoader?: () => void;
  }
}
