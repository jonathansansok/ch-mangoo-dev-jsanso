interface Props {
  done: number;
  total: number;
  size?: number;
  label?: string;
}

const STROKE = 5;

export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

export function CircularProgress({ done, total, size = 56, label }: Props) {
  const indeterminate = total <= 0;
  const pct = progressPercent(done, total);
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = indeterminate ? circumference * 0.25 : (pct / 100) * circumference;

  return (
    <div className="inline-flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total > 0 ? total : undefined}
        aria-valuenow={total > 0 ? done : undefined}
        className={indeterminate ? 'animate-spin' : undefined}
        style={indeterminate ? { animationDuration: '1.4s' } : undefined}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={STROKE}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e40af"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {!indeterminate && (
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            fontSize={size * 0.28}
            fontWeight={600}
            fill="#1f2937"
          >
            {pct}%
          </text>
        )}
      </svg>
      {label && <span className="text-xs text-[#65758b]">{label}</span>}
    </div>
  );
}
