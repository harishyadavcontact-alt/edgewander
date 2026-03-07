import {
  defaultMapRegions,
  buildRoutePreview,
  emergencyAnchorsByCity,
  nodeIsOpen,
  distanceKm
} from "../lib/spatial";
import {
  destinationEmergencyEssentials,
  destinationThemes,
  seedExperiences
} from "../data/experiences";
import type {
  BudgetBand,
  Coordinates,
  DriftCard,
  EmergencyAnchor,
  ExperienceNode,
  InterestTag,
  LocationContext,
  MapRegionCache,
  QuestArc,
  QuestBranch,
  ReviewSummary,
  RiskEnvelope,
  TrailCache,
  TrailResult,
  TravelerProfile,
  TripSession,
  VisitReport
} from "../types";

const budgetLimits: Record<BudgetBand, number> = {
  lean: 1,
  steady: 2,
  flush: 3
};

const themeSignals: Record<string, InterestTag[]> = {
  "Smoke, Ink, and Small Gods": ["ritual", "history", "subculture"],
  "Cities Beneath Cities": ["architecture", "subculture", "history"],
  "Midnight Craftsmanship": ["craft", "music", "food"],
  "Signals in Concrete": ["architecture", "subculture", "history"],
  "Cabinets of Rebellion": ["ritual", "history", "subculture"],
  "Afterimages and Airfields": ["architecture", "music", "history"],
  "Charms and Brass": ["music", "ritual", "food"],
  "Waterline Rituals": ["ritual", "architecture", "history"],
  "Stories After Midnight": ["subculture", "music", "history"]
};

const arcBlueprints = [
  {
    id: "first-omen",
    label: "First Omen",
    slot: "morning" as const,
    prompt: "Start in a room, lane, or courtyard that makes the city whisper before it performs.",
    focus: ["ritual", "history", "architecture"] as InterestTag[],
    allowDrift: false
  },
  {
    id: "cipher-run",
    label: "Cipher Run",
    slot: "afternoon" as const,
    prompt: "Move toward hands-on strangeness: a workshop, backroom archive, or local system with texture.",
    focus: ["craft", "subculture", "food"] as InterestTag[],
    allowDrift: true
  },
  {
    id: "threshold-hour",
    label: "Threshold Hour",
    slot: "blue-hour" as const,
    prompt: "Hold the line between daylight clarity and after-dark voltage.",
    focus: ["architecture", "music", "subculture"] as InterestTag[],
    allowDrift: true
  },
  {
    id: "afterglow",
    label: "Afterglow",
    slot: "night" as const,
    prompt: "Let the weirdness peak only if exits stay obvious and the room stays legible.",
    focus: ["music", "subculture", "history", "ritual"] as InterestTag[],
    allowDrift: false
  }
];

const slotHour: Record<"morning" | "afternoon" | "blue-hour" | "night", number> = {
  morning: 9,
  afternoon: 14,
  "blue-hour": 18,
  night: 21
};

const safeFallbackCopy = {
  guardian:
    "Guardian cut the voltage. Stay on a bright, staffed spine and keep the story alive without gambling on the downside.",
  expressive:
    "Daredevil found no legal, consent-clear swing worth taking inside the current safety envelope."
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeConfidence(value: number) {
  return clamp(value / 100, 0, 1);
}

function cityNodes(profile: TravelerProfile, catalog: ExperienceNode[]) {
  return catalog.filter((node) => node.city === profile.destination);
}

function slotRisk(
  risk: RiskEnvelope,
  slot: "morning" | "afternoon" | "blue-hour" | "night"
) {
  const nextRisk = { ...risk };

  if (slot === "blue-hour") {
    nextRisk.neighborhoodConfidence = clamp(nextRisk.neighborhoodConfidence - 4, 0, 100);
    nextRisk.transportExitQuality = clamp(nextRisk.transportExitQuality - 3, 0, 100);
  }

  if (slot === "night") {
    nextRisk.neighborhoodConfidence = clamp(nextRisk.neighborhoodConfidence - 10, 0, 100);
    nextRisk.transportExitQuality = clamp(nextRisk.transportExitQuality - 8, 0, 100);
    nextRisk.soloSafetyScore = clamp(nextRisk.soloSafetyScore - 10, 0, 100);
  }

  if (risk.timeOfDay === slot) {
    return nextRisk;
  }

  if (risk.timeOfDay === "night" && slot !== "night") {
    nextRisk.neighborhoodConfidence = clamp(nextRisk.neighborhoodConfidence - 6, 0, 100);
  }

  return nextRisk;
}

function scoreTheme(theme: string, profile: TravelerProfile) {
  const signals = themeSignals[theme] ?? [];
  return signals.reduce((score, signal) => {
    return score + (profile.interestTags.includes(signal) ? 2 : 0);
  }, 0);
}

export function pickRedThread(profile: TravelerProfile) {
  return destinationThemes[profile.destination]
    .slice()
    .sort((left, right) => scoreTheme(right, profile) - scoreTheme(left, profile))[0];
}

export function summarizeReports(reports: VisitReport[]): ReviewSummary {
  const averageReward = average(reports.map((report) => report.rewardRating));
  const averageStress = average(reports.map((report) => report.stressRating));
  const averageConsent = average(reports.map((report) => report.consentClarity));
  const averageExitability = average(reports.map((report) => report.exitability));
  const soloAgainRate =
    reports.length === 0
      ? 1
      : reports.filter((report) => report.wouldSoloAgain).length / reports.length;
  const quarantine =
    reports.length >= 2 &&
    ((averageStress >= 4.3 && averageExitability <= 2.6) ||
      averageConsent <= 2.8 ||
      soloAgainRate < 0.35);
  const caution =
    !quarantine &&
    reports.length > 0 &&
    (averageStress >= 3.6 || averageExitability <= 3.1 || soloAgainRate < 0.6);

  return {
    reportCount: reports.length,
    averageReward,
    averageStress,
    averageConsent,
    averageExitability,
    soloAgainRate,
    quarantine,
    caution
  };
}

function noGoBlocked(node: ExperienceNode, profile: TravelerProfile) {
  if (profile.noGos.includes("nightlife") && node.nightlife) {
    return true;
  }

  if (profile.noGos.includes("remote-areas") && node.remoteArea) {
    return true;
  }

  if (profile.noGos.includes("alcohol") && node.alcoholForward) {
    return true;
  }

  if (profile.noGos.includes("crowds") && (node.crowdIntensity ?? 0) >= 50) {
    return true;
  }

  return false;
}

function legalAndConsentClear(node: ExperienceNode, risk: RiskEnvelope) {
  return (
    node.legalConfidence >= 0.95 &&
    node.consentClarity >= 0.95 &&
    normalizeConfidence(risk.legalConfidence) >= 0.82 &&
    normalizeConfidence(risk.consentConfidence) >= 0.82
  );
}

function exitsRemainClean(node: ExperienceNode, risk: RiskEnvelope) {
  return (
    node.exitOptions.length > 0 &&
    node.transportExitQuality >= clamp(risk.transportExitQuality - 8, 0, 100) &&
    node.soloSafetyScore >= clamp(risk.soloSafetyScore - 8, 0, 100)
  );
}

function withinBudget(node: ExperienceNode, budgetBand: BudgetBand) {
  return node.costBand <= budgetLimits[budgetBand];
}

function expressiveAllowed(risk: RiskEnvelope, profile: TravelerProfile) {
  const envelopeFloor = Math.min(
    risk.neighborhoodConfidence,
    risk.transportExitQuality,
    risk.soloSafetyScore
  );

  if (risk.connectivity === "offline") {
    return false;
  }

  if (risk.weather === "storm") {
    return false;
  }

  if (risk.timeOfDay === "night" && envelopeFloor < 72) {
    return false;
  }

  return envelopeFloor >= 68 && profile.appetite >= 45;
}

function expressiveCap(risk: RiskEnvelope, profile: TravelerProfile) {
  let cap = 35 + profile.appetite * 0.45;

  if (risk.timeOfDay === "blue-hour") {
    cap -= 4;
  }

  if (risk.timeOfDay === "night") {
    cap -= 12;
  }

  if (risk.weather === "drizzle") {
    cap -= 5;
  }

  if (risk.weather === "storm") {
    cap -= 15;
  }

  if (risk.connectivity === "patchy") {
    cap -= 8;
  }

  if (risk.connectivity === "offline") {
    cap -= 18;
  }

  return clamp(cap, 28, 78);
}

function reviewPenalty(summary?: ReviewSummary) {
  if (!summary) {
    return 0;
  }

  if (summary.quarantine) {
    return 100;
  }

  if (summary.caution) {
    return 12;
  }

  return 0;
}

function themeMatch(node: ExperienceNode, redThread: string, focus: InterestTag[]) {
  const themeScore = node.themeTags.includes(redThread) ? 20 : 0;
  const focusScore = focus.reduce((score, tag) => {
    return score + (node.interestTags.includes(tag) ? 4 : 0);
  }, 0);

  return themeScore + focusScore;
}

function interestMatch(node: ExperienceNode, profile: TravelerProfile) {
  return node.interestTags.reduce((score, tag) => {
    return score + (profile.interestTags.includes(tag) ? 5 : 0);
  }, 0);
}

function guardianScore(
  node: ExperienceNode,
  profile: TravelerProfile,
  risk: RiskEnvelope,
  locationContext: LocationContext,
  redThread: string,
  focus: InterestTag[],
  summary?: ReviewSummary
) {
  const distancePenalty =
    distanceKm(locationContext.effectiveLocation, { lat: node.lat, lng: node.lng }) * 4.5;
  let score = 0;
  score += themeMatch(node, redThread, focus);
  score += interestMatch(node, profile);
  score += node.sourceTrustLevel * 28;
  score += node.soloSafetyScore * 0.25;
  score += node.transportExitQuality * 0.15;
  score -= node.edginess * 0.16;
  score -= distancePenalty;
  score -= Math.abs(node.neighborhoodFloor - risk.neighborhoodConfidence) * 0.04;
  score -= withinBudget(node, profile.budgetBand) ? 0 : 24;
  score -= reviewPenalty(summary);
  score += node.laneBias === "guardian" ? 10 : 0;
  return score;
}

function expressiveScore(
  node: ExperienceNode,
  profile: TravelerProfile,
  locationContext: LocationContext,
  redThread: string,
  focus: InterestTag[],
  summary?: ReviewSummary
) {
  const distancePenalty =
    distanceKm(locationContext.effectiveLocation, { lat: node.lat, lng: node.lng }) * 3.4;
  let score = 0;
  score += themeMatch(node, redThread, focus);
  score += interestMatch(node, profile);
  score += node.noveltyScore * 0.48;
  score += node.sourceTrustLevel * 18;
  score += profile.appetite * 0.22;
  score -= distancePenalty;
  score -= Math.max(node.costBand - budgetLimits[profile.budgetBand], 0) * 18;
  score -= reviewPenalty(summary);
  score += node.laneBias === "expressive" ? 12 : 0;
  return score;
}

function baseNodeFilter(
  node: ExperienceNode,
  profile: TravelerProfile,
  risk: RiskEnvelope,
  locationContext: LocationContext,
  slot: "morning" | "afternoon" | "blue-hour" | "night",
  summaries: Record<string, ReviewSummary>
) {
  if (node.city !== profile.destination) {
    return false;
  }

  if (!node.operatingWindows.includes(slot)) {
    return false;
  }

  if (!nodeIsOpen(node, slotHour[slot])) {
    return false;
  }

  if (noGoBlocked(node, profile)) {
    return false;
  }

  if (!legalAndConsentClear(node, risk)) {
    return false;
  }

  if (profile.budgetBand === "lean" && !withinBudget(node, profile.budgetBand)) {
    return false;
  }

  if (!exitsRemainClean(node, risk)) {
    return false;
  }

  if (node.exitConfidence < 0.68) {
    return false;
  }

  if (
    distanceKm(locationContext.effectiveLocation, { lat: node.lat, lng: node.lng }) >
    locationContext.walkRadiusKm
  ) {
    return false;
  }

  if (node.neighborhoodFloor > risk.neighborhoodConfidence) {
    return false;
  }

  if (summaries[node.id]?.quarantine) {
    return false;
  }

  return true;
}

function guardianCandidates(
  profile: TravelerProfile,
  catalog: ExperienceNode[],
  risk: RiskEnvelope,
  locationContext: LocationContext,
  slot: "morning" | "afternoon" | "blue-hour" | "night",
  summaries: Record<string, ReviewSummary>
) {
  return cityNodes(profile, catalog).filter((node) => {
    if (!baseNodeFilter(node, profile, risk, locationContext, slot, summaries)) {
      return false;
    }

    if (node.edginess > 58) {
      return false;
    }

    return true;
  });
}

function expressiveCandidates(
  profile: TravelerProfile,
  catalog: ExperienceNode[],
  risk: RiskEnvelope,
  locationContext: LocationContext,
  slot: "morning" | "afternoon" | "blue-hour" | "night",
  completedNodeIds: string[],
  summaries: Record<string, ReviewSummary>
) {
  const cap = expressiveCap(risk, profile);

  return cityNodes(profile, catalog).filter((node) => {
    if (!baseNodeFilter(node, profile, risk, locationContext, slot, summaries)) {
      return false;
    }

    if (node.edginess > cap) {
      return false;
    }

    if (!node.unlockAfter?.length) {
      return true;
    }

    return node.unlockAfter.every((requirement) => completedNodeIds.includes(requirement));
  });
}

function lockedExpressiveCandidates(
  profile: TravelerProfile,
  catalog: ExperienceNode[],
  risk: RiskEnvelope,
  locationContext: LocationContext,
  slot: "morning" | "afternoon" | "blue-hour" | "night",
  completedNodeIds: string[],
  summaries: Record<string, ReviewSummary>
) {
  return cityNodes(profile, catalog).filter((node) => {
    if (!baseNodeFilter(node, profile, risk, locationContext, slot, summaries)) {
      return false;
    }

    if (!node.unlockAfter?.length) {
      return false;
    }

    return !node.unlockAfter.every((requirement) => completedNodeIds.includes(requirement));
  });
}

function sortByScore<T extends ExperienceNode>(items: T[], score: (item: T) => number) {
  return items.slice().sort((left, right) => score(right) - score(left));
}

function exitPlanFor(node: ExperienceNode | undefined, destination: TravelerProfile["destination"]) {
  if (!node) {
    return destinationEmergencyEssentials[destination][0];
  }

  return node.exitOptions[0] ?? destinationEmergencyEssentials[destination][0];
}

function buildFallbackBranch(
  lane: "guardian" | "expressive",
  destination: TravelerProfile["destination"],
  status: QuestBranch["status"],
  reason: string
): QuestBranch {
  return {
    lane,
    status,
    rationale: lane === "guardian" ? safeFallbackCopy.guardian : safeFallbackCopy.expressive,
    exitPlan: destinationEmergencyEssentials[destination][0],
    suppressionReason: reason
  };
}

function buildDriftCard(
  profile: TravelerProfile,
  catalog: ExperienceNode[],
  risk: RiskEnvelope,
  locationContext: LocationContext,
  slot: "morning" | "afternoon" | "blue-hour" | "night",
  redThread: string,
  summaries: Record<string, ReviewSummary>
): DriftCard | undefined {
  if (!expressiveAllowed(risk, profile) || slot === "night") {
    return undefined;
  }

  const matches = cityNodes(profile, catalog)
    .filter((node) => {
      if (!node.driftTriggers) {
        return false;
      }

      if (!baseNodeFilter(node, profile, risk, locationContext, slot, summaries)) {
        return false;
      }

      const triggers = node.driftTriggers;
      if (triggers.timeOfDay && !triggers.timeOfDay.includes(slot)) {
        return false;
      }

      if (triggers.weather && !triggers.weather.includes(risk.weather)) {
        return false;
      }

      if (triggers.minAppetite && profile.appetite < triggers.minAppetite) {
        return false;
      }

      if (triggers.maxBudget && budgetLimits[profile.budgetBand] > triggers.maxBudget) {
        return false;
      }

      return node.themeTags.includes(redThread) || node.interestTags.some((tag) => profile.interestTags.includes(tag));
    })
    .sort((left, right) => right.noveltyScore - left.noveltyScore);

  const node = matches[0];
  if (!node) {
    return undefined;
  }

  return {
    title: `Drift Card: ${node.title}`,
    copy: `Weather, timing, and appetite lined up. This is the sanctioned detour that keeps the trip feeling alive.`,
    trigger: `${slot.replace("-", " ")} window + ${risk.weather} weather + appetite ${profile.appetite}`,
    node
  };
}

function buildArc(
  blueprint: (typeof arcBlueprints)[number],
  profile: TravelerProfile,
  catalog: ExperienceNode[],
  liveRisk: RiskEnvelope,
  locationContext: LocationContext,
  redThread: string,
  completedNodeIds: string[],
  summaries: Record<string, ReviewSummary>
): QuestArc {
  const risk = slotRisk(liveRisk, blueprint.slot);
  const guardians = sortByScore(
    guardianCandidates(profile, catalog, risk, locationContext, blueprint.slot, summaries),
    (node) =>
      guardianScore(node, profile, risk, locationContext, redThread, blueprint.focus, summaries[node.id])
  );
  const guardianNode = guardians[0];
  const guardian = guardianNode
    ? {
        lane: "guardian" as const,
        status: "available" as const,
        node: guardianNode,
        routePreview: buildRoutePreview(locationContext.effectiveLocation, guardianNode),
        rationale: "Guardian kept the route high-trust, well-lit, and recoverable without flattening the mood.",
        exitPlan: exitPlanFor(guardianNode, profile.destination)
      }
    : buildFallbackBranch(
        "guardian",
        profile.destination,
        "fallback",
        "No guardian node passed the current legality, safety, and exitability filters."
      );

  let expressive: QuestBranch;

  if (!expressiveAllowed(risk, profile)) {
    const downgradedNode = guardians[1] ?? guardianNode;
    expressive = downgradedNode
      ? {
          lane: "expressive",
          status: "fallback",
          node: downgradedNode,
          routePreview: buildRoutePreview(locationContext.effectiveLocation, downgradedNode),
          rationale: "Daredevil was clipped to a lower-voltage branch because the downside risk stopped being cheap.",
          exitPlan: exitPlanFor(downgradedNode, profile.destination),
          suppressionReason: "High-stakes conditions tightened the safety envelope."
        }
      : buildFallbackBranch(
          "expressive",
          profile.destination,
          "suppressed",
          "High-stakes conditions tightened the safety envelope."
        );
  } else {
    const expressiveNodes = sortByScore(
      expressiveCandidates(
        profile,
        catalog,
        risk,
        locationContext,
        blueprint.slot,
        completedNodeIds,
        summaries
      ),
      (node) =>
        expressiveScore(node, profile, locationContext, redThread, blueprint.focus, summaries[node.id])
    ).filter((node) => node.id !== guardianNode?.id);

    const expressiveNode = expressiveNodes[0];

    if (expressiveNode) {
      expressive = {
        lane: "expressive",
        status: "available",
        node: expressiveNode,
        routePreview: buildRoutePreview(locationContext.effectiveLocation, expressiveNode),
        rationale: "Daredevil found a higher-novelty branch that still leaves you an obvious way out.",
        exitPlan: exitPlanFor(expressiveNode, profile.destination)
      };
    } else {
      const lockedNode = sortByScore(
        lockedExpressiveCandidates(
          profile,
          catalog,
          risk,
          locationContext,
          blueprint.slot,
          completedNodeIds,
          summaries
        ),
        (node) =>
          expressiveScore(node, profile, locationContext, redThread, blueprint.focus, summaries[node.id])
      )[0];

      expressive = lockedNode
        ? {
            lane: "expressive",
            status: "locked",
            rationale: "Threshold rule engaged. Complete the safer precursor first, then the stranger room opens.",
            exitPlan: exitPlanFor(guardianNode ?? lockedNode, profile.destination),
            suppressionReason: `Unlock after: ${lockedNode.unlockAfter?.join(", ")}`
          }
        : buildFallbackBranch(
            "expressive",
            profile.destination,
            "suppressed",
            "No expressive branch stayed within the safety cap for this slot."
          );
    }
  }

  const fallbackNode =
    guardians.find((node) => node.id !== guardianNode?.id && node.id !== expressive.node?.id) ??
    guardianNode ??
    expressive.node;
  const fallback = fallbackNode
    ? {
        lane: "guardian" as const,
        status: "fallback" as const,
        node: fallbackNode,
        routePreview: buildRoutePreview(locationContext.effectiveLocation, fallbackNode),
        rationale: "Fallback holds the line if the voltage drops or timing shifts.",
        exitPlan: exitPlanFor(fallbackNode, profile.destination)
      }
    : buildFallbackBranch(
        "guardian",
        profile.destination,
        "fallback",
        "Fallback route unavailable in the current radius."
      );

  const primaryNode =
    guardianNode ??
    expressive.node ??
    cityNodes(profile, catalog).find((node) => node.operatingWindows.includes(blueprint.slot))!;
  const driftCard =
    blueprint.allowDrift && expressive.status === "available" && expressive.node
      ? buildDriftCard(profile, catalog, risk, locationContext, blueprint.slot, redThread, summaries)
      : undefined;

  return {
    id: blueprint.id,
    label: blueprint.label,
    theme: redThread,
    introCopy: blueprint.prompt,
    primaryNode,
    guardian,
    expressive,
    fallback,
    driftCard,
    unlockConditions: expressive.node?.unlockAfter ?? [],
    fallbackPath: destinationEmergencyEssentials[profile.destination][1]
  };
}

function reviewSummaries(reportMap: Record<string, VisitReport[]>) {
  return Object.fromEntries(
    Object.entries(reportMap).map(([nodeId, reports]) => [nodeId, summarizeReports(reports)])
  ) as Record<string, ReviewSummary>;
}

function activeBlueprints(timeOfDay: RiskEnvelope["timeOfDay"]) {
  if (timeOfDay === "night" || timeOfDay === "blue-hour") {
    return arcBlueprints.slice(1);
  }

  return arcBlueprints.slice(0, 3);
}

export function buildTrailResult(args: {
  profile: TravelerProfile;
  risk: RiskEnvelope;
  completedNodeIds?: string[];
  reportMap?: Record<string, VisitReport[]>;
  cache?: TrailCache | null;
  experienceCatalog?: ExperienceNode[];
  locationContext?: LocationContext;
  mapRegion?: MapRegionCache;
  tripSession?: TripSession;
}): TrailResult {
  const completedNodeIds = Array.from(
    new Set([...(args.completedNodeIds ?? []), ...(args.tripSession?.visitedNodes ?? [])])
  );
  const reportMap = args.reportMap ?? {};
  const summaries = reviewSummaries(reportMap);
  const catalog = args.experienceCatalog ?? seedExperiences;
  const locationContext = args.locationContext ?? {
    effectiveLocation: defaultMapRegions[args.profile.destination].center,
    cityAnchor: defaultMapRegions[args.profile.destination].center,
    walkRadiusKm: 4.8,
    source: "city-fallback" as const
  };
  const emergencyAnchors = emergencyAnchorsByCity[args.profile.destination];
  const mapRegion =
    args.mapRegion ?? {
      center: locationContext.effectiveLocation,
      zoom: defaultMapRegions[args.profile.destination].zoom
    };

  for (const nodeId of args.tripSession?.quarantinedNodes ?? []) {
    summaries[nodeId] = {
      reportCount: 0,
      averageReward: 0,
      averageStress: 5,
      averageConsent: 0,
      averageExitability: 0,
      soloAgainRate: 0,
      quarantine: true,
      caution: false
    };
  }

  if (
    args.risk.connectivity === "offline" &&
    args.cache &&
    args.cache.destination === args.profile.destination
  ) {
    return {
      ...args.cache,
      emergencyEssentials: destinationEmergencyEssentials[args.profile.destination],
      emergencyAnchors,
      usedCache: true
    };
  }

  const redThread = pickRedThread(args.profile);
  const arcs = activeBlueprints(args.risk.timeOfDay).map((blueprint) =>
    buildArc(
      blueprint,
      args.profile,
      catalog,
      args.risk,
      locationContext,
      redThread,
      completedNodeIds,
      summaries
    )
  );

  return {
    destination: args.profile.destination,
    redThread,
    generatedAt: new Date().toISOString(),
    arcs,
    emergencyEssentials: destinationEmergencyEssentials[args.profile.destination],
    emergencyAnchors,
    locationSource: locationContext.source,
    effectiveLocation: locationContext.effectiveLocation,
    mapRegion,
    usedCache: false
  };
}

export function createTrailCache(trail: TrailResult): TrailCache {
  return {
    destination: trail.destination,
    redThread: trail.redThread,
    generatedAt: trail.generatedAt,
    arcs: trail.arcs,
    emergencyEssentials: trail.emergencyEssentials,
    emergencyAnchors: trail.emergencyAnchors,
    locationSource: trail.locationSource,
    effectiveLocation: trail.effectiveLocation,
    mapRegion: trail.mapRegion
  };
}
