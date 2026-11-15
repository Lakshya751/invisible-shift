import { animate, useMotionValue, useTransform, motion } from "framer-motion";
import { useEffect } from "react";

export function AnimatedNumber({ value, decimals = 0, suffix = "", className }: { value: number; decimals?: number; suffix?: string; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => `${v.toFixed(decimals)}${suffix}`);
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}
