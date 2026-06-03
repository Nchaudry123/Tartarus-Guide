"use client";

import { BookOpen, ChevronLeft, Menu, Moon, Swords, Users, WandSparkles } from "lucide-react";
import { useState } from "react";

const categories = [
  { label: "Shadows", icon: Swords, prompt: "What enemy weaknesses should I know early?" },
  { label: "Bosses", icon: Moon, prompt: "How do I prepare for the next full moon boss?" },
  { label: "Personas", icon: WandSparkles, prompt: "How should I think about fusion upgrades?" },
  { label: "Social Links", icon: Users, prompt: "Which Social Links should I prioritize?" },
  { label: "Requests", icon: BookOpen, prompt: "What Elizabeth requests are worth doing early?" },
  { label: "Tartarus", icon: Swords, prompt: "What should I bring before a Tartarus run?" },
];

export function Sidebar({
  recentQuestions,
  onPrompt,
}: {
  recentQuestions: string[];
  onPrompt: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-40 border border-white/60 bg-navy-950/75 p-3 text-white shadow-glow backdrop-blur lg:hidden"
        aria-label="Open quick menu"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[82vw] max-w-80 border-r border-white/20 bg-navy-950/88 p-5 text-white shadow-2xl backdrop-blur-xl transition-transform duration-300 lg:static lg:z-auto lg:h-auto lg:w-72 lg:max-w-none lg:translate-x-0 lg:border lg:bg-navy-950/60 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-xs italic uppercase tracking-[0.26em] text-persona-cyan">Quick Menu</p>
            <h2 className="font-display text-3xl italic leading-none">Records</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 text-white/80 hover:text-persona-cyan lg:hidden"
            aria-label="Close quick menu"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="grid gap-2">
          {categories.map(({ label, icon: Icon, prompt }) => (
            <button
              type="button"
              key={label}
              onClick={() => {
                setOpen(false);
                onPrompt(prompt);
              }}
              className="group flex items-center gap-3 bg-white px-3 py-3 text-left font-display text-sm italic text-navy-950 transition hover:translate-x-1 hover:bg-persona-ice focus:outline-none focus:ring-2 focus:ring-persona-cyan [clip-path:polygon(0_0,96%_0,100%_30%,95%_100%,0_100%)]"
            >
              <Icon className="h-4 w-4 text-persona-blue" aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        <section className="mt-8">
          <h3 className="mb-3 font-display text-sm italic uppercase tracking-[0.2em] text-persona-cyan">Recent</h3>
          <div className="grid gap-2">
            {recentQuestions.length ? (
              recentQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onPrompt(question);
                  }}
                  className="border border-white/20 bg-white/8 px-3 py-2 text-left text-sm font-semibold text-blue-50 transition hover:border-persona-cyan hover:bg-persona-cyan/10"
                >
                  {question}
                </button>
              ))
            ) : (
              <p className="border border-white/15 bg-white/5 px-3 py-3 text-sm font-semibold text-blue-100/70">
                Your last questions will appear here.
              </p>
            )}
          </div>
        </section>
      </aside>
      {open ? <button className="fixed inset-0 z-40 bg-black/55 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu" /> : null}
    </>
  );
}
