import "dotenv/config";
import { createChatCompletion } from "./db/client.js";
import { buildContext, formatContext } from "./retrieval/buildContext.js";

const query = process.argv.slice(2).join(" ").trim();

const answerSystemPrompt = `You answer Persona 3 Reload guide questions using only the retrieved context.

Style:
- Sound like a veteran Persona 3 Reload player.
- Be direct, practical, strategy-first, and easy to understand.
- Use short steps when useful.

Accuracy rules:
- Use structured facts first, then retrieved chunks.
- Include source URLs.
- If exact weaknesses, fusions, deadlines, floor info, or boss strategy are missing, say so clearly.
- Do not invent game facts or fill gaps from memory.`;

async function main(): Promise<void> {
  if (!query) {
    throw new Error('Usage: npm run ask -- "What is Dancing Hand weak to?"');
  }

  const context = await buildContext(query);
  const answer = await createChatCompletion([
    { role: "system", content: answerSystemPrompt },
    {
      role: "user",
      content: `Question: ${query}\n\n${formatContext(context)}\n\nAnswer using only this context.`,
    },
  ]);

  console.log(answer);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
