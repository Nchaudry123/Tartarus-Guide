import { createHash } from "node:crypto";
import type { ExtractedPage, TextChunk } from "../types/schema";

const MIN_TOKENS = 240;
const MAX_TOKENS = 700;
const TARGET_TOKENS = 500;

export const estimateTokens = (text: string): number =>
  Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 0.75));

const hashChunk = (sourceUrl: string, sectionTitle: string, text: string): string =>
  createHash("sha256")
    .update(`${sourceUrl}\n${sectionTitle}\n${text}`)
    .digest("hex");

export function chunkExtractedPage(page: ExtractedPage): TextChunk[] {
  const chunks: TextChunk[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;
  let sectionTitles: string[] = [];

  const flush = () => {
    if (!buffer.length) return;
    const text = buffer.join("\n");
    const tokenCount = estimateTokens(text);
    if (tokenCount >= 70) {
      const sectionTitle = [...new Set(sectionTitles)].slice(0, 3).join(" / ") || page.pageTitle;
      chunks.push({
        source: page.source,
        pageTitle: page.pageTitle,
        sectionTitle,
        text,
        tokenCount,
        hash: hashChunk(page.source.url, sectionTitle, text),
      });
    }
    buffer = [];
    bufferTokens = 0;
    sectionTitles = [];
  };

  for (const section of page.sections) {
    const paragraphs = section.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      const labeledParagraph =
        sectionTitles.at(-1) === section.title ? paragraph : `[${section.title}]\n${paragraph}`;
      const tokens = estimateTokens(labeledParagraph);

      if (bufferTokens + tokens > MAX_TOKENS && bufferTokens >= MIN_TOKENS) flush();

      buffer.push(labeledParagraph);
      bufferTokens += tokens;
      sectionTitles.push(section.title);

      if (bufferTokens >= TARGET_TOKENS) flush();
    }
  }

  flush();
  return chunks;
}
