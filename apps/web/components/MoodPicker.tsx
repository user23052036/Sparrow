import { MOODS } from "@/lib/format";

export function MoodPicker({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) {
  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 700, marginBottom: "0.4rem" }}>{label}</legend>
      <div className="row" role="radiogroup">
        {MOODS.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={value === m.value} aria-pressed={value === m.value} onClick={() => onChange(m.value)}>
            {m.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
