import { readFile } from "node:fs/promises";

type GapReport = {
  weakAreas?: string[];
  findings?: Array<{ id: string; status: "healthy" | "weak"; score: number }>;
};

const categoriesByArea: Record<string, string[]> = {
  enemies: ["enemies"],
  bosses: ["bosses"],
  social_links: ["social_links"],
  requests: ["requests"],
  calendars: ["walkthrough", "classroom"],
  tartarus: ["tartarus"],
  personas: ["personas", "fusion"],
};

export async function loadGapTargetCategories(
  reportPath = "evals/results/coverage-gaps-latest.json",
  areaLimit?: number,
): Promise<{ areas: string[]; categories: string[] }> {
  const report = JSON.parse(await readFile(reportPath, "utf8")) as GapReport;
  const rankedWeakAreas = report.findings
    ?.filter((finding) => finding.status === "weak")
    .sort((a, b) => a.score - b.score)
    .map((finding) => finding.id);
  const weakAreas = rankedWeakAreas?.length ? rankedWeakAreas : report.weakAreas ?? [];
  const areas = typeof areaLimit === "number" ? weakAreas.slice(0, areaLimit) : weakAreas;
  const categories = [...new Set(areas.flatMap((area) => categoriesByArea[area] ?? []))];
  if (!categories.length) {
    throw new Error(`No weak coverage areas with ingestible categories were found in ${reportPath}.`);
  }
  return { areas, categories };
}
