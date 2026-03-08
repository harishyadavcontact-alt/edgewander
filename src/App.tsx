import { useEffect, useRef, useState, useTransition } from "react";
import { MapExplorer } from "./components/MapExplorer";
import { allInterests } from "./data/experiences";
import { buildNodeId, cloneSeedCatalog, defaultExperienceDraft, validateCatalog } from "./lib/catalog";
import { buildTrailResult, createTrailCache, summarizeReports } from "./lib/engine";
import {
  applyCandidateDecision,
  candidateDraftFromSource,
  freshnessStateFromTimestamp,
  importGooglePlacesCandidates,
  nodeInvariantFailures,
  publishInvariantFailures,
  publishCandidateToCatalog,
  reverifyPublishedNode,
  trustBadgeForNode
} from "./lib/ingestion";
import { defaultMapRegions, emergencyAnchorsByCity, resolveLocationContext } from "./lib/spatial";
import {
  buildEditorialState,
  buildTravelerState,
  loadCompletedNodeIds,
  loadEmergencyAnchors,
  loadExperienceCatalog,
  loadIngestionCandidates,
  loadLastLocation,
  loadMapRegion,
  loadProfile,
  loadPublishedSources,
  loadReportMap,
  loadSyncIdentity,
  loadSyncMetadata,
  loadTrailCache,
  loadTripSession,
  saveCompletedNodeIds,
  saveEmergencyAnchors,
  saveExperienceCatalog,
  saveIngestionCandidates,
  saveLastLocation,
  saveMapRegion,
  saveProfile,
  savePublishedSources,
  saveReportMap,
  saveSyncIdentity,
  saveSyncMetadata,
  saveTrailCache,
  saveTripSession
} from "./lib/storage";
import {
  defaultSyncMetadata,
  isSyncConfigured,
  syncEdgeWanderState
} from "./lib/sync";
import type {
  BranchStatus,
  Coordinates,
  CrowdVibe,
  Destination,
  EmergencyAnchor,
  ExperienceNode,
  IngestionCandidate,
  InterestTag,
  MapRegionCache,
  NoGo,
  PublishedSourceRecord,
  QuestLogEntry,
  QuestArc,
  QuestBranch,
  RecommendationTrace,
  RiskEnvelope,
  SyncIdentity,
  SyncMetadata,
  SyncStatus,
  TimeOfDay,
  TravelerProfile,
  TripSession,
  VisitReport
} from "./types";

const defaultProfile: TravelerProfile = {
  destination: "Tokyo",
  tripStart: "2026-04-14",
  tripEnd: "2026-04-18",
  budgetBand: "steady",
  appetite: 68,
  noGos: [],
  interestTags: ["ritual", "architecture", "craft", "subculture"]
};

const defaultRisk: RiskEnvelope = {
  timeOfDay: "afternoon",
  neighborhoodConfidence: 81,
  weather: "clear",
  transportExitQuality: 84,
  connectivity: "solid",
  legalConfidence: 96,
  consentConfidence: 97,
  soloSafetyScore: 83
};

const interestLabels: Record<InterestTag, string> = {
  ritual: "Ritual",
  architecture: "Architecture",
  craft: "Craft",
  subculture: "Subculture",
  food: "Food",
  music: "Music",
  history: "History"
};

const noGoLabels: Record<NoGo, string> = {
  nightlife: "No nightlife",
  "remote-areas": "No remote areas",
  alcohol: "No alcohol-forward stops",
  crowds: "No crowd crush"
};

const timeLabels: Record<TimeOfDay, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  "blue-hour": "Blue hour",
  night: "Night"
};

function defaultReviewDraft() {
  return {
    rewardRating: 4,
    stressRating: 2,
    consentClarity: 5,
    crowdVibe: "warm" as CrowdVibe,
    exitability: 4,
    wouldSoloAgain: true,
    note: ""
  };
}

function defaultTripSession(
  destination: Destination,
  tripStartDate: string,
  mapRegion: MapRegionCache
): TripSession {
  return {
    city: destination,
    tripStartDate,
    activeTrailGeneratedAt: null,
    visitedNodes: [],
    skippedNodes: [],
    quarantinedNodes: [],
    confessionals: [],
    lastKnownLocation: mapRegion.center,
    locationSource: "city-fallback",
    lastMapRegion: mapRegion
  };
}

function formatSyncTime(value: string | null) {
  if (!value) {
    return "Not synced yet";
  }

  return new Date(value).toLocaleString();
}

function defaultImportQuery(destination: Destination) {
  return {
    city: destination,
    query: ""
  };
}

function App() {
  const syncEnabled = isSyncConfigured();
  const initialCatalog = loadExperienceCatalog(cloneSeedCatalog());
  const initialProfile = loadProfile(defaultProfile);
  const initialReports = loadReportMap();
  const initialCompleted = loadCompletedNodeIds();
  const initialCache = loadTrailCache();
  const initialLastLocation = loadLastLocation();
  const initialMapRegion = loadMapRegion(defaultMapRegions[initialProfile.destination]);
  const initialTripSession = loadTripSession(
    defaultTripSession(initialProfile.destination, initialProfile.tripStart, initialMapRegion)
  );
  const initialSyncIdentity = loadSyncIdentity();
  const initialSyncMetadata = loadSyncMetadata(defaultSyncMetadata());
  const initialCandidates = loadIngestionCandidates();
  const initialPublishedSources = loadPublishedSources();
  const initialEmergencyAnchors = loadEmergencyAnchors(
    emergencyAnchorsByCity[initialProfile.destination]
  );
  const initialLocationContext = resolveLocationContext({
    destination: initialProfile.destination,
    cachedLocation: initialLastLocation
  });

  const [catalog, setCatalog] = useState<ExperienceNode[]>(initialCatalog);
  const [profile, setProfile] = useState<TravelerProfile>(initialProfile);
  const [risk, setRisk] = useState<RiskEnvelope>(defaultRisk);
  const [reportMap, setReportMap] =
    useState<Record<string, VisitReport[]>>(initialReports);
  const [completedNodeIds, setCompletedNodeIds] = useState<string[]>(initialCompleted);
  const [activeReviewNodeId, setActiveReviewNodeId] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState(defaultReviewDraft);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(initialCatalog[0]?.id ?? "");
  const [selectedExploreNodeId, setSelectedExploreNodeId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [liveLocation, setLiveLocation] = useState<Coordinates | undefined>(undefined);
  const [mapRegion, setMapRegion] = useState<MapRegionCache>(initialMapRegion);
  const [tripSession, setTripSession] = useState<TripSession>(initialTripSession);
  const [syncIdentity, setSyncIdentity] = useState<SyncIdentity | null>(initialSyncIdentity);
  const [syncMetadata, setSyncMetadata] = useState<SyncMetadata>(initialSyncMetadata);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    defaultRisk.connectivity === "offline" ? "offline" : "idle"
  );
  const [shellMode, setShellMode] = useState<"explore" | "studio">("explore");
  const [editorTab, setEditorTab] = useState<"catalog" | "candidates" | "published">("catalog");
  const [ingestionCandidates, setIngestionCandidates] =
    useState<IngestionCandidate[]>(initialCandidates);
  const [publishedSources, setPublishedSources] =
    useState<PublishedSourceRecord[]>(initialPublishedSources);
  const [importQuery, setImportQuery] = useState(defaultImportQuery(initialProfile.destination));
  const [importing, setImporting] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    initialCandidates[0]?.id ?? null
  );
  const [candidateDraft, setCandidateDraft] = useState(() =>
    initialCandidates[0] ? candidateDraftFromSource(initialCandidates[0]) : null
  );
  const [cachedEmergencyAnchors, setCachedEmergencyAnchors] =
    useState<EmergencyAnchor[]>(initialEmergencyAnchors);
  const [trail, setTrail] = useState(() =>
    buildTrailResult({
      profile: initialProfile,
      risk: defaultRisk,
      completedNodeIds: initialCompleted,
      reportMap: initialReports,
      cache: initialCache,
      experienceCatalog: initialCatalog,
      locationContext: initialLocationContext,
      mapRegion: initialMapRegion,
      tripSession: initialTripSession
    })
  );
  const [isPending, startTransition] = useTransition();
  const syncInFlightRef = useRef(false);
  const nodeTitles = Object.fromEntries(catalog.map((node) => [node.id, node.title]));
  const travelerState = buildTravelerState(profile, completedNodeIds, reportMap);
  const editorialState = buildEditorialState(ingestionCandidates, publishedSources);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    saveReportMap(reportMap);
  }, [reportMap]);

  useEffect(() => {
    saveCompletedNodeIds(completedNodeIds);
  }, [completedNodeIds]);

  useEffect(() => {
    saveExperienceCatalog(catalog);
  }, [catalog]);

  useEffect(() => {
    saveIngestionCandidates(ingestionCandidates);
  }, [ingestionCandidates]);

  useEffect(() => {
    savePublishedSources(publishedSources);
  }, [publishedSources]);

  useEffect(() => {
    saveTripSession(tripSession);
  }, [tripSession]);

  useEffect(() => {
    if (syncIdentity) {
      saveSyncIdentity(syncIdentity);
    }
  }, [syncIdentity]);

  useEffect(() => {
    saveSyncMetadata(syncMetadata);
  }, [syncMetadata]);

  useEffect(() => {
    saveMapRegion(mapRegion);
  }, [mapRegion]);

  useEffect(() => {
    saveEmergencyAnchors(cachedEmergencyAnchors);
  }, [cachedEmergencyAnchors]);

  useEffect(() => {
    saveLastLocation(liveLocation ?? tripSession.lastKnownLocation);
  }, [liveLocation, tripSession.lastKnownLocation]);

  useEffect(() => {
    if (!catalog.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(catalog[0]?.id ?? "");
    }
  }, [catalog, selectedNodeId]);

  useEffect(() => {
    if (!ingestionCandidates.some((candidate) => candidate.id === selectedCandidateId)) {
      const nextCandidate = ingestionCandidates[0] ?? null;
      setSelectedCandidateId(nextCandidate?.id ?? null);
      setCandidateDraft(nextCandidate ? candidateDraftFromSource(nextCandidate) : null);
    }
  }, [ingestionCandidates, selectedCandidateId]);

  useEffect(() => {
    const nextRegion = defaultMapRegions[profile.destination];
    setMapRegion((current) =>
      current.center.lat === nextRegion.center.lat && current.center.lng === nextRegion.center.lng
        ? current
        : nextRegion
    );
    updateTripSession((current) =>
      current.city === profile.destination
        ? current
        : defaultTripSession(profile.destination, profile.tripStart, nextRegion)
    );
    setCachedEmergencyAnchors(emergencyAnchorsByCity[profile.destination]);
    setImportQuery((current) => ({ ...current, city: profile.destination }));
  }, [profile.destination, profile.tripStart]);

  useEffect(() => {
    startTransition(() => {
      const locationContext = resolveLocationContext({
        destination: profile.destination,
        liveLocation,
        cachedLocation: tripSession.lastKnownLocation
      });
      setTrail(
        buildTrailResult({
          experienceCatalog: catalog,
          profile,
          risk,
          completedNodeIds,
          reportMap,
          cache: loadTrailCache(),
          locationContext,
          mapRegion,
          tripSession
        })
      );
    });
  }, [catalog, profile, risk, completedNodeIds, reportMap, liveLocation, mapRegion, tripSession]);

  useEffect(() => {
    if (!trail.usedCache) {
      saveTrailCache(createTrailCache(trail));
    }
  }, [trail]);

  useEffect(() => {
    const currentBranches = trail.arcs.flatMap((arc) => [arc.guardian, arc.expressive, arc.fallback]);
    if (!selectedExploreNodeId || !currentBranches.some((branch) => branch.node?.id === selectedExploreNodeId)) {
      setSelectedExploreNodeId(currentBranches.find((branch) => branch.node)?.node?.id ?? null);
    }
  }, [trail.arcs, selectedExploreNodeId]);

  useEffect(() => {
    setCachedEmergencyAnchors(trail.emergencyAnchors);
    let changed = false;
    setTripSession((current) => {
      const nextSession = {
        ...current,
        city: profile.destination,
        tripStartDate: profile.tripStart,
        activeTrailGeneratedAt: trail.generatedAt,
        lastKnownLocation: trail.effectiveLocation,
        locationSource: trail.locationSource,
        lastMapRegion: trail.mapRegion
      };

      if (JSON.stringify(current) === JSON.stringify(nextSession)) {
        return current;
      }

      changed = true;
      return nextSession;
    });

    if (changed) {
      touchTripSync();
    }
  }, [trail, profile.destination, profile.tripStart]);

  useEffect(() => {
    if (!syncEnabled) {
      setSyncStatus("idle");
      return;
    }

    if (risk.connectivity === "offline") {
      setSyncStatus("offline");
      return;
    }

    const stale =
      !syncMetadata.lastSyncedAt ||
      Date.now() - new Date(syncMetadata.lastSyncedAt).getTime() > 60000;
    if (syncMetadata.pendingPush || stale) {
      void runSync(syncMetadata.lastSyncedAt ? "change" : "boot");
    }
  }, [
    syncEnabled,
    risk.connectivity,
    syncMetadata.pendingPush,
    syncMetadata.lastSyncedAt,
    travelerState,
    tripSession,
    editorialState
  ]);

  useEffect(() => {
    if (!syncEnabled || typeof window === "undefined") {
      return;
    }

    const handleOnline = () => void runSync("retry");
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runSync("resume");
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncEnabled, travelerState, tripSession, editorialState, syncMetadata, syncIdentity, risk.connectivity]);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords = {
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6))
        };
        setLiveLocation(coords);
      },
      () => {
        setLiveLocation(undefined);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 60000,
        timeout: 5000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const envelopeFloor = Math.min(
    risk.neighborhoodConfidence,
    risk.transportExitQuality,
    risk.soloSafetyScore
  );
  const modeLabel =
    risk.connectivity === "offline"
      ? "Cached survival mode"
      : envelopeFloor >= 80
        ? "Swing window open"
        : envelopeFloor >= 70
          ? "Controlled exploration"
          : "Guardian lockdown";
  const reviewNode = activeReviewNodeId
    ? catalog.find((node) => node.id === activeReviewNodeId) ?? null
    : null;
  const selectedNode =
    catalog.find((node) => node.id === selectedNodeId) ??
    catalog[0] ??
    defaultExperienceDraft("Tokyo");
  const mapBranches = trail.arcs.flatMap((arc) => [arc.guardian, arc.expressive, arc.fallback]);
  const selectedExploreBranch =
    mapBranches.find((branch) => branch.node?.id === selectedExploreNodeId) ??
    mapBranches.find((branch) => branch.node) ??
    null;
  const selectedTrace =
    trail.traces.find((trace) => trace.nodeId === selectedExploreBranch?.node?.id) ?? null;
  const selectedCandidate =
    ingestionCandidates.find((candidate) => candidate.id === selectedCandidateId) ??
    ingestionCandidates[0] ??
    null;
  const isFirstRunTokyo =
    profile.destination === "Tokyo" &&
    completedNodeIds.length === 0 &&
    tripSession.confessionals.length === 0;
  const candidateInvariantFailures = candidateDraft ? publishInvariantFailures(candidateDraft) : [];
  const publishedByFreshness = {
    fresh: publishedSources.filter((record) => {
      const node = catalog.find((entry) => entry.id === record.nodeId);
      return freshnessStateFromTimestamp(node?.sourceUpdatedAt) === "fresh";
    }),
    aging: publishedSources.filter((record) => {
      const node = catalog.find((entry) => entry.id === record.nodeId);
      return freshnessStateFromTimestamp(node?.sourceUpdatedAt) === "aging";
    }),
    stale: publishedSources.filter((record) => {
      const node = catalog.find((entry) => entry.id === record.nodeId);
      return freshnessStateFromTimestamp(node?.sourceUpdatedAt) === "stale";
    })
  };
  const publishedAudit = publishedSources.map((record) => {
    const node = catalog.find((entry) => entry.id === record.nodeId) ?? null;
    const freshness = freshnessStateFromTimestamp(node?.sourceUpdatedAt);
    const failures = node ? nodeInvariantFailures(node) : ["Published source mapping is missing its catalog node."];

    return {
      record,
      node,
      freshness,
      failures
    };
  });
  const invalidPublishedCount = publishedAudit.filter((entry) => entry.failures.length > 0).length;

  function touchTravelerSync() {
    setSyncMetadata((current) => ({
      ...current,
      travelerStateUpdatedAt: new Date().toISOString(),
      pendingPush: true,
      lastError: null
    }));
  }

  function touchTripSync() {
    setSyncMetadata((current) => ({
      ...current,
      tripSessionUpdatedAt: new Date().toISOString(),
      pendingPush: true,
      lastError: null
    }));
  }

  function touchEditorialSync() {
    setSyncMetadata((current) => ({
      ...current,
      editorialStateUpdatedAt: new Date().toISOString(),
      pendingPush: true,
      lastError: null
    }));
  }

  function updateProfile(updater: TravelerProfile | ((current: TravelerProfile) => TravelerProfile)) {
    setProfile((current) =>
      typeof updater === "function"
        ? (updater as (current: TravelerProfile) => TravelerProfile)(current)
        : updater
    );
    touchTravelerSync();
  }

  function updateCompletedIds(updater: string[] | ((current: string[]) => string[])) {
    setCompletedNodeIds((current) =>
      typeof updater === "function"
        ? (updater as (current: string[]) => string[])(current)
        : updater
    );
    touchTravelerSync();
  }

  function updateReportState(
    updater:
      | Record<string, VisitReport[]>
      | ((current: Record<string, VisitReport[]>) => Record<string, VisitReport[]>)
  ) {
    setReportMap((current) =>
      typeof updater === "function"
        ? (updater as (current: Record<string, VisitReport[]>) => Record<string, VisitReport[]>)(current)
        : updater
    );
    touchTravelerSync();
  }

  function updateTripSession(updater: TripSession | ((current: TripSession) => TripSession)) {
    setTripSession((current) =>
      typeof updater === "function"
        ? (updater as (current: TripSession) => TripSession)(current)
        : updater
    );
    touchTripSync();
  }

  async function runSync(reason: "boot" | "change" | "retry" | "resume" = "change") {
    if (!syncEnabled) {
      setSyncStatus("idle");
      return;
    }

    if (risk.connectivity === "offline" || (typeof navigator !== "undefined" && !navigator.onLine)) {
      setSyncStatus("offline");
      setSyncMetadata((current) => ({
        ...current,
        pendingPush: reason === "boot" ? current.pendingPush : true
      }));
      return;
    }

    if (syncInFlightRef.current) {
      return;
    }

    syncInFlightRef.current = true;
    setSyncStatus("syncing");

    try {
      const result = await syncEdgeWanderState({
        identity: syncIdentity,
        travelerState,
        tripSession,
        editorialState,
        metadata: syncMetadata,
        enabled: syncEnabled
      });

      setSyncIdentity(result.identity);
      setSyncMetadata(result.metadata);

      if (result.mergedRemote) {
        setProfile(result.travelerState.profile);
        setCompletedNodeIds(result.travelerState.completedNodeIds);
        setReportMap(result.travelerState.reportMap);
        setTripSession(result.tripSession);
        setIngestionCandidates(result.editorialState.ingestionCandidates);
        setPublishedSources(result.editorialState.publishedSources);
      }

      setSyncStatus(result.status);
    } catch (error) {
      setSyncStatus("error");
      setSyncMetadata((current) => ({
        ...current,
        pendingPush: true,
        lastError: error instanceof Error ? error.message : "Cloud sync failed."
      }));
    } finally {
      syncInFlightRef.current = false;
    }
  }

  function toggleInterest(tag: InterestTag) {
    updateProfile((current) => ({
      ...current,
      interestTags: current.interestTags.includes(tag)
        ? current.interestTags.filter((entry) => entry !== tag)
        : [...current.interestTags, tag]
    }));
  }

  function toggleNoGo(tag: NoGo) {
    updateProfile((current) => ({
      ...current,
      noGos: current.noGos.includes(tag)
        ? current.noGos.filter((entry) => entry !== tag)
        : [...current.noGos, tag]
    }));
  }

  function markComplete(branch: QuestBranch) {
    if (!branch.node) {
      return;
    }

    updateCompletedIds((current) => Array.from(new Set([...current, branch.node!.id])));
    updateTripSession((current) => ({
      ...current,
      visitedNodes: Array.from(new Set([...current.visitedNodes, branch.node!.id])),
      skippedNodes: current.skippedNodes.filter((id) => id !== branch.node!.id)
    }));
  }

  function openReview(branch: QuestBranch) {
    if (!branch.node) {
      return;
    }

    setActiveReviewNodeId(branch.node.id);
    setReviewDraft(defaultReviewDraft());
  }

  function submitReview() {
    if (!activeReviewNodeId) {
      return;
    }

    const nextReport: VisitReport = {
      nodeId: activeReviewNodeId,
      rewardRating: reviewDraft.rewardRating,
      stressRating: reviewDraft.stressRating,
      consentClarity: reviewDraft.consentClarity,
      crowdVibe: reviewDraft.crowdVibe,
      exitability: reviewDraft.exitability,
      wouldSoloAgain: reviewDraft.wouldSoloAgain,
      note: reviewDraft.note.trim(),
      createdAt: new Date().toISOString()
    };

    updateReportState((current) => ({
      ...current,
      [activeReviewNodeId]: [...(current[activeReviewNodeId] ?? []), nextReport]
    }));
    updateCompletedIds((current) => Array.from(new Set([...current, activeReviewNodeId])));
    updateTripSession((current) => ({
      ...current,
      visitedNodes: Array.from(new Set([...current.visitedNodes, activeReviewNodeId])),
      confessionals: [...current.confessionals, `${activeReviewNodeId}:${nextReport.createdAt}`],
      quarantinedNodes:
        nextReport.stressRating >= 5 && nextReport.exitability <= 2
          ? Array.from(new Set([...current.quarantinedNodes, activeReviewNodeId]))
          : current.quarantinedNodes
    }));
    setActiveReviewNodeId(null);
    setReviewDraft(defaultReviewDraft());
  }

  function skipSelectedBranch() {
    if (!selectedExploreBranch?.node) {
      return;
    }

    updateTripSession((current) => ({
      ...current,
      skippedNodes: Array.from(new Set([...current.skippedNodes, selectedExploreBranch.node!.id]))
    }));
  }

  async function importCandidates() {
    setImporting(true);

    try {
      const nextCandidates = await importGooglePlacesCandidates(importQuery, catalog, ingestionCandidates);
      setIngestionCandidates((current) => [...nextCandidates, ...current]);
      if (nextCandidates.length > 0) {
        touchEditorialSync();
      }

      if (nextCandidates[0]) {
        setSelectedCandidateId(nextCandidates[0].id);
        setCandidateDraft(candidateDraftFromSource(nextCandidates[0]));
      }

      setEditorMessage(
        nextCandidates.length > 0
          ? `Imported ${nextCandidates.length} Google Places candidates into review.`
          : "No new candidates found for that query."
      );
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "Candidate import failed.");
    } finally {
      setImporting(false);
    }
  }

  function selectCandidate(candidateId: string) {
    const candidate = ingestionCandidates.find((entry) => entry.id === candidateId) ?? null;
    setSelectedCandidateId(candidateId);
    setCandidateDraft(candidate ? candidateDraftFromSource(candidate) : null);
  }

  function updateCandidateDraft(
    updater:
      | NonNullable<typeof candidateDraft>
      | ((current: NonNullable<typeof candidateDraft>) => NonNullable<typeof candidateDraft>)
  ) {
    setCandidateDraft((current) => {
      if (!current) {
        return current;
      }

      return typeof updater === "function"
        ? (updater as (current: NonNullable<typeof candidateDraft>) => NonNullable<typeof candidateDraft>)(current)
        : updater;
    });
  }

  function holdCandidate() {
    if (!selectedCandidate) {
      return;
    }

    setIngestionCandidates((current) =>
      applyCandidateDecision(current, {
        candidateId: selectedCandidate.id,
        action: "hold",
        notes: candidateDraft?.editorialNotes
      })
    );
    touchEditorialSync();
    setEditorMessage("Candidate kept in the review queue.");
  }

  function rejectCandidate() {
    if (!selectedCandidate) {
      return;
    }

    setIngestionCandidates((current) =>
      applyCandidateDecision(current, {
        candidateId: selectedCandidate.id,
        action: "reject",
        notes: candidateDraft?.editorialNotes
      })
    );
    touchEditorialSync();
    setEditorMessage("Candidate rejected and kept out of the live catalog.");
  }

  function approveCandidate() {
    if (!selectedCandidate || !candidateDraft) {
      return;
    }

    try {
      const publication = publishCandidateToCatalog({
        candidate: selectedCandidate,
        draft: candidateDraft,
        catalog,
        targetNodeId: selectedCandidate.matchedNodeId
      });

      setCatalog(publication.nextCatalog);
      setPublishedSources((current) => [publication.published, ...current]);
      setIngestionCandidates((current) =>
        applyCandidateDecision(current, {
          candidateId: selectedCandidate.id,
          action: selectedCandidate.matchedNodeId ? "merge" : "approve",
          targetNodeId: publication.published.nodeId,
          notes: candidateDraft.editorialNotes
        }).filter((candidate) => candidate.id !== selectedCandidate.id)
      );
      touchEditorialSync();
      setSelectedNodeId(publication.published.nodeId);
      setEditorTab("published");
      setEditorMessage("Candidate approved and published into the vetted catalog.");
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "Candidate publish failed.");
    }
  }

  function reverifyPublished(nodeId: string) {
    try {
      const reverified = reverifyPublishedNode({
        nodeId,
        catalog,
        publishedSources,
        note: "Editorial re-verification completed in studio."
      });
      setCatalog(reverified.nextCatalog);
      setPublishedSources(reverified.nextPublishedSources);
      touchEditorialSync();
      setEditorMessage(`Published node re-verified at ${formatSyncTime(reverified.verifiedAt)}.`);
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "Re-verification failed.");
    }
  }

  function replaceSelectedNode(patch: Partial<ExperienceNode>) {
    setCatalog((current) =>
      current.map((node) => {
        if (node.id !== selectedNode.id) {
          return node;
        }

        const nextTitle = patch.title ?? node.title;
        const nextCity = (patch.city ?? node.city) as Destination;
        return {
          ...node,
          ...patch,
          id: patch.id ?? buildNodeId(nextCity, nextTitle)
        };
      })
    );
  }

  function addNode() {
    const draft = defaultExperienceDraft(profile.destination);
    const title = `New ${profile.destination} node ${catalog.length + 1}`;
    const nextNode = {
      ...draft,
      title,
      id: buildNodeId(profile.destination, title)
    };
    setCatalog((current) => [...current, nextNode]);
    setSelectedNodeId(nextNode.id);
    setEditorMessage("Draft node added to the catalog.");
  }

  function resetCatalog() {
    const nextCatalog = cloneSeedCatalog();
    setCatalog(nextCatalog);
    setSelectedNodeId(nextCatalog[0]?.id ?? "");
    setEditorMessage("Catalog reset to curated seed data.");
  }

  function loadCatalogIntoEditor() {
    setEditorText(JSON.stringify(catalog, null, 2));
    setEditorMessage("Current catalog loaded into the JSON editor.");
  }

  function applyCatalogJson() {
    try {
      const nextCatalog = validateCatalog(JSON.parse(editorText));
      setCatalog(nextCatalog);
      setSelectedNodeId(nextCatalog[0]?.id ?? "");
      setEditorMessage(`Catalog updated with ${nextCatalog.length} nodes.`);
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "Catalog update failed.");
    }
  }

  async function exportCatalog() {
    const payload = JSON.stringify(catalog, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setEditorMessage("Catalog JSON copied to clipboard.");
    } catch {
      setEditorText(payload);
      setEditorMessage("Clipboard unavailable. Catalog JSON placed in the editor.");
    }
  }

  return (
    <div className="shell">
      <div className="glow glow-a" />
      <div className="glow glow-b" />

      <header className="hero">
        <div className="hero__eyebrow">EdgeWander</div>
        <div className="hero__copy">
          <p className="hero__kicker">Guardian sets the envelope. Daredevil swings inside it.</p>
          <h1 className="hero__title">A safe mystery engine for solo travelers chasing the world’s margins.</h1>
          <p className="hero__lede">
            This prototype replaces static itineraries with a living trail of quest arcs, omen cards,
            threshold unlocks, and confessional reviews that feed directly back into what the app will
            recommend next.
          </p>
          <div className="notice notice--soft hero__notice">
            Tokyo is the current dominance city. This loop gets hardened first for trust, polish, and progression.
          </div>
        </div>
        <div className="signal-board">
          <div className="signal-board__label">Current envelope</div>
          <div className="signal-board__value">{modeLabel}</div>
          <div className="signal-grid">
            <SignalStat label="Red Thread" value={trail.redThread} tone="gold" />
            <SignalStat label="Destination" value={profile.destination} tone="teal" />
            <SignalStat label="Envelope floor" value={`${envelopeFloor}/100`} tone="smoke" />
            <SignalStat
              label="Cloud save"
              value={!syncEnabled ? "disabled" : syncStatus}
              tone="rose"
            />
          </div>
          <div className="pill-row shell-toggle">
            <button
              className={`pill ${shellMode === "explore" ? "pill--active" : ""}`}
              type="button"
              onClick={() => setShellMode("explore")}
            >
              Traveler shell
            </button>
            <button
              className={`pill ${shellMode === "studio" ? "pill--active" : ""}`}
              type="button"
              onClick={() => setShellMode("studio")}
            >
              Editorial studio
            </button>
          </div>
        </div>
      </header>

      <main className="layout layout--expanded">
        {shellMode === "studio" && (
        <section className="panel controls-panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Traveler profile</span>
            <h2>Set the swing, then set the rails.</h2>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Destination</span>
              <select
                value={profile.destination}
                onChange={(event) =>
                  updateProfile((current) => ({
                    ...current,
                    destination: event.target.value as TravelerProfile["destination"]
                  }))
                }
              >
                <option>Tokyo</option>
                <option>Berlin</option>
                <option>New Orleans</option>
              </select>
            </label>

            <label className="field">
              <span>Trip start</span>
              <input
                type="date"
                value={profile.tripStart}
                onChange={(event) =>
                  updateProfile((current) => ({ ...current, tripStart: event.target.value }))
                }
              />
            </label>

            <label className="field">
              <span>Trip end</span>
              <input
                type="date"
                value={profile.tripEnd}
                onChange={(event) =>
                  updateProfile((current) => ({ ...current, tripEnd: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="field">
            <span>Budget band</span>
            <div className="pill-row">
              {[
                ["lean", "Lean"],
                ["steady", "Steady"],
                ["flush", "Flush"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`pill ${profile.budgetBand === value ? "pill--active" : ""}`}
                  type="button"
                  onClick={() =>
                    updateProfile((current) => ({
                      ...current,
                      budgetBand: value as TravelerProfile["budgetBand"]
                    }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>Risk appetite</span>
            <input
              type="range"
              min="0"
              max="100"
              value={profile.appetite}
              onChange={(event) =>
                updateProfile((current) => ({
                  ...current,
                  appetite: Number(event.target.value)
                }))
              }
            />
            <div className="range-caption">
              <span>Cautious curator</span>
              <strong>{profile.appetite}</strong>
              <span>Thrill junkie</span>
            </div>
          </label>

          <div className="field">
            <span>Interest tags</span>
            <div className="tag-grid">
              {(Object.keys(interestLabels) as InterestTag[]).map((tag) => (
                <button
                  key={tag}
                  className={`tag ${profile.interestTags.includes(tag) ? "tag--active" : ""}`}
                  type="button"
                  onClick={() => toggleInterest(tag)}
                >
                  {interestLabels[tag]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Hard no-go filters</span>
            <div className="tag-grid">
              {(Object.keys(noGoLabels) as NoGo[]).map((tag) => (
                <button
                  key={tag}
                  className={`tag tag--muted ${profile.noGos.includes(tag) ? "tag--active" : ""}`}
                  type="button"
                  onClick={() => toggleNoGo(tag)}
                >
                  {noGoLabels[tag]}
                </button>
              ))}
            </div>
          </div>
        </section>
        )}

        {shellMode === "studio" && (
        <section className="panel controls-panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Live envelope</span>
            <h2>Guardian watches the inputs that actually matter.</h2>
          </div>

          <div className="field-grid field-grid--tight">
            <label className="field">
              <span>Time of day</span>
              <select
                value={risk.timeOfDay}
                onChange={(event) =>
                  setRisk((current) => ({
                    ...current,
                    timeOfDay: event.target.value as RiskEnvelope["timeOfDay"]
                  }))
                }
              >
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="blue-hour">Blue hour</option>
                <option value="night">Night</option>
              </select>
            </label>

            <label className="field">
              <span>Weather</span>
              <select
                value={risk.weather}
                onChange={(event) =>
                  setRisk((current) => ({
                    ...current,
                    weather: event.target.value as RiskEnvelope["weather"]
                  }))
                }
              >
                <option value="clear">Clear</option>
                <option value="mist">Mist</option>
                <option value="drizzle">Drizzle</option>
                <option value="storm">Storm</option>
              </select>
            </label>

            <label className="field">
              <span>Connectivity</span>
              <select
                value={risk.connectivity}
                onChange={(event) =>
                  setRisk((current) => ({
                    ...current,
                    connectivity: event.target.value as RiskEnvelope["connectivity"]
                  }))
                }
              >
                <option value="solid">Solid</option>
                <option value="patchy">Patchy</option>
                <option value="offline">Offline</option>
              </select>
            </label>
          </div>

          <SliderField
            label="Neighborhood confidence"
            value={risk.neighborhoodConfidence}
            onChange={(value) =>
              setRisk((current) => ({ ...current, neighborhoodConfidence: value }))
            }
          />
          <SliderField
            label="Transport exit quality"
            value={risk.transportExitQuality}
            onChange={(value) =>
              setRisk((current) => ({ ...current, transportExitQuality: value }))
            }
          />
          <SliderField
            label="Legal confidence"
            value={risk.legalConfidence}
            onChange={(value) => setRisk((current) => ({ ...current, legalConfidence: value }))}
          />
          <SliderField
            label="Consent confidence"
            value={risk.consentConfidence}
            onChange={(value) =>
              setRisk((current) => ({ ...current, consentConfidence: value }))
            }
          />
          <SliderField
            label="Solo safety score"
            value={risk.soloSafetyScore}
            onChange={(value) => setRisk((current) => ({ ...current, soloSafetyScore: value }))}
          />
        </section>
        )}

        {shellMode === "studio" && (
        <section className="panel editor-panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Editorial console</span>
            <h2>Curate the weird map without touching code.</h2>
          </div>

          <div className="notice notice--soft sync-panel">
            <div>
              <strong>Cloud save {syncEnabled ? "enabled" : "inactive"}</strong>
              <div className="sync-copy">
                {syncEnabled
                  ? `Status: ${syncStatus}. Last sync: ${formatSyncTime(syncMetadata.lastSyncedAt)}.`
                  : "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to turn on private cloud sync."}
              </div>
              {syncMetadata.lastError && <div className="sync-copy">Last error: {syncMetadata.lastError}</div>}
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => void runSync("retry")}
              disabled={!syncEnabled || syncStatus === "syncing"}
            >
              Retry sync
            </button>
          </div>

          <div className="pill-row editor-tabs">
            {[
              ["catalog", "Catalog"],
              ["candidates", `Candidates (${ingestionCandidates.length})`],
              ["published", `Published (${publishedSources.length})`]
            ].map(([value, label]) => (
              <button
                key={value}
                className={`pill ${editorTab === value ? "pill--active" : ""}`}
                type="button"
                onClick={() => setEditorTab(value as typeof editorTab)}
              >
                {label}
              </button>
            ))}
          </div>

          {editorMessage && <div className="banner banner--quiet">{editorMessage}</div>}

          {editorTab === "catalog" && (
            <>
              <div className="editor-toolbar">
                <button className="ghost-button" type="button" onClick={addNode}>
                  New node
                </button>
                <button className="ghost-button" type="button" onClick={loadCatalogIntoEditor}>
                  Load JSON
                </button>
                <button className="ghost-button" type="button" onClick={exportCatalog}>
                  Export JSON
                </button>
                <button className="ghost-button" type="button" onClick={resetCatalog}>
                  Reset seeds
                </button>
              </div>

              <div className="field-grid field-grid--tight">
                <label className="field">
                  <span>Selected node</span>
                  <select value={selectedNodeId} onChange={(event) => setSelectedNodeId(event.target.value)}>
                    {catalog.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.city}: {node.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Title</span>
                  <input
                    type="text"
                    value={selectedNode.title}
                    onChange={(event) => replaceSelectedNode({ title: event.target.value })}
                  />
                </label>

                <label className="field">
                  <span>City</span>
                  <select
                    value={selectedNode.city}
                    onChange={(event) =>
                      replaceSelectedNode({ city: event.target.value as Destination })
                    }
                  >
                    <option>Tokyo</option>
                    <option>Berlin</option>
                    <option>New Orleans</option>
                  </select>
                </label>
              </div>

              <div className="notice notice--soft">
                Source trust: <strong>{trustBadgeForNode(selectedNode)}</strong> · {selectedNode.sourceType}
              </div>

              <label className="field">
                <span>Narrative hook</span>
                <textarea
                  rows={3}
                  value={selectedNode.narrativeHook}
                  onChange={(event) => replaceSelectedNode({ narrativeHook: event.target.value })}
                />
              </label>

              <div className="field">
                <span>Interest tags</span>
                <div className="tag-grid">
                  {allInterests.map((tag) => (
                    <button
                      key={tag}
                      className={`tag ${selectedNode.interestTags.includes(tag) ? "tag--active" : ""}`}
                      type="button"
                      onClick={() =>
                        replaceSelectedNode({
                          interestTags: selectedNode.interestTags.includes(tag)
                            ? selectedNode.interestTags.filter((entry) => entry !== tag)
                            : [...selectedNode.interestTags, tag]
                        })
                      }
                    >
                      {interestLabels[tag]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>Operating windows</span>
                <div className="tag-grid">
                  {(Object.keys(timeLabels) as TimeOfDay[]).map((slot) => (
                    <button
                      key={slot}
                      className={`tag ${selectedNode.operatingWindows.includes(slot) ? "tag--active" : ""}`}
                      type="button"
                      onClick={() =>
                        replaceSelectedNode({
                          operatingWindows: selectedNode.operatingWindows.includes(slot)
                            ? selectedNode.operatingWindows.filter((entry) => entry !== slot)
                            : [...selectedNode.operatingWindows, slot]
                        })
                      }
                    >
                      {timeLabels[slot]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field-grid field-grid--tight">
                <NumberField
                  label="Novelty"
                  value={selectedNode.noveltyScore}
                  onChange={(value) => replaceSelectedNode({ noveltyScore: value })}
                />
                <NumberField
                  label="Edginess"
                  value={selectedNode.edginess}
                  onChange={(value) => replaceSelectedNode({ edginess: value })}
                />
                <NumberField
                  label="Exit quality"
                  value={selectedNode.transportExitQuality}
                  onChange={(value) => replaceSelectedNode({ transportExitQuality: value })}
                />
              </div>

              <label className="field">
                <span>Catalog JSON editor</span>
                <textarea
                  rows={7}
                  value={editorText}
                  onChange={(event) => setEditorText(event.target.value)}
                  placeholder="Load current catalog here, edit it, then apply JSON."
                />
              </label>

              <div className="drawer-actions">
                <button className="ghost-button" type="button" onClick={applyCatalogJson}>
                  Apply JSON
                </button>
              </div>
            </>
          )}

          {editorTab === "candidates" && (
            <>
              <div className="field-grid field-grid--tight">
                <label className="field">
                  <span>Import city</span>
                  <select
                    value={importQuery.city}
                    onChange={(event) =>
                      setImportQuery((current) => ({
                        ...current,
                        city: event.target.value as Destination
                      }))
                    }
                  >
                    <option>Tokyo</option>
                    <option>Berlin</option>
                    <option>New Orleans</option>
                  </select>
                </label>
                <label className="field">
                  <span>Google Places query</span>
                  <input
                    type="text"
                    value={importQuery.query}
                    onChange={(event) =>
                      setImportQuery((current) => ({ ...current, query: event.target.value }))
                    }
                    placeholder="occult bookstore, rehearsal room, folklore museum"
                  />
                </label>
                <div className="field field--action">
                  <span>Queue import</span>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void importCandidates()}
                    disabled={importing}
                  >
                    {importing ? "Importing..." : "Import candidates"}
                  </button>
                </div>
              </div>

              <div className="candidate-layout">
                <div className="candidate-list">
                  {ingestionCandidates.length === 0 && (
                    <div className="notice notice--soft">
                      No pending candidates yet. Import from Google Places to start the review queue.
                    </div>
                  )}

                  {ingestionCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      className={`candidate-item ${selectedCandidateId === candidate.id ? "candidate-item--active" : ""}`}
                      type="button"
                      onClick={() => selectCandidate(candidate.id)}
                    >
                      <strong>{candidate.title}</strong>
                      <span>{candidate.neighborhood}</span>
                      <span>{candidate.verificationStatus}</span>
                    </button>
                  ))}
                </div>

                {selectedCandidate && candidateDraft && (
                  <div className="candidate-review">
                    <div className="notice notice--soft">
                      Verification: <strong>{selectedCandidate.verificationStatus}</strong> · Matches:{" "}
                      {selectedCandidate.matches.length > 0
                        ? selectedCandidate.matches
                            .map((match) => `${match.title} (${match.score})`)
                            .join(", ")
                        : "none"}
                    </div>

                    {candidateInvariantFailures.length > 0 && (
                      <div className="notice notice--soft notice--warn">
                        <strong>Publish blocked until these Guardian invariants are satisfied:</strong>
                        <ul className="notice-list">
                          {candidateInvariantFailures.map((failure) => (
                            <li key={failure}>{failure}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="field-grid field-grid--tight">
                      <label className="field">
                        <span>Publish title</span>
                        <input
                          type="text"
                          value={candidateDraft.title}
                          onChange={(event) =>
                            updateCandidateDraft((current) => ({
                              ...current,
                              title: event.target.value
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Category</span>
                        <input
                          type="text"
                          value={candidateDraft.category}
                          onChange={(event) =>
                            updateCandidateDraft((current) => ({
                              ...current,
                              category: event.target.value
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Lane bias</span>
                        <select
                          value={candidateDraft.laneBias}
                          onChange={(event) =>
                            updateCandidateDraft((current) => ({
                              ...current,
                              laneBias: event.target.value as ExperienceNode["laneBias"]
                            }))
                          }
                        >
                          <option value="guardian">guardian</option>
                          <option value="balanced">balanced</option>
                          <option value="expressive">expressive</option>
                        </select>
                      </label>
                    </div>

                    <label className="field">
                      <span>Narrative hook</span>
                      <textarea
                        rows={3}
                        value={candidateDraft.narrativeHook}
                        onChange={(event) =>
                          updateCandidateDraft((current) => ({
                            ...current,
                            narrativeHook: event.target.value
                          }))
                        }
                      />
                    </label>

                    <div className="field">
                      <span>Theme tags</span>
                      <input
                        type="text"
                        value={candidateDraft.themeTags.join(", ")}
                        onChange={(event) =>
                          updateCandidateDraft((current) => ({
                            ...current,
                            themeTags: event.target.value
                              .split(",")
                              .map((entry) => entry.trim())
                              .filter(Boolean)
                          }))
                        }
                        placeholder="Smoke, Ink, and Small Gods"
                      />
                    </div>

                    <div className="field">
                      <span>Interest tags</span>
                      <div className="tag-grid">
                        {allInterests.map((tag) => (
                          <button
                            key={tag}
                            className={`tag ${candidateDraft.interestTags.includes(tag) ? "tag--active" : ""}`}
                            type="button"
                            onClick={() =>
                              updateCandidateDraft((current) => ({
                                ...current,
                                interestTags: current.interestTags.includes(tag)
                                  ? current.interestTags.filter((entry) => entry !== tag)
                                  : [...current.interestTags, tag]
                              }))
                            }
                          >
                            {interestLabels[tag]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="field-grid field-grid--tight">
                      <NumberField
                        label="Legal confidence"
                        value={candidateDraft.legalConfidence}
                        onChange={(value) =>
                          updateCandidateDraft((current) => ({ ...current, legalConfidence: value }))
                        }
                      />
                      <NumberField
                        label="Consent clarity"
                        value={candidateDraft.consentClarity}
                        onChange={(value) =>
                          updateCandidateDraft((current) => ({ ...current, consentClarity: value }))
                        }
                      />
                      <NumberField
                        label="Edginess"
                        value={candidateDraft.edginess}
                        onChange={(value) =>
                          updateCandidateDraft((current) => ({ ...current, edginess: value }))
                        }
                      />
                    </div>

                    <label className="field">
                      <span>Exit options</span>
                      <textarea
                        rows={2}
                        value={candidateDraft.exitOptions.join("\n")}
                        onChange={(event) =>
                          updateCandidateDraft((current) => ({
                            ...current,
                            exitOptions: event.target.value
                              .split("\n")
                              .map((entry) => entry.trim())
                              .filter(Boolean)
                          }))
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Editorial notes</span>
                      <textarea
                        rows={2}
                        value={candidateDraft.editorialNotes ?? ""}
                        onChange={(event) =>
                          updateCandidateDraft((current) => ({
                            ...current,
                            editorialNotes: event.target.value
                          }))
                        }
                      />
                    </label>

                    <div className="drawer-actions">
                      <button className="ghost-button" type="button" onClick={holdCandidate}>
                        Hold
                      </button>
                      <button className="ghost-button ghost-button--danger" type="button" onClick={rejectCandidate}>
                        Reject
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={approveCandidate}
                        disabled={candidateInvariantFailures.length > 0}
                      >
                        {selectedCandidate.matchedNodeId ? "Merge + publish" : "Approve + publish"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {editorTab === "published" && (
            <div className="published-list">
              <div className="field-grid field-grid--tight">
                <article className="essential-card">
                  <strong>Freshly verified</strong>
                  <div className="sync-copy">{publishedByFreshness.fresh.length} nodes</div>
                </article>
                <article className="essential-card">
                  <strong>Aging</strong>
                  <div className="sync-copy">{publishedByFreshness.aging.length} nodes</div>
                </article>
                <article className="essential-card">
                  <strong>Stale</strong>
                  <div className="sync-copy">{publishedByFreshness.stale.length} nodes</div>
                </article>
                <article className="essential-card">
                  <strong>Invariant drift</strong>
                  <div className="sync-copy">{invalidPublishedCount} nodes need editorial repair</div>
                </article>
              </div>

              {publishedSources.length === 0 && (
                <div className="notice notice--soft">No external-source publications yet.</div>
              )}
              {publishedAudit.map(({ record, node, freshness, failures }) => {
                return (
                  <article className="essential-card" key={`${record.nodeId}-${record.sourceId}`}>
                    <strong>{node?.title ?? record.nodeId}</strong>
                    <div className="sync-copy">
                      {record.sourceType} · {record.sourceId}
                    </div>
                    <div className="sync-copy">Published {formatSyncTime(record.publishedAt)}</div>
                    <div className="sync-copy">
                      Freshness: {freshness}
                      {record.lastVerifiedAt ? ` · re-verified ${formatSyncTime(record.lastVerifiedAt)}` : ""}
                    </div>
                    <div className="sync-copy">
                      Trust badge: {node ? trustBadgeForNode(node) : "Vetted"}
                    </div>
                    {failures.length > 0 && (
                      <div className="notice notice--soft notice--warn">
                        <strong>Invariant drift detected:</strong>
                        <ul className="notice-list">
                          {failures.map((failure) => (
                            <li key={failure}>{failure}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="drawer-actions">
                      <button className="ghost-button" type="button" onClick={() => reverifyPublished(record.nodeId)}>
                        Re-verify source
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        )}

        <section className="panel trail-panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Live exploration map</span>
            <h2>See the safer path, the stranger path, and the way out.</h2>
          </div>

          {trail.usedCache && (
            <div className="banner">
              Connectivity dropped to offline, so EdgeWander is holding the last known trail in cache and
              keeping emergency essentials pinned.
            </div>
          )}

          {isFirstRunTokyo && (
            <div className="banner banner--briefing">
              <strong>Tokyo briefing:</strong> Start with one Guardian branch to calibrate the city, then take one
              Expressive branch inside the same envelope, then leave a confessional so the next trail sharpens around
              your actual tolerance instead of your guess.
            </div>
          )}

          <div className="banner banner--quiet">
            Location source: {trail.locationSource}. Nearby arcs are composed around{" "}
            {trail.locationSource === "live" ? "your live position" : "the current city anchor"}.
          </div>

          {isPending && <div className="banner banner--quiet">Re-composing the trail against the current envelope.</div>}

          <MapExplorer
            trail={trail}
            mapRegion={mapRegion}
            liveLocation={liveLocation}
            onRegionChange={setMapRegion}
            onSelectNode={setSelectedExploreNodeId}
            selectedNodeId={selectedExploreNodeId}
          />

          {selectedExploreBranch?.node && (
            <article className="map-sheet">
              <div className="map-sheet__head">
                <div>
                  <span className={`lane lane--${selectedExploreBranch.lane === "guardian" ? "guardian" : "expressive"}`}>
                    {selectedExploreBranch.lane}
                  </span>
                  <h3>{selectedExploreBranch.node.title}</h3>
                </div>
                <StatusBadge status={selectedExploreBranch.status} />
              </div>

              <p className="map-sheet__copy">{selectedExploreBranch.node.narrativeHook}</p>

              <div className="branch__meta">
                <span>{selectedExploreBranch.node.neighborhood}</span>
                <span>{selectedExploreBranch.node.category}</span>
                <span>{trustBadgeForNode(selectedExploreBranch.node)}</span>
                <span>{selectedExploreBranch.routePreview?.distanceKm ?? 0} km away</span>
              </div>

              <div className="branch__stats">
                <span>ETA {selectedExploreBranch.routePreview?.etaMinutes ?? "--"} min</span>
                <span>Mode {selectedExploreBranch.routePreview?.mode ?? "walk"}</span>
                <span>Exit confidence {selectedExploreBranch.routePreview?.confidence ?? 0}</span>
              </div>

              <div className="notice notice--soft">
                Exit route: {selectedExploreBranch.routePreview?.exitSummary ?? selectedExploreBranch.exitPlan}
              </div>

              <div className="notice notice--soft">
                Why safe enough now: {selectedExploreBranch.rationale}
              </div>

              {selectedTrace && (
                <div className="notice notice--soft">
                  Why now: {selectedTrace.reasons.join(" · ")}
                </div>
              )}

              <div className="drawer-actions">
                <button className="ghost-button" type="button" onClick={() => markComplete(selectedExploreBranch)}>
                  Mark complete
                </button>
                <button className="ghost-button" type="button" onClick={skipSelectedBranch}>
                  Skip for now
                </button>
                <button className="primary-button" type="button" onClick={() => openReview(selectedExploreBranch)}>
                  Confessional
                </button>
              </div>
            </article>
          )}

          <div className="arc-stack">
            {trail.arcs.map((arc) => (
              <ArcCard
                key={arc.id}
                arc={arc}
                completedNodeIds={completedNodeIds}
                nodeTitles={nodeTitles}
                reportMap={reportMap}
                onComplete={markComplete}
                onReview={openReview}
              />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Tokyo quest log</span>
            <h2>Make progression visible, not implied.</h2>
          </div>

          <div className="published-list">
            {trail.questLog.map((entry) => (
              <article className="essential-card" key={entry.arcId}>
                <strong>{entry.label}</strong>
                <div className="sync-copy">
                  {entry.redThread} · {entry.lane} · {entry.status}
                </div>
                <div className="sync-copy">{entry.nodeTitle ?? "No surfaced node yet"}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Recommendation audit</span>
            <h2>Keep trust decisions inspectable.</h2>
          </div>

          <div className="published-list">
            {trail.traces.map((trace) => (
              <article className="essential-card" key={trace.id}>
                <strong>
                  {trace.arcId} · {trace.lane} · {trace.outcome}
                </strong>
                <div className="sync-copy">
                  Freshness: {trace.freshness}
                  {typeof trace.score === "number" ? ` · score ${trace.score}` : ""}
                </div>
                <div className="sync-copy">{trace.reasons.join(" · ")}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel essentials-panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Emergency essentials</span>
            <h2>The trip still needs a spine.</h2>
          </div>

          <div className="essentials-list">
            {trail.emergencyEssentials.map((item) => (
              <article className="essential-card" key={item}>
                {item}
              </article>
            ))}
          </div>
        </section>
      </main>

      {reviewNode && (
        <section className="review-drawer">
          <div className="review-drawer__head">
            <div>
              <span className="panel__eyebrow">Confessional review</span>
              <h3>{reviewNode.title}</h3>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setActiveReviewNodeId(null)}
            >
              Close
            </button>
          </div>

          <div className="notice notice--soft">
            File the room cleanly: payoff, discomfort, consent clarity, crowd vibe, and how easy it was to exit.
            This becomes the next layer of routing truth.
          </div>

          <div className="review-grid">
            <RatingField
              label="Reward"
              value={reviewDraft.rewardRating}
              onChange={(value) => setReviewDraft((current) => ({ ...current, rewardRating: value }))}
            />
            <RatingField
              label="Stress"
              value={reviewDraft.stressRating}
              onChange={(value) => setReviewDraft((current) => ({ ...current, stressRating: value }))}
            />
            <RatingField
              label="Consent clarity"
              value={reviewDraft.consentClarity}
              onChange={(value) =>
                setReviewDraft((current) => ({ ...current, consentClarity: value }))
              }
            />
            <RatingField
              label="Exitability"
              value={reviewDraft.exitability}
              onChange={(value) => setReviewDraft((current) => ({ ...current, exitability: value }))}
            />
          </div>

          <div className="field">
            <span>Crowd vibe</span>
            <div className="pill-row">
              {(["warm", "mixed", "sharp"] as CrowdVibe[]).map((vibe) => (
                <button
                  key={vibe}
                  className={`pill ${reviewDraft.crowdVibe === vibe ? "pill--active" : ""}`}
                  type="button"
                  onClick={() => setReviewDraft((current) => ({ ...current, crowdVibe: vibe }))}
                >
                  {vibe}
                </button>
              ))}
            </div>
          </div>

          <div className="field field--checkbox">
            <label>
              <input
                type="checkbox"
                checked={reviewDraft.wouldSoloAgain}
                onChange={(event) =>
                  setReviewDraft((current) => ({
                    ...current,
                    wouldSoloAgain: event.target.checked
                  }))
                }
              />
              <span>Would solo again</span>
            </label>
          </div>

          <label className="field">
            <span>Note</span>
            <textarea
              rows={3}
              value={reviewDraft.note}
              onChange={(event) =>
                setReviewDraft((current) => ({ ...current, note: event.target.value }))
              }
              placeholder="What felt unexpectedly magical, awkward, or easy to exit?"
            />
          </label>

          <div className="drawer-actions">
            <button className="ghost-button" type="button" onClick={() => setActiveReviewNodeId(null)}>
              Cancel
            </button>
            <button className="primary-button" type="button" onClick={submitReview}>
              Seal confessional
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function ArcCard(props: {
  arc: QuestArc;
  completedNodeIds: string[];
  nodeTitles: Record<string, string>;
  reportMap: Record<string, VisitReport[]>;
  onComplete: (branch: QuestBranch) => void;
  onReview: (branch: QuestBranch) => void;
}) {
  return (
    <article className="arc-card">
      <div className="arc-card__head">
        <div>
          <span className="arc-card__label">{props.arc.label}</span>
          <h3>{props.arc.primaryNode.title}</h3>
        </div>
        <div className="arc-card__theme">{props.arc.theme}</div>
      </div>

      <p className="arc-card__intro">{props.arc.introCopy}</p>

      <div className="branch-grid">
        <BranchCard
          branch={props.arc.guardian}
          completedNodeIds={props.completedNodeIds}
          reportMap={props.reportMap}
          onComplete={props.onComplete}
          onReview={props.onReview}
        />
        <BranchCard
          branch={props.arc.expressive}
          completedNodeIds={props.completedNodeIds}
          reportMap={props.reportMap}
          onComplete={props.onComplete}
          onReview={props.onReview}
        />
        <BranchCard
          branch={props.arc.fallback}
          completedNodeIds={props.completedNodeIds}
          reportMap={props.reportMap}
          onComplete={props.onComplete}
          onReview={props.onReview}
        />
      </div>

      {props.arc.driftCard && (
        <div className="drift-card">
          <div className="drift-card__eyebrow">Omen card</div>
          <h4>{props.arc.driftCard.title}</h4>
          <p>{props.arc.driftCard.copy}</p>
          <div className="drift-card__meta">
            <span>{props.arc.driftCard.trigger}</span>
            <span>{props.arc.driftCard.node.area}</span>
          </div>
        </div>
      )}

      {props.arc.unlockConditions.length > 0 && (
        <div className="unlock-row">
          Unlock chain:{" "}
          {props.arc.unlockConditions.map((id) => props.nodeTitles[id] ?? id).join(", ")}
        </div>
      )}

      <div className="fallback-row">Fallback path: {props.arc.fallbackPath}</div>
    </article>
  );
}

function BranchCard(props: {
  branch: QuestBranch;
  completedNodeIds: string[];
  reportMap: Record<string, VisitReport[]>;
  onComplete: (branch: QuestBranch) => void;
  onReview: (branch: QuestBranch) => void;
}) {
  const tone = props.branch.lane === "guardian" ? "guardian" : "expressive";
  const node = props.branch.node;
  const summary = node ? summarizeReports(props.reportMap[node.id] ?? []) : null;
  const completed = node ? props.completedNodeIds.includes(node.id) : false;

  return (
    <section className={`branch branch--${tone}`}>
      <div className="branch__head">
        <span className={`lane lane--${tone}`}>{props.branch.lane}</span>
        <StatusBadge status={props.branch.status} />
      </div>

      <h4>{node?.title ?? "No branch surfaced"}</h4>
      <p className="branch__rationale">{props.branch.rationale}</p>

      {node && (
        <>
          <div className="branch__meta">
            <span>{node.area}</span>
            <span>{node.category}</span>
            <span>{trustBadgeForNode(node)}</span>
            <span>{"$".repeat(node.costBand)}</span>
          </div>
          <div className="branch__stats">
            <span>Novelty {node.noveltyScore}</span>
            <span>Exit {node.transportExitQuality}</span>
            <span>Solo-safe {node.soloSafetyScore}</span>
          </div>
        </>
      )}

      {props.branch.suppressionReason && (
        <div className="notice notice--soft">{props.branch.suppressionReason}</div>
      )}

      {summary && summary.reportCount > 0 && (
        <div className={`notice ${summary.quarantine || summary.caution ? "notice--warn" : "notice--soft"}`}>
          {summary.reportCount} confessional
          {summary.reportCount > 1 ? "s" : ""} logged.
          {summary.quarantine
            ? " Node is quarantined for future routing."
            : summary.caution
              ? " Guardian is watching this node closely."
              : " The room still holds up for solo travel."}
        </div>
      )}

      <div className="branch__exit">Exit plan: {props.branch.exitPlan}</div>

      <div className="branch__exit">Why safe enough now: {props.branch.rationale}</div>

      {node && props.branch.status !== "locked" && (
        <div className="branch__actions">
          <button
            className={`ghost-button ${completed ? "ghost-button--done" : ""}`}
            type="button"
            onClick={() => props.onComplete(props.branch)}
          >
            {completed ? "Completed" : "Mark complete"}
          </button>
          <button className="primary-button" type="button" onClick={() => props.onReview(props.branch)}>
            Log confessional
          </button>
        </div>
      )}
    </section>
  );
}

function StatusBadge(props: { status: BranchStatus }) {
  return <span className={`status status--${props.status}`}>{props.status}</span>;
}

function SliderField(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="range"
        min="40"
        max="100"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
      <div className="range-caption range-caption--compact">
        <span>40</span>
        <strong>{props.value}</strong>
        <span>100</span>
      </div>
    </label>
  );
}

function RatingField(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <div className="pill-row">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            className={`pill ${props.value === value ? "pill--active" : ""}`}
            type="button"
            onClick={() => props.onChange(value)}
          >
            {value}
          </button>
        ))}
      </div>
    </label>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="number"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SignalStat(props: { label: string; value: string; tone: "gold" | "teal" | "smoke" | "rose" }) {
  return (
    <article className={`signal-stat signal-stat--${props.tone}`}>
      <div className="signal-stat__label">{props.label}</div>
      <div className="signal-stat__value">{props.value}</div>
    </article>
  );
}

export default App;
