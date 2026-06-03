import * as cheerio from "cheerio";
import type { ExtractedPage, SourceInput } from "../types/schema.js";

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
  "[class*='ad']",
  "[id*='ad']",
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

export function extractContent(source: SourceInput, html: string): ExtractedPage {
  const $ = cheerio.load(html);
  junkSelectors.forEach((selector) => $(selector).remove());

  const pageTitle =
    normalizeText($("h1").first().text()) ||
    normalizeText($("title").first().text()) ||
    source.title;

  const root =
    contentSelectors.map((selector) => $(selector).first()).find((node) => node.length > 0) ??
    $("body");

  const sections: ExtractedPage["sections"] = [];
  let currentTitle = pageTitle;
  let currentLines: string[] = [];
  const seen = new Set<string>();

  root.find("h1,h2,h3,h4,p,li,td,th").each((_, element) => {
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
