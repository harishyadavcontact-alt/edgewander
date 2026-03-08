export type Destination = "Tokyo" | "Berlin" | "New Orleans";
export type BudgetBand = "lean" | "steady" | "flush";
export type TimeOfDay = "morning" | "afternoon" | "blue-hour" | "night";
export type WeatherState = "clear" | "mist" | "drizzle" | "storm";
export type Connectivity = "solid" | "patchy" | "offline";
export type InterestTag =
  | "ritual"
  | "architecture"
  | "craft"
  | "subculture"
  | "food"
  | "music"
  | "history";
export type NoGo = "nightlife" | "remote-areas" | "alcohol" | "crowds";
export type CrowdVibe = "warm" | "mixed" | "sharp";
export type CostBand = 1 | 2 | 3;
export type BranchStatus = "available" | "locked" | "suppressed" | "fallback";
export type TravelMode = "walk" | "transit" | "rideshare";
export type LocationSource = "live" | "city-fallback" | "cached";
export type SourceType = "editorial" | "google-places";
export type VerificationStatus = "pending" | "matched" | "approved" | "rejected" | "stale";
export type EditorialStatus = "draft" | "review" | "approved" | "rejected";
export type NodeFreshnessState = "fresh" | "aging" | "stale";

export interface TravelerProfile {
  destination: Destination;
  tripStart: string;
  tripEnd: string;
  budgetBand: BudgetBand;
  appetite: number;
  noGos: NoGo[];
  interestTags: InterestTag[];
}

export interface RiskEnvelope {
  timeOfDay: TimeOfDay;
  neighborhoodConfidence: number;
  weather: WeatherState;
  transportExitQuality: number;
  connectivity: Connectivity;
  legalConfidence: number;
  consentConfidence: number;
  soloSafetyScore: number;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface OperatingHours {
  openHour: number;
  closeHour: number;
}

export interface PlaceMetadata {
  address?: string;
  neighborhoodHint?: string;
  phone?: string;
  website?: string;
  rating?: number;
  userRatingsTotal?: number;
  mapsUrl?: string;
}

export interface TrustSignals {
  sourceConfidence: number;
  freshnessConfidence: number;
  locationConfidence: number;
  operationalConfidence: number;
}

export interface RecommendationTrace {
  id: string;
  nodeId?: string;
  arcId: string;
  lane: "guardian" | "expressive" | "fallback";
  outcome: "surfaced" | "suppressed" | "fallback" | "locked" | "demoted";
  score?: number;
  freshness: NodeFreshnessState;
  reasons: string[];
}

export interface PublishedNodeAudit {
  nodeId: string;
  sourceType: SourceType;
  sourceId?: string;
  freshness: NodeFreshnessState;
  verificationStatus: VerificationStatus;
  sourceUpdatedAt?: string;
  lastReviewedAt?: string;
  lastReviewNote?: string;
}

export interface QuestLogEntry {
  arcId: string;
  label: string;
  redThread: string;
  status: "completed" | "skipped" | "available" | "locked";
  nodeId?: string;
  nodeTitle?: string;
  lane: "guardian" | "expressive" | "fallback";
  createdAt: string;
}

export interface ExperienceNode {
  id: string;
  city: Destination;
  area: string;
  neighborhood: string;
  title: string;
  category: string;
  lat: number;
  lng: number;
  areaRadius: number;
  narrativeHook: string;
  themeTags: string[];
  interestTags: InterestTag[];
  noveltyScore: number;
  costBand: CostBand;
  durationMinutes: number;
  operatingWindows: TimeOfDay[];
  operatingHours: OperatingHours;
  sourceTrustLevel: number;
  edginess: number;
  legalConfidence: number;
  consentClarity: number;
  transportExitQuality: number;
  exitConfidence: number;
  soloSafetyScore: number;
  neighborhoodFloor: number;
  arrivalModes: TravelMode[];
  walkable: boolean;
  transitAccess: boolean;
  exitOptions: string[];
  laneBias: "guardian" | "expressive" | "balanced";
  remoteArea?: boolean;
  nightlife?: boolean;
  alcoholForward?: boolean;
  crowdIntensity?: number;
  unlockAfter?: string[];
  driftTriggers?: {
    timeOfDay?: TimeOfDay[];
    weather?: WeatherState[];
    minAppetite?: number;
    maxBudget?: CostBand;
  };
  sourceType: SourceType;
  sourceId?: string;
  sourceUpdatedAt?: string;
  verificationStatus: VerificationStatus;
  editorialStatus: EditorialStatus;
  lastReviewedAt?: string;
  editorialNotes?: string;
  trustSignals: TrustSignals;
  placeMetadata?: PlaceMetadata;
}

export interface QuestBranch {
  lane: "guardian" | "expressive";
  status: BranchStatus;
  node?: ExperienceNode;
  routePreview?: RoutePreview;
  rationale: string;
  exitPlan: string;
  suppressionReason?: string;
}

export interface DriftCard {
  title: string;
  copy: string;
  trigger: string;
  node: ExperienceNode;
}

export interface QuestArc {
  id: string;
  label: string;
  theme: string;
  introCopy: string;
  primaryNode: ExperienceNode;
  guardian: QuestBranch;
  expressive: QuestBranch;
  fallback: QuestBranch;
  driftCard?: DriftCard;
  unlockConditions: string[];
  fallbackPath: string;
}

export interface VisitReport {
  nodeId: string;
  rewardRating: number;
  stressRating: number;
  consentClarity: number;
  crowdVibe: CrowdVibe;
  exitability: number;
  wouldSoloAgain: boolean;
  note: string;
  createdAt: string;
}

export interface ReviewSummary {
  reportCount: number;
  averageReward: number;
  averageStress: number;
  averageConsent: number;
  averageExitability: number;
  soloAgainRate: number;
  quarantine: boolean;
  caution: boolean;
}

export interface TrailCache {
  destination: Destination;
  redThread: string;
  generatedAt: string;
  arcs: QuestArc[];
  emergencyEssentials: string[];
  emergencyAnchors: EmergencyAnchor[];
  locationSource: LocationSource;
  effectiveLocation: Coordinates;
  mapRegion: MapRegionCache;
  traces: RecommendationTrace[];
  audits: PublishedNodeAudit[];
  questLog: QuestLogEntry[];
}

export interface TrailResult {
  destination: Destination;
  redThread: string;
  generatedAt: string;
  arcs: QuestArc[];
  emergencyEssentials: string[];
  emergencyAnchors: EmergencyAnchor[];
  locationSource: LocationSource;
  effectiveLocation: Coordinates;
  mapRegion: MapRegionCache;
  traces: RecommendationTrace[];
  audits: PublishedNodeAudit[];
  questLog: QuestLogEntry[];
  usedCache: boolean;
}

export interface ExperienceCatalog {
  experiences: ExperienceNode[];
}

export interface IngestionQuery {
  city: Destination;
  query: string;
}

export interface CandidateMatch {
  nodeId: string;
  title: string;
  score: number;
  reason: string;
}

export interface IngestionCandidate {
  id: string;
  city: Destination;
  query: string;
  sourceType: "google-places";
  sourceId: string;
  title: string;
  category: string;
  neighborhood: string;
  lat: number;
  lng: number;
  areaRadius: number;
  sourceUpdatedAt: string;
  verificationStatus: VerificationStatus;
  editorialStatus: Exclude<EditorialStatus, "approved">;
  trustSignals: TrustSignals;
  placeMetadata?: PlaceMetadata;
  matchedNodeId?: string;
  matches: CandidateMatch[];
  editorialNotes?: string;
  importedAt: string;
  lastReviewedAt?: string;
}

export interface CandidateReviewDecision {
  candidateId: string;
  action: "approve" | "reject" | "hold" | "merge";
  targetNodeId?: string;
  notes?: string;
}

export interface PublishedSourceRecord {
  nodeId: string;
  sourceType: "google-places";
  sourceId: string;
  publishedAt: string;
}

export interface EditorialState {
  ingestionCandidates: IngestionCandidate[];
  publishedSources: PublishedSourceRecord[];
}

export interface RoutePreview {
  distanceKm: number;
  etaMinutes: number;
  mode: TravelMode;
  exitSummary: string;
  confidence: number;
}

export interface EmergencyAnchor {
  id: string;
  city: Destination;
  kind: "hospital" | "transit" | "safe-lobby";
  label: string;
  location: Coordinates;
}

export interface LocationContext {
  userLocation?: Coordinates;
  effectiveLocation: Coordinates;
  cityAnchor: Coordinates;
  walkRadiusKm: number;
  source: LocationSource;
}

export interface MapRegionCache {
  center: Coordinates;
  zoom: number;
}

export interface TripSession {
  city: Destination;
  tripStartDate: string;
  activeTrailGeneratedAt: string | null;
  visitedNodes: string[];
  skippedNodes: string[];
  quarantinedNodes: string[];
  confessionals: string[];
  lastKnownLocation: Coordinates;
  locationSource: LocationSource;
  lastMapRegion: MapRegionCache;
}

export interface TravelerState {
  profile: TravelerProfile;
  completedNodeIds: string[];
  reportMap: Record<string, VisitReport[]>;
}

export interface SyncIdentity {
  travelerId: string;
  mode: "anonymous";
  createdAt: string;
}

export interface SyncMetadata {
  travelerStateUpdatedAt: string | null;
  tripSessionUpdatedAt: string | null;
  editorialStateUpdatedAt: string | null;
  lastSyncedAt: string | null;
  pendingPush: boolean;
  lastError: string | null;
}

export interface RemoteTravelerProfileRecord {
  traveler_id: string;
  payload_json: TravelerState;
  updated_at: string;
}

export interface RemoteTripSessionRecord {
  traveler_id: string;
  city: Destination;
  trip_start_date: string;
  payload_json: TripSession;
  updated_at: string;
}

export interface RemoteEditorialStateRecord {
  traveler_id: string;
  payload_json: EditorialState;
  updated_at: string;
}

export type SyncStatus = "idle" | "syncing" | "offline" | "error" | "synced";
