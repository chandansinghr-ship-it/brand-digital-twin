import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import IntakeQuiz from "./IntakeQuiz";
import { usePreferences } from "@/lib/preferencesContext";

const SKIP_KEY = "tanmatra:quiz-skipped:v1";

export default function OnboardingQuizGate() {
  const { needsQuiz } = usePreferences();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!needsQuiz) {
      setOpen(false);
      return;
    }
    if (location.pathname === "/preferences" || location.pathname === "/login") {
      return;
    }
    if (typeof window !== "undefined" && window.sessionStorage.getItem(SKIP_KEY) === "1") {
      return;
    }
    setOpen(true);
  }, [needsQuiz, location.pathname]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && needsQuiz && typeof window !== "undefined") {
      window.sessionStorage.setItem(SKIP_KEY, "1");
    }
  };

  return <IntakeQuiz open={open} onOpenChange={handleOpenChange} />;
}
