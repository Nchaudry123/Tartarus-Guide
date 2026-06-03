import { ExternalLink } from "lucide-react";
import type { ChatSource } from "../lib/types";

export function SourceCard({ source }: { source: ChatSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="group flex min-w-0 items-center justify-between gap-3 border border-persona-cyan/45 bg-white/90 px-3 py-2 text-navy-950 transition hover:bg-persona-ice focus:outline-none focus:ring-2 focus:ring-persona-cyan [clip-path:polygon(0_0,96%_0,100%_32%,96%_100%,0_100%)]"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-black">{source.title}</span>
        <span className="block text-xs font-bold uppercase tracking-wide text-navy-800/70">{source.domain}</span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" aria-hidden />
    </a>
  );
}
