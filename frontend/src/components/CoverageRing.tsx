import { motion } from "framer-motion";
import { AnimatedNumber } from "./AnimatedNumber";

export function CoverageRing({ percent, size = 148, stroke = 12, label = "coverage" }: { percent: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = percent >= 90 ? "#16a34a" : percent >= 70 ? "#0d9488" : percent >= 50 ? "#d97706" : "#dc2626";
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${percent}% ${label}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - percent / 100), stroke: color }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedNumber value={percent} decimals={percent % 1 ? 1 : 0} suffix="%" className="text-3xl font-semibold tracking-tight text-ink tabular-nums" />
        <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
    </div>
  );
}
