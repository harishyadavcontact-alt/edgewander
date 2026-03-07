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
  usedCache: boolean;
}

export interface ExperienceCatalog {
  experiences: ExperienceNode[];
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
