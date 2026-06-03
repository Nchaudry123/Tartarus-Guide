"use client";

import { FormEvent, useState } from "react";
import { Send, Sparkles } from "lucide-react";

export function ChatInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (question: string) => void;
  disabled?: boolean;
}) {
  const [question, setQuestion] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || disabled) {
      return;
    }
    setQuestion("");
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="flex items-stretch border-2 border-navy-950 bg-white shadow-[8px_9px_0_rgba(2,7,32,0.28)] focus-within:shadow-glow [clip-path:polygon(0_0,98%_0,100%_24%,97%_100%,0_100%)]">
        <div className="hidden items-center bg-navy-950 px-4 text-persona-cyan sm:flex">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <label className="sr-only" htmlFor="question">
          Ask a Persona 3 Reload question
        </label>
        <input
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={disabled}
          placeholder="Ask about weaknesses, bosses, fusion, Social Links..."
          className="min-h-14 flex-1 bg-white px-4 py-3 text-base font-bold text-navy-950 outline-none placeholder:text-blue-900/45 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={disabled || !question.trim()}
          className="flex min-w-16 items-center justify-center bg-persona-blue px-5 text-white transition hover:bg-navy-950 focus:outline-none focus:ring-2 focus:ring-persona-cyan disabled:cursor-not-allowed disabled:bg-blue-300"
          aria-label="Send question"
        >
          <Send className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </form>
  );
}
