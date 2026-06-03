import { AlertTriangle, BadgeCheck } from "lucide-react";
import type { ChatResponse } from "../lib/types";
import { SourceCard } from "./SourceCard";
import { WeaknessTable } from "./WeaknessTable";

export function GuideAnswerCard({ response }: { response: ChatResponse }) {
  return (
    <article className="max-w-3xl border-2 border-white/70 bg-navy-950/82 p-4 text-white shadow-[10px_12px_0_rgba(255,255,255,0.18)] backdrop-blur-md [clip-path:polygon(0_0,98%_0,100%_4%,100%_100%,2%_100%,0_94%)] sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-4 border-b border-persona-cyan/35 pb-3">
        <div>
          <p className="font-display text-xs italic uppercase tracking-[0.24em] text-persona-cyan">Guide Response</p>
          <h2 className="font-display text-2xl italic leading-none text-white sm:text-3xl">Analysis</h2>
        </div>
        {typeof response.confidence === "number" ? (
          <div className="border border-persona-cyan/50 bg-persona-cyan/10 px-3 py-2 text-right">
            <span className="block text-[10px] font-black uppercase tracking-wide text-persona-cyan">Confidence</span>
            <span className="font-display text-lg italic">{Math.round(response.confidence * 100)}%</span>
          </div>
        ) : null}
      </div>

      <p className="mb-4 text-base font-semibold leading-relaxed text-persona-ice">{response.answer}</p>

      {response.missingInfo ? (
        <div className="mb-4 flex gap-3 border border-yellow-200/55 bg-yellow-300/10 p-3 text-sm text-yellow-50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-200" aria-hidden />
          <p className="font-semibold">{response.missingInfo}</p>
        </div>
      ) : null}

      {response.sections?.length ? (
        <div className="mb-4 grid gap-3">
          {response.sections.map((section) => (
            <section key={section.title} className="border-l-4 border-persona-cyan bg-white/8 px-4 py-3">
              <h3 className="mb-1 flex items-center gap-2 font-display text-lg italic text-white">
                <BadgeCheck className="h-4 w-4 text-persona-cyan" aria-hidden />
                {section.title}
              </h3>
              <p className="text-sm font-medium leading-relaxed text-blue-50/88">{section.content}</p>
            </section>
          ))}
        </div>
      ) : null}

      {response.tables?.length ? (
        <div className="mb-4 grid gap-4">
          {response.tables.map((table) => (
            <WeaknessTable key={table.title} table={table} />
          ))}
        </div>
      ) : null}

      {response.sources.length ? (
        <footer>
          <h3 className="mb-2 font-display text-sm italic uppercase tracking-[0.2em] text-persona-cyan">Sources</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {response.sources.map((source) => (
              <SourceCard key={source.url} source={source} />
            ))}
          </div>
        </footer>
      ) : null}
    </article>
  );
}
