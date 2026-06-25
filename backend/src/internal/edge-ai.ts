export type ThreatPriority = "CRITICAL" | "HIGH" | "LOW";
export type RouteTo = "NSS" | "POLICE" | "ANTI-CORRUPTION" | "SPAM";

export interface ThreatAnalysis {
  priority: ThreatPriority;
  category: string;
  summary: string;
  routeTo: RouteTo;
}

interface ThreatRule {
  keywords: string[];
  priority: ThreatPriority;
  category: string;
  routeTo: RouteTo;
}

const THREAT_RULES: ThreatRule[] = [
  {
    keywords: [
      "weapon",
      "gun",
      "bomb",
      "explosive",
      "murder",
      "kill",
      "terrorist",
      "assassination",
      "hostage",
    ],
    priority: "CRITICAL",
    category: "National Security / Violence",
    routeTo: "NSS",
  },
  {
    keywords: [
      "bribe",
      "corruption",
      "kickback",
      "embezzle",
      "fraud",
      "graft",
      "extortion",
    ],
    priority: "HIGH",
    category: "Corruption & Financial Crime",
    routeTo: "ANTI-CORRUPTION",
  },
  {
    keywords: [
      "drug",
      "narcotic",
      "cocaine",
      "heroin",
      "trafficking",
      "meth",
      "cartel",
    ],
    priority: "HIGH",
    category: "Narcotics & Trafficking",
    routeTo: "POLICE",
  },
  {
    keywords: [
      "assault",
      "robbery",
      "theft",
      "kidnap",
      "abduction",
      "rape",
      "stabbing",
    ],
    priority: "HIGH",
    category: "Violent Crime",
    routeTo: "POLICE",
  },
];

const SPAM_INDICATORS = ["test message", "lorem ipsum", "hello world", "asdf"];

const PRIORITY_WEIGHT: Record<ThreatPriority, number> = {
  CRITICAL: 3,
  HIGH: 2,
  LOW: 1,
};

function matchedKeywords(text: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword));
}

/**
 * Offline Edge AI simulator — keyword-based threat triage.
 * No external API calls; runs entirely on the air-gapped internal node.
 */
export function analyzeThreatLevel(text: string): ThreatAnalysis {
  const normalized = text.toLowerCase().trim();

  if (!normalized) {
    return {
      priority: "LOW",
      category: "Empty Report",
      summary: "No analyzable content received.",
      routeTo: "SPAM",
    };
  }

  if (
    normalized.length < 40 &&
    SPAM_INDICATORS.some((indicator) => normalized.includes(indicator))
  ) {
    return {
      priority: "LOW",
      category: "Low Signal / Spam",
      summary: "Short message with low-signal content. Deprioritized.",
      routeTo: "SPAM",
    };
  }

  let bestMatch: { rule: ThreatRule; matches: string[]; score: number } | null =
    null;

  for (const rule of THREAT_RULES) {
    const matches = matchedKeywords(normalized, rule.keywords);
    if (matches.length === 0) {
      continue;
    }

    const score = matches.length * PRIORITY_WEIGHT[rule.priority];
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { rule, matches, score };
    }
  }

  if (bestMatch) {
    const { rule, matches } = bestMatch;
    return {
      priority: rule.priority,
      category: rule.category,
      summary: `Matched indicators: ${matches.join(", ")}. Flagged for immediate analyst review.`,
      routeTo: rule.routeTo,
    };
  }

  return {
    priority: "LOW",
    category: "General Intelligence",
    summary: "No high-risk keywords detected. Queued for standard review.",
    routeTo: "POLICE",
  };
}
