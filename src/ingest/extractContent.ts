import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { ExtractedPage, SourceInput } from "../types/schema";

const junkSelectors = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "nav",
  "footer",
  "header",
  "aside",
  "form",
  "[class~='ad']",
  "[class^='ad-']",
  "[id^='ad-']",
  "[data-ad]",
  "[class*='comment']",
  "[id*='comment']",
  "[class*='breadcrumb']",
  "[class*='related']",
  "[class*='newsletter']",
  "[class*='video']",
  "[class*='share']",
];

const contentSelectors = [
  "article",
  "main",
  ".article-content",
  ".wiki-page",
  ".page-content",
  "#content",
  "body",
];

const normalizeText = (value: string): string =>
  value.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();

function replaceTablesWithReadableRows($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>): void {
  root.find("table").each((_, table) => {
    const rows = $(table)
      .find("tr")
      .map((__, row) => {
        const cells = $(row)
          .children("th,td")
          .map((___, cell) => normalizeText($(cell).text()))
          .get()
          .filter(Boolean);
        const kind = $(row).children("th").length > 0 ? "header" : "value";
        return { cells, kind };
      })
      .get()
      .filter((row) => row.cells.length > 0);

    const lines: string[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const next = rows[index + 1];
      if (
        row.kind === "header" &&
        next?.kind === "value" &&
        row.cells.length === next.cells.length
      ) {
        lines.push(row.cells.map((label, cellIndex) => `${label}: ${next.cells[cellIndex]}`).join(" | "));
        index += 1;
      } else {
        lines.push(row.cells.join(" | "));
      }
    }

    if (lines.length > 0) {
      const replacement = $("<p></p>").text(`Table data: ${lines.join(" || ")}`);
      $(table).replaceWith(replacement);
    }
  });
}

function isMarkdown(value: string): boolean {
  return /^Title:\s|^Markdown Content:|^#{1,4}\s+/m.test(value) && !/<(?:html|body|article)\b/i.test(value);
}

function extractMarkdownContent(source: SourceInput, markdown: string): ExtractedPage {
  const metadataTitle = markdown.match(/^Title:\s*(.+)$/m)?.[1];
  const content = markdown
    .replace(/^Title:\s*.*$/gm, "")
    .replace(/^URL Source:\s*.*$/gm, "")
    .replace(/^Published Time:\s*.*$/gm, "")
    .replace(/^Markdown Content:\s*$/gm, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\((?:https?:)?\/\/[^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ");

  const pageTitle = normalizeText(metadataTitle ?? source.title);
  const sections: ExtractedPage["sections"] = [];
  let currentTitle = pageTitle;
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.map(normalizeText).filter((line) => line.length >= 20).join("\n");
    if (text.length >= 80) sections.push({ title: currentTitle, text });
    currentLines = [];
  };

  for (const rawLine of content.split(/\n+/)) {
    const heading = rawLine.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      flush();
      currentTitle = normalizeText(heading[1]);
      continue;
    }
    const line = rawLine
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
      .replace(/\|/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) currentLines.push(line);
  }
  flush();

  return { source, pageTitle, sections };
}

export function extractContent(source: SourceInput, html: string): ExtractedPage {
  if (isMarkdown(html)) {
    return extractMarkdownContent(source, html);
  }

  const $ = cheerio.load(html);
  junkSelectors.forEach((selector) => $(selector).remove());

  const pageTitle =
    normalizeText($("h1").filter((_, element) => normalizeText($(element).text()).length > 0).first().text()) ||
    normalizeText($("title").first().text()) ||
    source.title;

  const game8Root = new URL(source.url).hostname.replace(/^www\./, "") === "game8.co"
    ? $(".archive-style-wrapper").first()
    : null;
  const root = game8Root?.length
    ? game8Root
    : contentSelectors.map((selector) => $(selector).first()).find((node) => node.length > 0) ??
      $("body");

  replaceTablesWithReadableRows($, root);

  const sections: ExtractedPage["sections"] = [];
  let currentTitle = pageTitle;
  let currentLines: string[] = [];
  const seen = new Set<string>();

  root.find("h1,h2,h3,h4,p,li").each((_, element) => {
    const tag = element.tagName.toLowerCase();
    const text = normalizeText($(element).text());
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);

    if (/^h[1-4]$/.test(tag)) {
      if (currentLines.length > 0) {
        sections.push({ title: currentTitle, text: currentLines.join("\n") });
      }
      currentTitle = text;
      currentLines = [];
      return;
    }

    if (text.length >= 20) {
      currentLines.push(text);
    }
  });

  if (currentLines.length > 0) {
    sections.push({ title: currentTitle, text: currentLines.join("\n") });
  }

  return { source, pageTitle, sections };
}
