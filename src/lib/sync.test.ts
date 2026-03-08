import { describe, expect, it } from "vitest";
import type {
  EditorialState,
  RemoteEditorialStateRecord,
  RemoteTripSessionRecord,
  RemoteTravelerProfileRecord,
  TravelerProfile,
  TravelerState,
  TripSession,
  VisitReport
} from "../types";
import {
  defaultSyncMetadata,
  mergeEditorialState,
  mergeReportMap,
  mergeTravelerState,
  mergeTripSession
} from "./sync";

function profile(overrides: Partial<TravelerProfile> = {}): TravelerProfile {
  return {
    destination: "Tokyo",
    tripStart: "2026-04-14",
    tripEnd: "2026-04-18",
    budgetBand: "steady",
    appetite: 70,
    noGos: [],
    interestTags: ["ritual", "history"],
    ...overrides
  };
}

function report(nodeId: string, createdAt: string, rewardRating = 4): VisitReport {
  return {
    nodeId,
    rewardRating,
    stressRating: 2,
    consentClarity: 5,
    crowdVibe: "warm",
    exitability: 4,
    wouldSoloAgain: true,
    note: "",
    createdAt
  };
}

function travelerState(overrides: Partial<TravelerState> = {}): TravelerState {
  return {
    profile: profile(),
    completedNodeIds: ["tokyo-sensoji-shadow-bell"],
    reportMap: {
      "tokyo-sensoji-shadow-bell": [report("tokyo-sensoji-shadow-bell", "2026-03-07T10:00:00.000Z")]
    },
    ...overrides
  };
}

function tripSession(overrides: Partial<TripSession> = {}): TripSession {
  return {
    city: "Tokyo",
    tripStartDate: "2026-04-14",
    activeTrailGeneratedAt: "2026-03-07T10:30:00.000Z",
    visitedNodes: ["tokyo-sensoji-shadow-bell"],
    skippedNodes: [],
    quarantinedNodes: [],
    confessionals: ["tokyo-sensoji-shadow-bell:2026-03-07T10:00:00.000Z"],
    lastKnownLocation: { lat: 35.71, lng: 139.79 },
    locationSource: "live",
    lastMapRegion: {
      center: { lat: 35.71, lng: 139.79 },
      zoom: 13
    },
    ...overrides
  };
}

function editorialState(overrides: Partial<EditorialState> = {}): EditorialState {
  return {
    ingestionCandidates: [
      {
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
        sourceUpdatedAt: "2026-03-08T08:00:00.000Z",
        verificationStatus: "pending",
        editorialStatus: "review",
        trustSignals: {
          sourceConfidence: 0.84,
          freshnessConfidence: 0.88,
          locationConfidence: 0.94,
          operationalConfidence: 0.82
        },
        matches: [],
        importedAt: "2026-03-08T08:00:00.000Z"
      }
    ],
    publishedSources: [],
    ...overrides
  };
}

describe("EdgeWander sync merge policy", () => {
  it("dedupes confessionals by node id and timestamp", () => {
    const merged = mergeReportMap(
      {
        node: [report("node", "2026-03-07T10:00:00.000Z"), report("node", "2026-03-07T11:00:00.000Z")]
      },
      {
        node: [report("node", "2026-03-07T10:00:00.000Z"), report("node", "2026-03-07T12:00:00.000Z", 5)]
      }
    );

    expect(merged.node).toHaveLength(3);
    expect(merged.node.map((entry) => entry.createdAt)).toEqual([
      "2026-03-07T10:00:00.000Z",
      "2026-03-07T11:00:00.000Z",
      "2026-03-07T12:00:00.000Z"
    ]);
  });

  it("prefers newer remote profile while unioning completed nodes and report history", () => {
    const local = travelerState();
    const remote: RemoteTravelerProfileRecord = {
      traveler_id: "anon-1",
      updated_at: "2026-03-08T09:00:00.000Z",
      payload_json: travelerState({
        profile: profile({ destination: "Berlin", appetite: 82 }),
        completedNodeIds: ["berlin-mitte-alchemy-reading-room"],
        reportMap: {
          "berlin-mitte-alchemy-reading-room": [
            report("berlin-mitte-alchemy-reading-room", "2026-03-08T08:30:00.000Z", 5)
          ]
        }
      })
    };

    const merged = mergeTravelerState(local, "2026-03-08T08:00:00.000Z", remote);

    expect(merged.travelerState.profile.destination).toBe("Berlin");
    expect(merged.travelerState.completedNodeIds).toEqual([
      "tokyo-sensoji-shadow-bell",
      "berlin-mitte-alchemy-reading-room"
    ]);
    expect(Object.keys(merged.travelerState.reportMap)).toEqual([
      "tokyo-sensoji-shadow-bell",
      "berlin-mitte-alchemy-reading-room"
    ]);
    expect(merged.updatedAt).toBe("2026-03-08T09:00:00.000Z");
  });

  it("unions visited, skipped, quarantined, and confessionals across local and remote trip sessions", () => {
    const remote: RemoteTripSessionRecord = {
      traveler_id: "anon-1",
      city: "Tokyo",
      trip_start_date: "2026-04-14",
      updated_at: "2026-03-08T09:15:00.000Z",
      payload_json: tripSession({
        visitedNodes: ["tokyo-midnight-incense-lab"],
        skippedNodes: ["tokyo-kanda-hidden-ink-bar"],
        quarantinedNodes: ["tokyo-yanaka-crow-lore-walk"],
        confessionals: ["tokyo-midnight-incense-lab:2026-03-08T09:00:00.000Z"],
        locationSource: "cached"
      })
    };

    const merged = mergeTripSession(tripSession(), "2026-03-08T08:30:00.000Z", remote);

    expect(merged.tripSession.visitedNodes).toEqual([
      "tokyo-sensoji-shadow-bell",
      "tokyo-midnight-incense-lab"
    ]);
    expect(merged.tripSession.skippedNodes).toEqual(["tokyo-kanda-hidden-ink-bar"]);
    expect(merged.tripSession.quarantinedNodes).toEqual(["tokyo-yanaka-crow-lore-walk"]);
    expect(merged.tripSession.confessionals).toEqual([
      "tokyo-sensoji-shadow-bell:2026-03-07T10:00:00.000Z",
      "tokyo-midnight-incense-lab:2026-03-08T09:00:00.000Z"
    ]);
    expect(merged.tripSession.locationSource).toBe("cached");
  });

  it("keeps local data intact when there is no remote record yet", () => {
    const metadata = defaultSyncMetadata();
    const mergedTraveler = mergeTravelerState(travelerState(), metadata.travelerStateUpdatedAt, null);
    const mergedTrip = mergeTripSession(tripSession(), metadata.tripSessionUpdatedAt, null);
    const mergedEditorial = mergeEditorialState(
      editorialState(),
      metadata.editorialStateUpdatedAt,
      null
    );

    expect(mergedTraveler.travelerState.completedNodeIds).toEqual(["tokyo-sensoji-shadow-bell"]);
    expect(mergedTrip.tripSession.visitedNodes).toEqual(["tokyo-sensoji-shadow-bell"]);
    expect(mergedEditorial.editorialState.ingestionCandidates).toHaveLength(1);
    expect(mergedTrip.updatedAt).toBeNull();
  });

  it("merges editorial state candidates and published mappings across local and remote", () => {
    const remote: RemoteEditorialStateRecord = {
      traveler_id: "anon-1",
      updated_at: "2026-03-08T10:00:00.000Z",
      payload_json: {
        ingestionCandidates: [
          {
            ...editorialState().ingestionCandidates[0],
            id: "candidate-tokyo-kagurazaka",
            sourceId: "google_tokyo_kagurazaka",
            title: "Kagurazaka Paper Courtyard",
            importedAt: "2026-03-08T09:00:00.000Z"
          }
        ],
        publishedSources: [
          {
            nodeId: "tokyo-jimbocho-occult-stack",
            sourceType: "google-places",
            sourceId: "google_tokyo_occult_stack",
            publishedAt: "2026-03-08T09:30:00.000Z"
          }
        ]
      }
    };

    const merged = mergeEditorialState(
      editorialState(),
      "2026-03-08T08:30:00.000Z",
      remote
    );

    expect(merged.editorialState.ingestionCandidates).toHaveLength(2);
    expect(merged.editorialState.publishedSources).toHaveLength(1);
    expect(merged.updatedAt).toBe("2026-03-08T10:00:00.000Z");
  });
});
