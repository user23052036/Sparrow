import type { ItemStatus } from "@sparrow/shared";

/** Today's tasks as birds perched on a branch; a bird fills in when its task is done. */
export function Branch({ items }: { items: { id: string; title: string; status: ItemStatus }[] }) {
  const W = 640;
  const H = 150;
  const n = Math.max(items.length, 1);
  const y = (x: number) => 112 + 10 * Math.sin((x / W) * Math.PI * 1.1);
  const done = items.filter((i) => i.status === "done").length;
  return (
    <svg className="branch" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${done} of ${items.length} done today`}>
      <defs>
        <linearGradient id="half" x1="0" x2="0" y1="0" y2="1">
          <stop offset="50%" stopColor="var(--surface)" />
          <stop offset="50%" stopColor="var(--sparrow)" />
        </linearGradient>
      </defs>
      <path className="wood" d={`M 8 ${y(8)} Q ${W / 2} ${y(W / 2) + 14} ${W - 8} ${y(W - 8) - 4}`} />
      <path className="twig" d={`M ${W * 0.78} ${y(W * 0.78)} q 18 -26 46 -30`} />
      <ellipse className="leaf" cx={W * 0.78 + 50} cy={y(W * 0.78) - 32} rx="13" ry="6" transform={`rotate(-20 ${W * 0.78 + 50} ${y(W * 0.78) - 32})`} />
      <ellipse className="leaf" cx={W * 0.12} cy={y(W * 0.12) + 12} rx="12" ry="5" transform={`rotate(25 ${W * 0.12} ${y(W * 0.12) + 12})`} />
      {items.map((it, i) => {
        const x = ((i + 0.5) / n) * (W - 80) + 40;
        const by = y(x) - 4;
        return (
          <g key={it.id} transform={`translate(${x - 22} ${by - 44})`}>
            <title>{`${it.title}: ${it.status}`}</title>
            <path className={`bird ${it.status}`} d="M6 34 Q8 14 24 11 Q36 9 38 19 L46 20 L38 24 Q36 36 22 38 Q12 39 6 34 Z M6 34 L-4 40 L8 39 Z" />
            <path className="beak" d="M38 19 L46 20 L38 24 Z" />
            <circle className="eye" cx="32" cy="17" r="1.8" />
            <path d="M18 38 v6 M26 38 v6" stroke="var(--sparrow)" strokeWidth="2" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}
