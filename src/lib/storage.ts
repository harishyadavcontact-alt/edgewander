import type {
  Coordinates,
  EditorialState,
  EmergencyAnchor,
  ExperienceNode,
  IngestionCandidate,
  MapRegionCache,
  PublishedSourceRecord,
  SyncIdentity,
  SyncMetadata,
  TrailCache,
  TravelerProfile,
  TravelerState,
  TripSession,
  VisitReport
} from "../types";

const keys = {
  profile: "edgewander.profile",
  reports: "edgewander.reports",
  completed: "edgewander.completed",
  cache: "edgewander.cache",
  catalog: "edgewander.catalog",
  tripSession: "edgewander.trip-session",
  mapRegion: "edgewander.map-region",
  emergencyAnchors: "edgewander.emergency-anchors",
  lastLocation: "edgewander.last-location",
  syncIdentity: "edgewander.sync-identity",
  syncMetadata: "edgewander.sync-metadata",
  ingestionCandidates: "edgewander.ingestion-candidates",
  publishedSources: "edgewander.published-sources"
};

function safeRead<T>(key: string, fallback: T) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage exhaustion for the prototype.
  }
}

export function loadProfile(defaultProfile: TravelerProfile) {
  return safeRead(keys.profile, defaultProfile);
}

export function saveProfile(profile: TravelerProfile) {
  safeWrite(keys.profile, profile);
}

export function loadReportMap() {
  return safeRead<Record<string, VisitReport[]>>(keys.reports, {});
}

export function saveReportMap(reportMap: Record<string, VisitReport[]>) {
  safeWrite(keys.reports, reportMap);
}

export function loadCompletedNodeIds() {
  return safeRead<string[]>(keys.completed, []);
}

export function saveCompletedNodeIds(nodeIds: string[]) {
  safeWrite(keys.completed, Array.from(new Set(nodeIds)));
}

export function loadTrailCache() {
  return safeRead<TrailCache | null>(keys.cache, null);
}

export function saveTrailCache(cache: TrailCache) {
  safeWrite(keys.cache, cache);
}

export function loadExperienceCatalog(fallback: ExperienceNode[]) {
  return safeRead<ExperienceNode[]>(keys.catalog, fallback);
}

export function saveExperienceCatalog(catalog: ExperienceNode[]) {
  safeWrite(keys.catalog, catalog);
}

export function loadTripSession(fallback: TripSession) {
  return safeRead(keys.tripSession, fallback);
}

export function saveTripSession(session: TripSession) {
  safeWrite(keys.tripSession, session);
}

export function loadMapRegion(fallback: MapRegionCache) {
  return safeRead(keys.mapRegion, fallback);
}

export function saveMapRegion(region: MapRegionCache) {
  safeWrite(keys.mapRegion, region);
}

export function loadEmergencyAnchors(fallback: EmergencyAnchor[]) {
  return safeRead(keys.emergencyAnchors, fallback);
}

export function saveEmergencyAnchors(anchors: EmergencyAnchor[]) {
  safeWrite(keys.emergencyAnchors, anchors);
}

export function loadLastLocation() {
  return safeRead<Coordinates | null>(keys.lastLocation, null);
}

export function saveLastLocation(location: Coordinates | null) {
  safeWrite(keys.lastLocation, location);
}

export function loadSyncIdentity() {
  return safeRead<SyncIdentity | null>(keys.syncIdentity, null);
}

export function saveSyncIdentity(identity: SyncIdentity) {
  safeWrite(keys.syncIdentity, identity);
}

export function loadSyncMetadata(fallback: SyncMetadata) {
  return safeRead(keys.syncMetadata, fallback);
}

export function saveSyncMetadata(metadata: SyncMetadata) {
  safeWrite(keys.syncMetadata, metadata);
}

export function buildTravelerState(
  profile: TravelerProfile,
  completedNodeIds: string[],
  reportMap: Record<string, VisitReport[]>
): TravelerState {
  return {
    profile,
    completedNodeIds,
    reportMap
  };
}

export function buildEditorialState(
  ingestionCandidates: IngestionCandidate[],
  publishedSources: PublishedSourceRecord[]
): EditorialState {
  return {
    ingestionCandidates,
    publishedSources
  };
}

export function loadIngestionCandidates() {
  return safeRead<IngestionCandidate[]>(keys.ingestionCandidates, []);
}

export function saveIngestionCandidates(candidates: IngestionCandidate[]) {
  safeWrite(keys.ingestionCandidates, candidates);
}

export function loadPublishedSources() {
  return safeRead<PublishedSourceRecord[]>(keys.publishedSources, []);
}

export function savePublishedSources(records: PublishedSourceRecord[]) {
  safeWrite(keys.publishedSources, records);
}
