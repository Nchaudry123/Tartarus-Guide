import { createHash } from "node:crypto";
import type { ExtractedPage, TextChunk } from "../types/schema.js";

const MIN_TOKENS = 300;
const MAX_TOKENS = 700;
const TARGET_TOKENS = 520;

export const estimateTokens = (text: string): number =>
  Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 0.75));

const hashChunk = (sourceUrl: string, sectionTitle: string, text: string): string =>
  createHash("sha256")
    .update(`${sourceUrl}\n${sectionTitle}\n${text}`)
    .digest("hex");

export function chunkExtractedPage(page: ExtractedPage): TextChunk[] {
  const chunks: TextChunk[] = [];

  for (const section of page.sections) {
    const paragraphs = section.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    let buffer: string[] = [];
    let bufferTokens = 0;

    const flush = () => {
      if (buffer.length === 0) {
        return;
      }
      const text = buffer.join("\n");
      const tokenCount = estimateTokens(text);
      if (tokenCount >= 80) {
        chunks.push({
          source: page.source,
          pageTitle: page.pageTitle,
          sectionTitle: section.title,
          text,
          tokenCount,
          hash: hashChunk(page.source.url, section.title, text),
        });
      }
      buffer = [];
      bufferTokens = 0;
    };

    for (const paragraph of paragraphs) {
      const tokens = estimateTokens(paragraph);
      if (bufferTokens + tokens > MAX_TOKENS && bufferTokens >= MIN_TOKENS) {
        flush();
      }

      buffer.push(paragraph);
      bufferTokens += tokens;

      if (bufferTokens >= TARGET_TOKENS) {
        flush();
      }
    }

    flush();
  }

  return chunks;
}
