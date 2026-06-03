"use client";

import { motion } from "framer-motion";

const shards = [
  "left-[8%] top-[18%] h-6 w-12 rotate-12 bg-persona-cyan",
  "left-[18%] top-[74%] h-5 w-10 -rotate-45 bg-fuchsia-500",
  "left-[68%] top-[14%] h-7 w-14 rotate-[28deg] bg-white",
  "left-[82%] top-[66%] h-5 w-12 -rotate-12 bg-persona-cyan",
  "left-[55%] top-[84%] h-4 w-9 rotate-[38deg] bg-fuchsia-400",
  "left-[92%] top-[26%] h-5 w-10 rotate-[60deg] bg-white",
];

export function PersonaBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-white">
      <div className="absolute inset-0 bg-[linear-gradient(113deg,#ffffff_0_18%,#39e8ff_18.3%,#0976ff_42%,#061ac0_100%)]" />
      <div className="absolute -left-[14vw] top-[-14vh] h-[66vh] w-[74vw] rounded-br-[100%] bg-[linear-gradient(180deg,#59f9ff,#0845e7_70%,#04136f)] opacity-95" />
      <div className="absolute left-[34vw] top-0 h-full w-[42vw] -skew-x-[24deg] bg-navy-950/72" />
      <div className="absolute bottom-[-14vh] right-[-8vw] h-[62vh] w-[52vw] -rotate-12 bg-white" />
      <div className="absolute left-[-6vw] top-[58vh] h-40 w-[64vw] -rotate-6 bg-white" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_30%,rgba(85,247,255,0.32),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(2,7,32,0.22))]" />
      <div className="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(88,247,255,0.48),transparent)] blur-sm" />
      <motion.div
        aria-hidden
        className="absolute right-[9vw] top-[8vh] font-display text-[18vw] italic leading-none text-white/18"
        animate={{ x: [0, 18, 0], opacity: [0.12, 0.2, 0.12] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      >
        GUIDE
      </motion.div>
      <motion.div
        aria-hidden
        className="absolute -left-10 bottom-[5vh] font-display text-[16vw] italic leading-none text-black/20"
        animate={{ x: [0, -14, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      >
        TARTARUS
      </motion.div>
      {shards.map((className, index) => (
        <motion.span
          key={className}
          className={`absolute block opacity-70 mix-blend-screen [clip-path:polygon(14%_0,100%_10%,76%_100%,0_78%)] ${className}`}
          animate={{ y: [0, index % 2 ? -16 : 18, 0], x: [0, index % 2 ? 10 : -8, 0] }}
          transition={{ duration: 3.5 + index * 0.35, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <div className="absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.08)_0_1px,transparent_1px_5px)] opacity-40" />
    </div>
  );
}
