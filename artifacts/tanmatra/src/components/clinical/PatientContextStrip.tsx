import { useMemo } from "react";
import { Link } from "react-router";
import {
  AlertCircle,
  ClipboardList,
  Stethoscope,
  Utensils,
  X,
} from "lucide-react";
import {
  DIET_ORDERS,
  clinicalModeStore,
  useClinicalMode,
  type DietOrderId,
} from "@/lib/clinicalDiet";
import { usePreferences } from "@/lib/preferencesContext";
import { useOrders } from "@/lib/ordersContext";

export default function PatientContextStrip() {
  const { enabled, patient, dietOrderId } = useClinicalMode();
  const { preferences } = usePreferences();
  const { orders } = useOrders();

  const lastMeals = useMemo(() => {
    return orders
      .filter((o) => o.status !== "cancelled")
      .slice(0, 3)
      .flatMap((o) => o.items.slice(0, 2).map((it) => it.name));
  }, [orders]);

  // Top-3 medical alerts: prefer the patient's recorded allergens (drives the
  // Confirm-Order block downstream). When none are recorded, fall back to a
  // single explanatory note so the strip never collapses to an empty area.
  const alerts = useMemo(() => {
    const a = preferences?.allergens?.slice(0, 3) ?? [];
    return a;
  }, [preferences]);

  if (!enabled) return null;

  return (
    <section
      aria-label="Patient context"
      className="rounded-xl border border-clinical-gold/30 bg-clinical-gold/[0.05] px-4 py-3 space-y-2.5 text-xs"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <Stethoscope className="w-4 h-4 text-clinical-gold shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{patient.name}</p>
            <p className="text-[10px] text-clinical-zinc tabular-nums truncate">
              {patient.mrn}
              {patient.room ? ` · ${patient.room}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5 text-clinical-gold" aria-hidden />
          <label
            htmlFor="patient-diet-order"
            className="text-[10px] uppercase tracking-[0.12em] text-clinical-zinc font-semibold"
          >
            Diet order
          </label>
          <select
            id="patient-diet-order"
            value={dietOrderId}
            onChange={(e) =>
              clinicalModeStore.setDietOrder(e.target.value as DietOrderId)
            }
            className="bg-clinical-dark border border-clinical-slate/40 text-white text-xs rounded-md px-2 py-1 focus:outline-none focus:border-clinical-gold/60"
          >
            {DIET_ORDERS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => clinicalModeStore.disable()}
          className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-clinical-zinc hover:text-white"
          aria-label="Exit clinical mode"
        >
          <X className="w-3 h-3" />
          Exit clinical mode
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-[0.14em] font-semibold text-red-300 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" aria-hidden />
            Top alerts
          </p>
          {alerts.length === 0 ? (
            <p className="text-[11px] text-clinical-zinc mt-1">
              No allergens on file.{" "}
              <Link to="/preferences" className="text-clinical-gold hover:underline">
                Update Medical ID
              </Link>
            </p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {alerts.map((a) => (
                <li
                  key={a}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-200 border border-red-500/30 capitalize"
                >
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-clinical-slate/30 bg-clinical-surface/50 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-[0.14em] font-semibold text-clinical-zinc flex items-center gap-1">
            <Utensils className="w-3 h-3 text-clinical-gold" aria-hidden />
            Last meals
          </p>
          {lastMeals.length === 0 ? (
            <p className="text-[11px] text-clinical-zinc/70 mt-1">No prior meals on record.</p>
          ) : (
            <p className="text-[11px] text-clinical-zinc mt-1 line-clamp-2">
              {lastMeals.join(" · ")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
