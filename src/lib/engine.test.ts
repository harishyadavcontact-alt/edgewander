import { describe, expect, it } from "vitest";
import { seedExperiences } from "../data/experiences";
import { defaultMapRegions, resolveLocationContext } from "./spatial";
import type { RiskEnvelope, TravelerProfile, VisitReport } from "../types";
import { buildTrailResult, createTrailCache } from "./engine";

function baseProfile(overrides: Partial<TravelerProfile> = {}): TravelerProfile {
  return {
    destination: "Tokyo",
    tripStart: "2026-04-14",
    tripEnd: "2026-04-18",
    budgetBand: "steady",
    appetite: 72,
    noGos: [],
    interestTags: ["ritual", "architecture", "craft", "subculture"],
    ...overrides
  };
}

function baseRisk(overrides: Partial<RiskEnvelope> = {}): RiskEnvelope {
  return {
    timeOfDay: "afternoon",
    neighborhoodConfidence: 86,
    weather: "clear",
    transportExitQuality: 88,
    connectivity: "solid",
    legalConfidence: 97,
    consentConfidence: 97,
    soloSafetyScore: 86,
    ...overrides
  };
}

function collectedNodeIds(trail: ReturnType<typeof buildTrailResult>) {
  return trail.arcs.flatMap((arc) =>
    [arc.primaryNode.id, arc.guardian.node?.id, arc.expressive.node?.id, arc.driftCard?.node.id].filter(
      Boolean
    )
  );
}

function badReport(nodeId: string): VisitReport {
  return {
    nodeId,
    rewardRating: 1,
    stressRating: 5,
    consentClarity: 2,
    crowdVibe: "sharp",
    exitability: 1,
    wouldSoloAgain: false,
    note: "Felt unclear and hard to leave.",
    createdAt: "2026-03-07T12:00:00.000Z"
  };
}

describe("EdgeWander trail engine", () => {
  it("surfaces guardian and expressive branches together in safe daytime conditions", () => {
    const trail = buildTrailResult({
      profile: baseProfile({ appetite: 84 }),
      risk: baseRisk({ timeOfDay: "afternoon" }),
      locationContext: resolveLocationContext({
        destination: "Tokyo",
        cachedLocation: { lat: 35.6959, lng: 139.7576 }
      })
    });

    const hasDualBranch = trail.arcs.some(
      (arc) => arc.guardian.status === "available" && arc.expressive.status === "available"
    );

    expect(hasDualBranch).toBe(true);
    expect(trail.arcs).toHaveLength(3);
  });

  it("suppresses or downgrades expressive night branches when the safety envelope degrades", () => {
    const trail = buildTrailResult({
      profile: baseProfile({ appetite: 90 }),
      risk: baseRisk({
        timeOfDay: "night",
        neighborhoodConfidence: 64,
        transportExitQuality: 66,
        soloSafetyScore: 63,
        connectivity: "patchy",
        weather: "drizzle"
      }),
      locationContext: resolveLocationContext({
        destination: "Tokyo",
        cachedLocation: { lat: 35.7058, lng: 139.6499 }
      })
    });

    const afterglow = trail.arcs.find((arc) => arc.id === "afterglow");

    expect(afterglow).toBeDefined();
    expect(["fallback", "suppressed"]).toContain(afterglow!.expressive.status);
    expect(afterglow!.expressive.exitPlan.length).toBeGreaterThan(0);
  });

  it("keeps the red thread but swaps to cheaper nodes under a lean budget", () => {
    const flushTrail = buildTrailResult({
      profile: baseProfile({ budgetBand: "flush", appetite: 82 }),
      risk: baseRisk(),
      locationContext: resolveLocationContext({
        destination: "Tokyo",
        cachedLocation: { lat: 35.7114, lng: 139.7903 }
      })
    });
    const leanTrail = buildTrailResult({
      profile: baseProfile({ budgetBand: "lean", appetite: 82 }),
      risk: baseRisk(),
      locationContext: resolveLocationContext({
        destination: "Tokyo",
        cachedLocation: { lat: 35.7114, lng: 139.7903 }
      })
    });

    const leanNodes = collectedNodeIds(leanTrail)
      .map((id) => seedExperiences.find((node) => node.id === id))
      .filter(Boolean);

    expect(leanTrail.redThread).toBe(flushTrail.redThread);
    expect(leanNodes.every((node) => node!.costBand <= 1)).toBe(true);
  });

  it("never recommends nodes with uncertain legality or consent", () => {
    const trail = buildTrailResult({
      profile: baseProfile({ appetite: 95 }),
      risk: baseRisk(),
      locationContext: resolveLocationContext({
        destination: "Tokyo",
        cachedLocation: { lat: 35.6595, lng: 139.7005 }
      })
    });

    expect(collectedNodeIds(trail)).not.toContain("tokyo-unverified-rooftop-whisper");
  });

  it("uses cached trail state and keeps emergency essentials when connectivity drops offline", () => {
    const liveTrail = buildTrailResult({
      profile: baseProfile(),
      risk: baseRisk(),
      locationContext: resolveLocationContext({
        destination: "Tokyo",
        cachedLocation: { lat: 35.6959, lng: 139.7576 }
      }),
      mapRegion: defaultMapRegions.Tokyo
    });
    const cached = createTrailCache(liveTrail);
    const offlineTrail = buildTrailResult({
      profile: baseProfile(),
      risk: baseRisk({ connectivity: "offline" }),
      cache: cached,
      locationContext: resolveLocationContext({
        destination: "Tokyo",
        cachedLocation: { lat: 35.6959, lng: 139.7576 }
      }),
      mapRegion: defaultMapRegions.Tokyo
    });

    expect(offlineTrail.usedCache).toBe(true);
    expect(offlineTrail.arcs.map((arc) => arc.id)).toEqual(liveTrail.arcs.map((arc) => arc.id));
    expect(offlineTrail.emergencyEssentials.length).toBeGreaterThan(0);
    expect(offlineTrail.locationSource).toBe(cached.locationSource);
  });

  it("reroutes weirdness away from nightlife and remote areas when hard opt-outs are set", () => {
    const profile = baseProfile({
      destination: "Berlin",
      noGos: ["nightlife", "remote-areas"],
      interestTags: ["ritual", "architecture", "history", "subculture"]
    });
    const trail = buildTrailResult({
      profile,
      risk: baseRisk({ timeOfDay: "blue-hour" }),
      locationContext: resolveLocationContext({
        destination: "Berlin",
        cachedLocation: { lat: 52.52, lng: 13.405 }
      })
    });
    const selectedNodes = collectedNodeIds(trail)
      .map((id) => seedExperiences.find((node) => node.id === id))
      .filter(Boolean);

    expect(selectedNodes.some((node) => node!.interestTags.includes("architecture"))).toBe(true);
    expect(selectedNodes.every((node) => !node!.nightlife && !node!.remoteArea)).toBe(true);
  });

  it("quarantines nodes from future recommendations after repeated bad confessionals", () => {
    const profile = baseProfile({ appetite: 88 });
    const baseline = buildTrailResult({
      profile,
      risk: baseRisk(),
      locationContext: resolveLocationContext({
        destination: "Tokyo",
        cachedLocation: { lat: 35.6959, lng: 139.7576 }
      })
    });
    const expressiveCandidate = baseline.arcs.find(
      (arc) => arc.expressive.status === "available" && arc.expressive.node
    )?.expressive.node?.id;

    expect(expressiveCandidate).toBeDefined();

    const rerouted = buildTrailResult({
      profile,
      risk: baseRisk(),
      locationContext: resolveLocationContext({
        destination: "Tokyo",
        cachedLocation: { lat: 35.6959, lng: 139.7576 }
      }),
      reportMap: {
        [expressiveCandidate!]: [badReport(expressiveCandidate!), badReport(expressiveCandidate!)]
      }
    });

    expect(collectedNodeIds(rerouted)).not.toContain(expressiveCandidate);
  });

  it("suppresses distant nodes outside the active radius", () => {
    const trail = buildTrailResult({
      profile: baseProfile({ destination: "Tokyo", appetite: 95 }),
      risk: baseRisk(),
      locationContext: {
        ...resolveLocationContext({
          destination: "Tokyo",
          cachedLocation: { lat: 35.7148, lng: 139.7967 }
        }),
        walkRadiusKm: 1.2
      }
    });

    expect(collectedNodeIds(trail)).not.toContain("tokyo-koenji-vinyl-kissa");
  });

  it("never returns an expressive branch without route preview and exit confidence", () => {
    const trail = buildTrailResult({
      profile: baseProfile({ destination: "Berlin", appetite: 88 }),
      risk: baseRisk({ timeOfDay: "blue-hour" }),
      locationContext: resolveLocationContext({
        destination: "Berlin",
        cachedLocation: { lat: 52.52, lng: 13.405 }
      })
    });

    const expressive = trail.arcs.find((arc) => arc.expressive.status === "available")?.expressive;

    expect(expressive?.routePreview).toBeDefined();
    expect(expressive?.node?.exitConfidence ?? 0).toBeGreaterThanOrEqual(0.68);
  });

  it("uses city fallback location context when live geolocation is unavailable", () => {
    const locationContext = resolveLocationContext({
      destination: "New Orleans"
    });
    const trail = buildTrailResult({
      profile: baseProfile({ destination: "New Orleans" }),
      risk: baseRisk(),
      locationContext
    });

    expect(trail.locationSource).toBe("city-fallback");
    expect(trail.effectiveLocation).toEqual(defaultMapRegions["New Orleans"].center);
  });

  it("uses trip session quarantines and visits to shape later recommendations", () => {
    const trail = buildTrailResult({
      profile: baseProfile({ destination: "Berlin", appetite: 88 }),
      risk: baseRisk(),
      locationContext: resolveLocationContext({
        destination: "Berlin",
        cachedLocation: { lat: 52.52, lng: 13.405 }
      }),
      tripSession: {
        city: "Berlin",
        tripStartDate: "2026-04-14",
        activeTrailGeneratedAt: null,
        visitedNodes: ["berlin-mitte-alchemy-reading-room"],
        skippedNodes: [],
        quarantinedNodes: ["berlin-friedrichshain-code-and-candle-salon"],
        confessionals: [],
        lastKnownLocation: defaultMapRegions.Berlin.center,
        locationSource: "cached",
        lastMapRegion: defaultMapRegions.Berlin
      }
    });

    expect(collectedNodeIds(trail)).not.toContain("berlin-friedrichshain-code-and-candle-salon");
    expect(trail.locationSource).toBe("cached");
  });
});
