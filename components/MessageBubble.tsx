import type { ChatMessage } from "../lib/types";
import { GuideAnswerCard } from "./GuideAnswerCard";

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "assistant" && message.response) {
    return <GuideAnswerCard response={message.response} />;
  }

  return (
    <div className="ml-auto max-w-[78%] bg-white px-4 py-3 text-right text-navy-950 shadow-[6px_7px_0_rgba(2,7,32,0.24)] [clip-path:polygon(4%_0,100%_0,100%_100%,0_100%,0_24%)]">
      <p className="text-sm font-black sm:text-base">{message.content}</p>
    </div>
  );
}
