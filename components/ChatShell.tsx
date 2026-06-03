"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Shield, Swords, Zap } from "lucide-react";
import { sendChatQuestion } from "../lib/chatApi";
import type { ChatMessage } from "../lib/types";
import { ChatInput } from "./ChatInput";
import { LoadingPersona } from "./LoadingPersona";
import { MessageBubble } from "./MessageBubble";
import { PersonaBackground } from "./PersonaBackground";
import { Sidebar } from "./Sidebar";
import { SuggestionButton } from "./SuggestionButton";

const suggestions = [
  { label: "Enemy Weakness", prompt: "What is Dancing Hand weak to?" },
  { label: "Boss Strategy", prompt: "How do I beat Priestess?" },
  { label: "Fusion Help", prompt: "How do I fuse Jack Frost?" },
  { label: "Social Links", prompt: "Which Social Links should I prioritize this week?" },
  { label: "Tartarus Prep", prompt: "What party should I use for Tartarus?" },
  { label: "Beginner Tips", prompt: "Give me beginner tips." },
];

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function ChatShell() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const conversationId = useRef(makeId());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const recentQuestions = useMemo(
    () =>
      messages
        .filter((message) => message.role === "user")
        .slice(-5)
        .map((message) => message.content)
        .reverse(),
    [messages],
  );

  async function ask(question: string) {
    const trimmed = question.trim();

    if (isLoading || !trimmed) {
      return;
    }

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };

    setMessages((current) => [...current, userMessage]);
    setIsLoading(true);

    try {
      const response = await sendChatQuestion({
        question: trimmed,
        conversationId: conversationId.current,
      });
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: response.answer,
          response,
          createdAt: Date.now(),
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: "The guide terminal could not reach the chat API. Check the dev server logs and try again.",
          response: {
            answer: "The guide terminal could not reach the chat API. Check the dev server logs and try again.",
            sources: [],
            confidence: 0,
            missingInfo: error instanceof Error ? error.message : "Unknown API error.",
          },
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isLoading]);

  return (
    <main className="relative min-h-svh overflow-hidden text-white">
      <PersonaBackground />
      <div className="flex min-h-svh flex-col gap-4 p-4 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:p-6">
        <Sidebar recentQuestions={recentQuestions} onPrompt={ask} />

        <section className="flex min-h-[calc(100svh-2rem)] flex-col pt-14 lg:min-h-[calc(100svh-3rem)] lg:pt-0">
          <header className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
            <div>
              <motion.p
                className="mb-2 inline-flex items-center gap-2 bg-navy-950 px-3 py-1 font-display text-xs italic uppercase tracking-[0.28em] text-persona-cyan [clip-path:polygon(0_0,94%_0,100%_100%,0_100%)]"
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <Zap className="h-3.5 w-3.5" aria-hidden />
                Strategy Terminal
              </motion.p>
              <motion.h1
                className="font-display text-6xl italic leading-[0.82] text-white drop-shadow-[8px_8px_0_rgba(2,7,32,0.5)] sm:text-7xl xl:text-8xl"
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.05 }}
              >
                Tartarus
                <span className="block text-persona-cyan">Guide</span>
              </motion.h1>
              <p className="mt-3 max-w-2xl text-lg font-black text-blue-50 sm:text-xl">
                Ask anything about Persona 3 Reload.
              </p>
            </div>

            <div className="hidden border-2 border-white bg-white px-4 py-3 text-navy-950 shadow-slash [clip-path:polygon(0_0,96%_0,100%_24%,94%_100%,0_100%)] md:block">
              <div className="mb-2 flex items-center gap-2 font-display text-sm italic uppercase tracking-wide text-persona-blue">
                <Shield className="h-4 w-4" aria-hidden />
                Source-backed mode
              </div>
              <p className="text-sm font-bold leading-snug text-navy-800">
                Preview uses mock answers. Add RAG credentials to switch the API route into live retrieval.
              </p>
            </div>
          </header>

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {suggestions.map((suggestion) => (
              <SuggestionButton key={suggestion.label} label={suggestion.label} onClick={() => ask(suggestion.prompt)} />
            ))}
          </div>

          <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden border border-white/20 bg-navy-950/42 shadow-2xl backdrop-blur-md">
            <div className="absolute inset-x-0 top-0 h-1 bg-persona-cyan" />
            <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5">
              {messages.length === 0 ? (
                <div className="grid min-h-[42vh] place-items-center text-center">
                  <div className="max-w-2xl">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-persona-cyan/50 bg-persona-cyan/10 shadow-glow">
                      <Swords className="h-8 w-8 text-persona-cyan" aria-hidden />
                    </div>
                    <h2 className="font-display text-4xl italic text-white sm:text-5xl">What do you need help with?</h2>
                    <p className="mx-auto mt-3 max-w-xl text-base font-bold text-blue-50/82">
                      Try asking for a weakness, boss strategy, fusion route, Social Link choice, Elizabeth request, or daily-life tip.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-5 pb-4">
                  <AnimatePresence initial={false}>
                    {messages.map((message) => (
                      <motion.div
                        key={message.id}
                        initial={{ y: 18, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <MessageBubble message={message} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {isLoading ? <LoadingPersona /> : null}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="sticky bottom-0 border-t border-white/15 bg-navy-950/78 p-3 backdrop-blur-xl sm:p-4">
              <ChatInput onSubmit={ask} disabled={isLoading} />
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
