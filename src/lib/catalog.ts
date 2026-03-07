import { seedExperiences } from "../data/experiences";
import type { Destination, ExperienceNode, InterestTag, TimeOfDay } from "../types";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function defaultExperienceDraft(destination: Destination): ExperienceNode {
  return {
    id: `${destination.toLowerCase().replace(/[^a-z]+/g, "")}-new-node`,
    city: destination,
    area: "",
    neighborhood: "",
    title: "New editorial node",
    category: "Curated stop",
    lat: 0,
    lng: 0,
    areaRadius: 420,
    narrativeHook: "",
    themeTags: [],
    interestTags: ["history"],
    noveltyScore: 75,
    costBand: 1,
    durationMinutes: 60,
    operatingWindows: ["afternoon"],
    operatingHours: {
      openHour: 10,
      closeHour: 20
    },
    sourceTrustLevel: 0.92,
    edginess: 32,
    legalConfidence: 0.99,
    consentClarity: 1,
    transportExitQuality: 84,
    exitConfidence: 0.84,
    soloSafetyScore: 84,
    neighborhoodFloor: 58,
    arrivalModes: ["walk", "transit", "rideshare"],
    walkable: true,
    transitAccess: true,
    exitOptions: ["Pinned safe exit"],
    laneBias: "balanced",
    crowdIntensity: 35
  };
}

export function cloneSeedCatalog() {
  return seedExperiences.map((node) => ({
    ...node,
    themeTags: [...node.themeTags],
    interestTags: [...node.interestTags],
    operatingWindows: [...node.operatingWindows],
    operatingHours: { ...node.operatingHours },
    arrivalModes: [...node.arrivalModes],
    exitOptions: [...node.exitOptions],
    unlockAfter: node.unlockAfter ? [...node.unlockAfter] : undefined,
    driftTriggers: node.driftTriggers ? { ...node.driftTriggers } : undefined
  }));
}

export function validateCatalog(raw: unknown): ExperienceNode[] {
  if (!Array.isArray(raw)) {
    throw new Error("Catalog import must be a JSON array.");
  }

  return raw.map((entry, index) => validateNode(entry, index));
}

function validateNode(entry: unknown, index: number): ExperienceNode {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Catalog entry ${index + 1} is not an object.`);
  }

  const node = entry as Record<string, unknown>;
  const operatingWindows = asStringArray(node.operatingWindows);
  const themeTags = asStringArray(node.themeTags);
  const exitOptions = asStringArray(node.exitOptions);
  const unlockAfter = node.unlockAfter ? asStringArray(node.unlockAfter) : undefined;
  const interestTags = asInterestArray(node.interestTags);

  return {
    id: asString(node.id, "id"),
    city: asDestination(node.city),
    area: asString(node.area, "area"),
    neighborhood: asString(node.neighborhood, "neighborhood"),
    title: asString(node.title, "title"),
    category: asString(node.category, "category"),
    lat: asNumber(node.lat, "lat"),
    lng: asNumber(node.lng, "lng"),
    areaRadius: asNumber(node.areaRadius, "areaRadius"),
    narrativeHook: asString(node.narrativeHook, "narrativeHook"),
    themeTags,
    interestTags,
    noveltyScore: asNumber(node.noveltyScore, "noveltyScore"),
    costBand: asCostBand(node.costBand),
    durationMinutes: asNumber(node.durationMinutes, "durationMinutes"),
    operatingWindows: operatingWindows as TimeOfDay[],
    operatingHours: asOperatingHours(node.operatingHours),
    sourceTrustLevel: asNumber(node.sourceTrustLevel, "sourceTrustLevel"),
    edginess: asNumber(node.edginess, "edginess"),
    legalConfidence: asNumber(node.legalConfidence, "legalConfidence"),
    consentClarity: asNumber(node.consentClarity, "consentClarity"),
    transportExitQuality: asNumber(node.transportExitQuality, "transportExitQuality"),
    exitConfidence: asNumber(node.exitConfidence, "exitConfidence"),
    soloSafetyScore: asNumber(node.soloSafetyScore, "soloSafetyScore"),
    neighborhoodFloor: asNumber(node.neighborhoodFloor, "neighborhoodFloor"),
    arrivalModes: asArrivalModes(node.arrivalModes),
    walkable: asBoolean(node.walkable, "walkable"),
    transitAccess: asBoolean(node.transitAccess, "transitAccess"),
    exitOptions,
    laneBias: asLane(node.laneBias),
    remoteArea: asOptionalBoolean(node.remoteArea),
    nightlife: asOptionalBoolean(node.nightlife),
    alcoholForward: asOptionalBoolean(node.alcoholForward),
    crowdIntensity: asOptionalNumber(node.crowdIntensity),
    unlockAfter,
    driftTriggers: node.driftTriggers ? asDriftTriggers(node.driftTriggers) : undefined
  };
}

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Field "${field}" must be a non-empty string.`);
  }

  return value.trim();
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Expected an array of strings.");
  }

  return value.map((item) => {
    if (typeof item !== "string") {
      throw new Error("Expected an array of strings.");
    }

    return item;
  });
}

function asNumber(value: unknown, field: string) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Field "${field}" must be numeric.`);
  }

  return value;
}

function asOptionalNumber(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return asNumber(value, "optional");
}

function asOptionalBoolean(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error("Optional boolean field must be true or false.");
  }

  return value;
}

function asBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new Error(`Field "${field}" must be true or false.`);
  }

  return value;
}

function asDestination(value: unknown): Destination {
  if (value === "Tokyo" || value === "Berlin" || value === "New Orleans") {
    return value;
  }

  throw new Error('Field "city" must be Tokyo, Berlin, or New Orleans.');
}

function asInterestArray(value: unknown): InterestTag[] {
  const valid: InterestTag[] = [
    "ritual",
    "architecture",
    "craft",
    "subculture",
    "food",
    "music",
    "history"
  ];

  return asStringArray(value).map((item) => {
    if (!valid.includes(item as InterestTag)) {
      throw new Error(`Unknown interest tag "${item}".`);
    }

    return item as InterestTag;
  });
}

function asCostBand(value: unknown): 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) {
    return value;
  }

  throw new Error('Field "costBand" must be 1, 2, or 3.');
}

function asLane(value: unknown): "guardian" | "expressive" | "balanced" {
  if (value === "guardian" || value === "expressive" || value === "balanced") {
    return value;
  }

  throw new Error('Field "laneBias" must be guardian, expressive, or balanced.');
}

function asDriftTriggers(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error('Field "driftTriggers" must be an object.');
  }

  const triggers = value as Record<string, unknown>;
  return {
    timeOfDay: triggers.timeOfDay
      ? (asStringArray(triggers.timeOfDay) as TimeOfDay[])
      : undefined,
    weather: triggers.weather ? asStringArray(triggers.weather) as ("clear" | "mist" | "drizzle" | "storm")[] : undefined,
    minAppetite: asOptionalNumber(triggers.minAppetite),
    maxBudget: triggers.maxBudget ? asCostBand(triggers.maxBudget) : undefined
  };
}

function asOperatingHours(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error('Field "operatingHours" must be an object.');
  }

  const hours = value as Record<string, unknown>;
  return {
    openHour: asNumber(hours.openHour, "operatingHours.openHour"),
    closeHour: asNumber(hours.closeHour, "operatingHours.closeHour")
  };
}

function asArrivalModes(value: unknown) {
  const valid = ["walk", "transit", "rideshare"];
  return asStringArray(value).map((mode) => {
    if (!valid.includes(mode)) {
      throw new Error(`Unknown arrival mode "${mode}".`);
    }

    return mode as "walk" | "transit" | "rideshare";
  });
}

export function buildNodeId(city: Destination, title: string) {
  return `${city.toLowerCase().replace(/[^a-z]+/g, "")}-${slugify(title || "node")}`;
}
