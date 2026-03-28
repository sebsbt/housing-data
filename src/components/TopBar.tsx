import type { GeographyMode } from "../types";
import "./topbar.css";

type Geo = "national" | "state" | "metro" | "county" | "zip";

type Props = {
  geography: GeographyMode;
  onGeographyChange: (g: GeographyMode) => void;
  tableOpen: boolean;
  onToggleTable: () => void;
};

const LEVELS: { id: Geo; label: string; mode?: GeographyMode }[] = [
  { id: "national", label: "National" },
  { id: "state", label: "State" },
  { id: "metro", label: "Metro", mode: "metro" },
  { id: "county", label: "County" },
  { id: "zip", label: "Zip", mode: "zip" },
];

export function TopBar({ geography, onGeographyChange, tableOpen, onToggleTable }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="brand-mark" aria-hidden />
        <div>
          <div className="brand-title">Housing Market Map</div>
          <div className="brand-sub">
            ZCTA / metro boundaries (Census) · metrics from Zillow/Redfin files you ingest
          </div>
        </div>
      </div>

      <nav className="geo-nav" aria-label="Geography level">
        {LEVELS.map((lvl) => {
          const enabled = lvl.mode != null;
          const active = enabled && geography === lvl.mode;
          return (
            <button
              key={lvl.id}
              type="button"
              className={`geo-pill ${active ? "active" : ""} ${!enabled ? "disabled" : ""}`}
              disabled={!enabled}
              title={
                enabled
                  ? undefined
                  : "Not wired in this demo (add boundary + ingest for this level)."
              }
              onClick={() => {
                if (lvl.mode) onGeographyChange(lvl.mode);
              }}
            >
              {lvl.label}
            </button>
          );
        })}
      </nav>

      <div className="topbar-actions">
        <button type="button" className="btn-outline" onClick={onToggleTable}>
          {tableOpen ? "Hide table" : "Table view"}
        </button>
        <button type="button" className="btn-ghost" disabled title="Stub">
          Sign up
        </button>
        <button type="button" className="btn-primary" disabled title="Stub">
          Login
        </button>
      </div>
    </header>
  );
}
