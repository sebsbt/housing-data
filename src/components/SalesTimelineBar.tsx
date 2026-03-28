import "./sales-timeline-bar.css";

type Props = {
  visible: boolean;
  year: number;
  minYear: number;
  maxYear: number;
  playing: boolean;
  onYearChange: (y: number) => void;
  onTogglePlay: () => void;
};

export function SalesTimelineBar({
  visible,
  year,
  minYear,
  maxYear,
  playing,
  onYearChange,
  onTogglePlay,
}: Props) {
  if (!visible || minYear > maxYear) return null;

  return (
    <div
      className={`sales-timeline-bar ${!visible ? "sales-timeline-bar--hidden" : ""}`}
      role="region"
      aria-label="Home sales year"
    >
      <span className="sales-timeline-label">Home sales · year</span>
      <button
        type="button"
        className="sales-timeline-play"
        onClick={onTogglePlay}
        aria-pressed={playing}
        title={playing ? "Pause" : "Play through years"}
      >
        {playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        className="sales-timeline-slider"
        min={minYear}
        max={maxYear}
        step={1}
        value={year}
        aria-valuemin={minYear}
        aria-valuemax={maxYear}
        aria-valuenow={year}
        aria-valuetext={`Year ${year}`}
        onChange={(e) => {
          onYearChange(Number(e.target.value));
        }}
      />
      <span className="sales-timeline-year" aria-live="polite">
        {year}
      </span>
    </div>
  );
}
