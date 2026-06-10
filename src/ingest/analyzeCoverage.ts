import { mkdir, readFile, writeFile } from "node:fs/promises";

type CoverageArea = {
  id: string;
  label: string;
  sources: number;
  chunks: number;
  embeddedChunks: number;
  facts: number;
  sourcedEntities: number;
  totalTypedEntities: number;
  domains: Record<string, number>;
  factTypes: Record<string, number>;
  sourcesWithoutChunks: Array<{ title: string; url: string; domain: string }>;
  sourcesWithoutFacts: Array<{ title: string; url: string; domain: string }>;
};

type CoverageReport = {
  generatedAt: string;
  totals: {
    sources: number;
    chunks: number;
    embeddedChunks: number;
    entities: number;
    facts: number;
  };
  areas: CoverageArea[];
};

type AreaRequirement = {
  minimumSources: number;
  requiredDomains: string[];
  minimumFactTypes: Record<string, number>;
  maximumNoFactSourceRatio: number;
};

const requirements: Record<string, AreaRequirement> = {
  enemies: {
    minimumSources: 20,
    requiredDomains: ["ign.com", "game8.co"],
    minimumFactTypes: { weakness: 20, resistance: 10, location: 20 },
    maximumNoFactSourceRatio: 0.5,
  },
  bosses: {
    minimumSources: 24,
    requiredDomains: ["ign.com", "game8.co"],
    minimumFactTypes: { weakness: 8, resistance: 12, strategy: 12, recommended_party: 6 },
    maximumNoFactSourceRatio: 0.5,
  },
  social_links: {
    minimumSources: 22,
    requiredDomains: ["ign.com", "game8.co"],
    minimumFactTypes: { unlock_condition: 20, schedule: 20, reward: 20, answer_choice: 40 },
    maximumNoFactSourceRatio: 0.45,
  },
  requests: {
    minimumSources: 15,
    requiredDomains: ["ign.com", "game8.co"],
    minimumFactTypes: { deadline: 20, reward: 20, prerequisite: 30, strategy: 20 },
    maximumNoFactSourceRatio: 0.5,
  },
  calendars: {
    minimumSources: 24,
    requiredDomains: ["ign.com", "game8.co"],
    minimumFactTypes: { schedule: 30, answer_choice: 30, unlock_condition: 12 },
    maximumNoFactSourceRatio: 0.5,
  },
  tartarus: {
    minimumSources: 20,
    requiredDomains: ["ign.com", "game8.co"],
    minimumFactTypes: { floor_range: 12, weakness: 40, location: 12 },
    maximumNoFactSourceRatio: 0.5,
  },
  personas: {
    minimumSources: 20,
    requiredDomains: ["ign.com", "game8.co", "aqiu384.github.io"],
    minimumFactTypes: {
      fusion_recipe: 500,
      unlock_condition: 50,
      weakness: 100,
      resistance: 100,
    },
    maximumNoFactSourceRatio: 0.5,
  },
};

type Gap = {
  kind: "source-count" | "domain" | "fact-type" | "source-facts" | "embedding";
  severity: "critical" | "high" | "medium";
  message: string;
  deficit?: number;
};

function severityForRatio(ratio: number): Gap["severity"] {
  if (ratio >= 0.75) return "critical";
  if (ratio >= 0.6) return "high";
  return "medium";
}

function analyzeArea(area: CoverageArea): {
  id: string;
  label: string;
  status: "healthy" | "weak";
  score: number;
  gaps: Gap[];
  prioritySources: CoverageArea["sourcesWithoutFacts"];
} {
  const requirement = requirements[area.id];
  if (!requirement) {
    return { id: area.id, label: area.label, status: "healthy", score: 1, gaps: [], prioritySources: [] };
  }

  const gaps: Gap[] = [];
  if (area.sources < requirement.minimumSources) {
    gaps.push({
      kind: "source-count",
      severity: area.sources < requirement.minimumSources / 2 ? "high" : "medium",
      message: `${area.sources}/${requirement.minimumSources} minimum sources indexed`,
      deficit: requirement.minimumSources - area.sources,
    });
  }
  for (const domain of requirement.requiredDomains) {
    if (!area.domains[domain]) {
      gaps.push({
        kind: "domain",
        severity: "high",
        message: `No coverage from required domain ${domain}`,
      });
    }
  }
  for (const [factType, minimum] of Object.entries(requirement.minimumFactTypes)) {
    const actual = area.factTypes[factType] ?? 0;
    if (actual < minimum) {
      const ratio = actual / minimum;
      gaps.push({
        kind: "fact-type",
        severity: ratio < 0.35 ? "critical" : ratio < 0.7 ? "high" : "medium",
        message: `${factType}: ${actual}/${minimum} exact facts`,
        deficit: minimum - actual,
      });
    }
  }
  const noFactRatio = area.sources ? area.sourcesWithoutFacts.length / area.sources : 1;
  if (noFactRatio > requirement.maximumNoFactSourceRatio) {
    gaps.push({
      kind: "source-facts",
      severity: severityForRatio(noFactRatio),
      message:
        `${area.sourcesWithoutFacts.length}/${area.sources} sources have no structured facts ` +
        `(${Math.round(noFactRatio * 100)}%)`,
    });
  }
  if (area.embeddedChunks < area.chunks) {
    gaps.push({
      kind: "embedding",
      severity: "critical",
      message: `${area.chunks - area.embeddedChunks} chunks are missing embeddings`,
      deficit: area.chunks - area.embeddedChunks,
    });
  }

  const weightedPenalty = gaps.reduce((sum, gap) => {
    if (gap.severity === "critical") return sum + 0.22;
    if (gap.severity === "high") return sum + 0.13;
    return sum + 0.07;
  }, 0);

  return {
    id: area.id,
    label: area.label,
    status: gaps.length ? "weak" : "healthy",
    score: Math.max(0, Number((1 - weightedPenalty).toFixed(2))),
    gaps,
    prioritySources: area.sourcesWithoutFacts.slice(0, 20),
  };
}

function markdownFor(report: CoverageReport, findings: ReturnType<typeof analyzeArea>[]): string {
  const lines = [
    "# Persona 3 Reload Knowledge Coverage Gaps",
    "",
    `Generated from the Supabase audit at ${report.generatedAt}.`,
    "",
    "| Area | Status | Score | Primary gaps |",
    "| --- | --- | ---: | --- |",
    ...findings.map((finding) => {
      const gaps = finding.gaps.slice(0, 4).map((gap) => gap.message).join("; ") || "None";
      return `| ${finding.label} | ${finding.status} | ${Math.round(finding.score * 100)}% | ${gaps} |`;
    }),
    "",
  ];

  for (const finding of findings.filter((item) => item.gaps.length)) {
    lines.push(`## ${finding.label}`, "");
    for (const gap of finding.gaps) {
      lines.push(`- **${gap.severity.toUpperCase()}** ${gap.message}`);
    }
    if (finding.prioritySources.length) {
      lines.push("", "Priority pages already indexed but missing exact facts:");
      for (const source of finding.prioritySources.slice(0, 10)) {
        lines.push(`- [${source.title}](${source.url}) (${source.domain})`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const coveragePath = process.argv.find((arg) => arg.startsWith("--coverage="))?.split("=")[1] ??
    "evals/results/coverage-latest.json";
  const report = JSON.parse(await readFile(coveragePath, "utf8")) as CoverageReport;
  const findings = report.areas
    .map(analyzeArea)
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
  const output = {
    generatedAt: new Date().toISOString(),
    basedOnCoverageAudit: report.generatedAt,
    weakAreas: findings.filter((finding) => finding.status === "weak").map((finding) => finding.id),
    findings,
  };

  await mkdir("evals/results", { recursive: true });
  await Promise.all([
    writeFile("evals/results/coverage-gaps-latest.json", JSON.stringify(output, null, 2)),
    writeFile("evals/results/coverage-gaps-latest.md", markdownFor(report, findings)),
  ]);

  console.log(`Coverage gap analysis based on ${report.generatedAt}:`);
  for (const finding of findings) {
    console.log(
      `${finding.status === "healthy" ? "OK  " : "WEAK"} ${finding.label.padEnd(14)} ` +
        `score=${String(Math.round(finding.score * 100)).padStart(3)}% gaps=${finding.gaps.length}`,
    );
    for (const gap of finding.gaps.slice(0, 4)) {
      console.log(`     ${gap.severity.padEnd(8)} ${gap.message}`);
    }
  }
  console.log("\nReports written to evals/results/coverage-gaps-latest.{json,md}");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
