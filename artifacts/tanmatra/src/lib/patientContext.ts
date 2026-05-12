import { useMemo } from "react";
import { usePreferences } from "./preferencesContext";
import { useClinicalMode, type DietOrderId } from "./clinicalDiet";

/**
 * Active patient context for the clinical ordering surfaces.
 *
 * The "patient" in this app maps to the authenticated user — Tanmatra has no
 * separate patient roster yet (task #14), so the patient identity is
 * sourced from the user-preferences API (allergens, dietary style) bridged
 * with the clinical-mode store's display fields (name / MRN / room) and the
 * active diet order. This is intentionally a *read* surface — the strip on
 * Menu / Cart / Checkout never edits these values; the clinician console
 * (Clinical.tsx) is the only writer for the diet order.
 *
 * When task #14 lands, swap the inputs of this hook for a real patient
 * roster API; nothing downstream needs to change because every consumer
 * (PatientContextStrip, ConflictsPanel, Cart/Checkout/Menu allergen and
 * diet evaluation) reads through this single accessor.
 */
export interface ActivePatientContext {
  name: string;
  mrn: string;
  room?: string;
  allergens: string[];
  dietOrderId: DietOrderId;
  /** True iff a real preferences row has been hydrated for the user. */
  hydrated: boolean;
}

export function useActivePatient(): ActivePatientContext {
  const { preferences, loading } = usePreferences();
  const { patient, dietOrderId } = useClinicalMode();

  return useMemo<ActivePatientContext>(
    () => ({
      name: patient.name,
      mrn: patient.mrn,
      room: patient.room,
      allergens: preferences?.allergens ?? [],
      dietOrderId,
      hydrated: !loading && preferences !== null,
    }),
    [patient, preferences, loading, dietOrderId],
  );
}
