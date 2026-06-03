import { motion } from "framer-motion";

export function LoadingPersona() {
  return (
    <div className="flex items-center gap-3 rounded-none border border-persona-cyan/50 bg-navy-950/72 px-4 py-3 text-persona-ice shadow-glow backdrop-blur">
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((item) => (
          <motion.span
            key={item}
            className="block h-7 w-2 -skew-x-[24deg] bg-persona-cyan"
            animate={{ scaleY: [0.45, 1, 0.45], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.75, repeat: Infinity, delay: item * 0.12 }}
          />
        ))}
      </div>
      <span className="font-display text-sm italic uppercase tracking-wide">Scanning Tartarus records...</span>
    </div>
  );
}
