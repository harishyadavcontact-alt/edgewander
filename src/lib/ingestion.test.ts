import { describe, expect, it } from "vitest";
import { seedExperiences } from "../data/experiences";
import type { IngestionCandidate } from "../types";
import { buildTrailResult } from "./engine";
import {
  buildCandidateMatches,
  canPublishCandidate,
  candidateDraftFromSource,
  freshnessStateFromTimestamp,
  nodeInvariantFailures,
  publishInvariantFailures,
  publishCandidateToCatalog,
  reverifyPublishedNode
} from "./ingestion";
import { resolveLocationContext } from "./spatial";

function baseCandidate(overrides: Partial<IngestionCandidate> = {}): IngestionCandidate {
  return {
    id: "candidate-tokyo-annex",
    city: "Tokyo",
    query: "folklore bookstore",
    sourceType: "google-places",
    sourceId: "google_tokyo_annex",
    title: "Jimbocho Folklore Annex",
    category: "Specialty bookstore",
    neighborhood: "Jimbocho",
    lat: 35.6968,
    lng: 139.7581,
    areaRadius: 420,
    sourceUpdatedAt: "2026-03-08T09:00:00.000Z",
    verificationStatus: "pending",
    editorialStatus: "review",
    trustSignals: {
      sourceConfidence: 0.84,
      freshnessConfidence: 0.88,
      locationConfidence: 0.94,
      operationalConfidence: 0.82
    },
    placeMetadata: {
      address: "Jimbocho, Chiyoda City, Tokyo"
    },
    matches: [],
    importedAt: "2026-03-08T09:00:00.000Z",
    ...overrides
  };
}

describe("Google Places ingestion pipeline", () => {
  it("dedupes obvious matches against the catalog by geo/title similarity", () => {
    const matches = buildCandidateMatches(
      {
        sourceId: "google_tokyo_occult_stack",
        title: "Jimbocho Occult Stack",
        lat: 35.696,
        lng: 139.758
      },
      seedExperiences
    );

    expect(matches[0]?.nodeId).toBe("tokyo-jimbocho-occult-stack");
    expect(matches[0]?.score).toBeGreaterThan(0.38);
  });

  it("blocks publication when Guardian-critical review fields are missing", () => {
    const draft = candidateDraftFromSource(baseCandidate());
    draft.themeTags = [];
    draft.exitOptions = [];

    expect(canPublishCandidate(draft)).toBe(false);
    expect(publishInvariantFailures(draft)).toContain("At least one Red Thread theme tag is required.");
    expect(() =>
      publishCandidateToCatalog({
        candidate: baseCandidate(),
        draft,
        catalog: seedExperiences
      })
    ).toThrow(/Guardian fields/i);
  });

  it("publishes an approved candidate into the live catalog with google provenance", () => {
    const candidate = baseCandidate();
    const draft = candidateDraftFromSource(candidate);
    draft.themeTags = ["Cities Beneath Cities"];
    draft.interestTags = ["subculture", "history"];
    draft.narrativeHook = "A verified basement stack that now has an editorial frame and a clean exit.";
    draft.exitOptions = ["Station concourse", "Staffed hotel lobby"];
    draft.laneBias = "expressive";

    const publication = publishCandidateToCatalog({
      candidate,
      draft,
      catalog: seedExperiences
    });
    const publishedNode = publication.nextCatalog.find((node) => node.id === publication.published.nodeId);

    expect(publishedNode?.sourceType).toBe("google-places");
    expect(publishedNode?.verificationStatus).toBe("approved");
    expect(publishedNode?.editorialStatus).toBe("approved");
    expect(publishedNode?.trustSignals.freshnessConfidence).toBeGreaterThan(0.8);
  });

  it("lets approved candidate nodes flow through the live trail engine", () => {
    const candidate = baseCandidate();
    const draft = candidateDraftFromSource(candidate);
    draft.themeTags = ["Cities Beneath Cities"];
    draft.interestTags = ["subculture", "history"];
    draft.narrativeHook = "A verified editorialized backroom stack in Jimbocho.";
    draft.exitOptions = ["Station concourse", "Staffed hotel lobby"];
    draft.laneBias = "expressive";
    draft.edginess = 34;

    const publication = publishCandidateToCatalog({
      candidate,
      draft,
      catalog: seedExperiences
    });

    const trail = buildTrailResult({
      profile: {
        destination: "Tokyo",
        tripStart: "2026-04-14",
        tripEnd: "2026-04-18",
        budgetBand: "steady",
        appetite: 75,
        noGos: [],
        interestTags: ["subculture", "history", "ritual", "architecture"]
      },
      risk: {
        timeOfDay: "afternoon",
        neighborhoodConfidence: 86,
        weather: "clear",
        transportExitQuality: 88,
        connectivity: "solid",
        legalConfidence: 97,
        consentConfidence: 97,
        soloSafetyScore: 86
      },
      experienceCatalog: publication.nextCatalog,
      locationContext: resolveLocationContext({
        destination: "Tokyo",
        cachedLocation: { lat: 35.6968, lng: 139.7581 }
      })
    });

    const surfacedIds = trail.arcs.flatMap((arc) => [
      arc.primaryNode.id,
      arc.guardian.node?.id,
      arc.expressive.node?.id,
      arc.fallback.node?.id
    ]);

    expect(surfacedIds).toContain(publication.published.nodeId);
  });

  it("re-verifies published nodes without clobbering editorial framing", () => {
    const candidate = baseCandidate({ sourceUpdatedAt: "2025-01-01T00:00:00.000Z" });
    const draft = candidateDraftFromSource(candidate);
    draft.themeTags = ["Cities Beneath Cities"];
    draft.interestTags = ["subculture", "history"];
    draft.narrativeHook = "A verified editorialized backroom stack in Jimbocho.";
    draft.exitOptions = ["Station concourse", "Staffed hotel lobby"];

    const publication = publishCandidateToCatalog({
      candidate,
      draft,
      catalog: seedExperiences
    });

    const reverified = reverifyPublishedNode({
      nodeId: publication.published.nodeId,
      catalog: publication.nextCatalog,
      publishedSources: [publication.published],
      note: "Fresh hours confirmed against source.",
      verifiedAt: "2026-03-08T12:00:00.000Z"
    });
    const node = reverified.nextCatalog.find((entry) => entry.id === publication.published.nodeId);
    const sourceRecord = reverified.nextPublishedSources.find(
      (entry) => entry.nodeId === publication.published.nodeId
    );

    expect(node?.narrativeHook).toBe(draft.narrativeHook);
    expect(node?.sourceUpdatedAt).toBe("2026-03-08T12:00:00.000Z");
    expect(sourceRecord?.lastVerifiedAt).toBe("2026-03-08T12:00:00.000Z");
    expect(freshnessStateFromTimestamp(node?.sourceUpdatedAt)).toBe("fresh");
  });

  it("audits published nodes for invariant drift using the same Guardian publication rules", () => {
    const brokenNode = {
      ...seedExperiences.find((node) => node.id === "tokyo-jimbocho-occult-stack")!,
      themeTags: [],
      exitOptions: [],
      legalConfidence: 0.7
    };

    const failures = nodeInvariantFailures(brokenNode);

    expect(failures).toContain("At least one Red Thread theme tag is required.");
    expect(failures).toContain("At least one explicit exit option is required.");
    expect(failures).toContain("Legal confidence must be at least 0.95.");
  });
});
