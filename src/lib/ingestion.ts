import { buildNodeId, defaultExperienceDraft } from "./catalog";
import type {
  CandidateMatch,
  CandidateReviewDecision,
  Destination,
  ExperienceNode,
  IngestionCandidate,
  IngestionQuery,
  InterestTag,
  PublishedSourceRecord,
  VerificationStatus
} from "../types";

interface GooglePlaceResult {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  types?: string[];
  geometry?: {
    location?: {
      lat: number;
      lng: number;
    };
  };
  opening_hours?: {
    open_now?: boolean;
  };
  rating?: number;
  user_ratings_total?: number;
  website?: string;
  international_phone_number?: string;
  maps_url?: string;
}

export interface CandidatePublishDraft {
  title: string;
  category: string;
  narrativeHook: string;
  themeTags: string[];
  interestTags: InterestTag[];
  legalConfidence: number;
  consentClarity: number;
  exitOptions: string[];
  laneBias: ExperienceNode["laneBias"];
  edginess: number;
  costBand: ExperienceNode["costBand"];
  durationMinutes: number;
  operatingWindows: ExperienceNode["operatingWindows"];
  editorialNotes?: string;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function stringSimilarity(left: string, right: string) {
  const leftTokens = new Set(slug(left).split("-").filter(Boolean));
  const rightTokens = new Set(slug(right).split("-").filter(Boolean));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const total = new Set([...leftTokens, ...rightTokens]).size;
  return total === 0 ? 0 : overlap / total;
}

function distanceRoughKm(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number }
) {
  const latDelta = (left.lat - right.lat) * 111;
  const lngDelta = (left.lng - right.lng) * 85;
  return Math.sqrt(latDelta * latDelta + lngDelta * lngDelta);
}

function categoryFromTypes(types: string[] | undefined) {
  const joined = (types ?? []).join(" ");
  if (joined.includes("museum")) return "Museum stop";
  if (joined.includes("book_store")) return "Specialty bookstore";
  if (joined.includes("cafe")) return "Cafe stop";
  if (joined.includes("bar")) return "Ticketed room";
  if (joined.includes("art_gallery")) return "Gallery detour";
  return "Curated place candidate";
}

function trustSignals(place: GooglePlaceResult) {
  const ratings = place.user_ratings_total ?? 0;
  return {
    sourceConfidence: 0.84,
    freshnessConfidence: 0.88,
    locationConfidence: place.geometry?.location ? 0.94 : 0.6,
    operationalConfidence: ratings > 20 ? 0.82 : 0.68
  };
}

function candidateNeighborhood(place: GooglePlaceResult) {
  const raw = place.vicinity || place.formatted_address || "Unknown district";
  return raw.split(",")[0]?.trim() || "Unknown district";
}

export function buildCandidateMatches(
  candidate: Pick<IngestionCandidate, "sourceId" | "title" | "lat" | "lng">,
  catalog: ExperienceNode[]
) {
  return catalog
    .map((node) => {
      const exactSourceMatch = node.sourceId && node.sourceId === candidate.sourceId ? 1 : 0;
      const titleScore = stringSimilarity(candidate.title, node.title);
      const distanceScore = Math.max(0, 1 - distanceRoughKm(candidate, node) / 4);
      const score = Number((exactSourceMatch * 0.5 + titleScore * 0.35 + distanceScore * 0.15).toFixed(2));
      if (score < 0.38) {
        return null;
      }

      let reason = "Geo/title similarity";
      if (exactSourceMatch) {
        reason = "Existing source ID match";
      } else if (titleScore > 0.72) {
        reason = "Strong title overlap";
      }

      return {
        nodeId: node.id,
        title: node.title,
        score,
        reason
      } satisfies CandidateMatch;
    })
    .filter(Boolean)
    .sort((left, right) => right!.score - left!.score) as CandidateMatch[];
}

function verificationFromMatches(matches: CandidateMatch[]): VerificationStatus {
  if (matches.length === 0) {
    return "pending";
  }

  return matches[0].score >= 0.72 ? "matched" : "pending";
}

function normalizeGooglePlace(
  place: GooglePlaceResult,
  query: IngestionQuery,
  catalog: ExperienceNode[]
): IngestionCandidate {
  const base = {
    sourceId: place.place_id,
    title: place.name,
    lat: Number((place.geometry?.location?.lat ?? 0).toFixed(6)),
    lng: Number((place.geometry?.location?.lng ?? 0).toFixed(6))
  };
  const matches = buildCandidateMatches(base, catalog);

  return {
    id: `candidate-${query.city.toLowerCase().replace(/[^a-z]+/g, "")}-${slug(place.place_id)}`,
    city: query.city,
    query: query.query,
    sourceType: "google-places",
    sourceId: place.place_id,
    title: place.name,
    category: categoryFromTypes(place.types),
    neighborhood: candidateNeighborhood(place),
    lat: base.lat,
    lng: base.lng,
    areaRadius: 420,
    sourceUpdatedAt: new Date().toISOString(),
    verificationStatus: verificationFromMatches(matches),
    editorialStatus: "review",
    trustSignals: trustSignals(place),
    placeMetadata: {
      address: place.formatted_address,
      neighborhoodHint: candidateNeighborhood(place),
      phone: place.international_phone_number,
      website: place.website,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      mapsUrl: place.maps_url
    },
    matchedNodeId: matches[0]?.nodeId,
    matches,
    importedAt: new Date().toISOString()
  };
}

function mockPlaces(query: IngestionQuery): GooglePlaceResult[] {
  const seeds: Record<Destination, GooglePlaceResult[]> = {
    Tokyo: [
      {
        place_id: "google_tokyo_occult_books",
        name: "Jimbocho Folklore Annex",
        vicinity: "Jimbocho, Tokyo",
        formatted_address: "Jimbocho, Chiyoda City, Tokyo",
        types: ["book_store", "point_of_interest"],
        geometry: { location: { lat: 35.6968, lng: 139.7581 } },
        opening_hours: { open_now: true },
        rating: 4.5,
        user_ratings_total: 87,
        maps_url: "https://maps.google.com/?cid=google_tokyo_occult_books"
      },
      {
        place_id: "google_tokyo_print_courtyard",
        name: "Kagurazaka Paper Courtyard",
        vicinity: "Kagurazaka, Tokyo",
        formatted_address: "Kagurazaka, Shinjuku City, Tokyo",
        types: ["art_gallery", "point_of_interest"],
        geometry: { location: { lat: 35.702, lng: 139.7401 } },
        opening_hours: { open_now: true },
        rating: 4.2,
        user_ratings_total: 32
      }
    ],
    Berlin: [
      {
        place_id: "google_berlin_signal_archive",
        name: "Signal Archive Courtyard",
        vicinity: "Mitte, Berlin",
        formatted_address: "Mitte, Berlin",
        types: ["museum", "point_of_interest"],
        geometry: { location: { lat: 52.5215, lng: 13.4056 } },
        opening_hours: { open_now: true },
        rating: 4.6,
        user_ratings_total: 53
      }
    ],
    "New Orleans": [
      {
        place_id: "google_nola_ritual_house",
        name: "River Parish Story House",
        vicinity: "French Quarter, New Orleans",
        formatted_address: "French Quarter, New Orleans, LA",
        types: ["museum", "tourist_attraction"],
        geometry: { location: { lat: 29.9591, lng: -90.0638 } },
        opening_hours: { open_now: true },
        rating: 4.4,
        user_ratings_total: 45
      }
    ]
  };

  return seeds[query.city].filter((place) =>
    `${place.name} ${place.vicinity ?? ""}`.toLowerCase().includes(query.query.toLowerCase()) ||
    query.query.trim().length < 4
  );
}

async function fetchGooglePlaces(query: IngestionQuery) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return mockPlaces(query);
  }

  const response = await fetch(`${url}/functions/v1/google-places-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey
    },
    body: JSON.stringify(query)
  });

  if (!response.ok) {
    return mockPlaces(query);
  }

  const payload = (await response.json()) as { places?: GooglePlaceResult[] };
  return payload.places ?? [];
}

export async function importGooglePlacesCandidates(
  query: IngestionQuery,
  catalog: ExperienceNode[],
  existingCandidates: IngestionCandidate[]
) {
  const places = await fetchGooglePlaces(query);
  const normalized = places.map((place) => normalizeGooglePlace(place, query, catalog));

  const existingIds = new Set(existingCandidates.map((candidate) => candidate.sourceId));
  return normalized.filter((candidate) => !existingIds.has(candidate.sourceId));
}

export function candidateDraftFromSource(candidate: IngestionCandidate): CandidatePublishDraft {
  return {
    title: candidate.title,
    category: candidate.category,
    narrativeHook: `A newly verified place candidate in ${candidate.neighborhood} that still needs EdgeWander framing before it goes live.`,
    themeTags: [],
    interestTags: ["history"],
    legalConfidence: 0.98,
    consentClarity: 1,
    exitOptions: ["Pinned safe exit nearby"],
    laneBias: "balanced",
    edginess: 28,
    costBand: 1,
    durationMinutes: 60,
    operatingWindows: ["afternoon"],
    editorialNotes: candidate.editorialNotes
  };
}

export function canPublishCandidate(draft: CandidatePublishDraft) {
  return (
    draft.narrativeHook.trim().length > 10 &&
    draft.themeTags.length > 0 &&
    draft.interestTags.length > 0 &&
    draft.legalConfidence >= 0.95 &&
    draft.consentClarity >= 0.95 &&
    draft.exitOptions.filter((entry) => entry.trim().length > 0).length > 0
  );
}

export function publishCandidateToCatalog(args: {
  candidate: IngestionCandidate;
  draft: CandidatePublishDraft;
  catalog: ExperienceNode[];
  targetNodeId?: string;
}) {
  if (!canPublishCandidate(args.draft)) {
    throw new Error("Candidate is missing required Guardian fields for publication.");
  }

  const target = args.targetNodeId
    ? args.catalog.find((node) => node.id === args.targetNodeId)
    : undefined;

  if (target) {
    const mergedNode: ExperienceNode = {
      ...target,
      title: args.draft.title,
      category: args.draft.category,
      narrativeHook: args.draft.narrativeHook,
      themeTags: args.draft.themeTags,
      interestTags: args.draft.interestTags,
      legalConfidence: args.draft.legalConfidence,
      consentClarity: args.draft.consentClarity,
      exitOptions: args.draft.exitOptions,
      laneBias: args.draft.laneBias,
      edginess: args.draft.edginess,
      costBand: args.draft.costBand,
      durationMinutes: args.draft.durationMinutes,
      operatingWindows: args.draft.operatingWindows,
      sourceType: "google-places",
      sourceId: args.candidate.sourceId,
      sourceUpdatedAt: args.candidate.sourceUpdatedAt,
      verificationStatus: "approved",
      editorialStatus: "approved",
      lastReviewedAt: new Date().toISOString(),
      editorialNotes: args.draft.editorialNotes,
      trustSignals: args.candidate.trustSignals,
      placeMetadata: args.candidate.placeMetadata,
      neighborhood: args.candidate.neighborhood,
      lat: args.candidate.lat,
      lng: args.candidate.lng,
      areaRadius: args.candidate.areaRadius
    };

    return {
      nextCatalog: args.catalog.map((node) => (node.id === target.id ? mergedNode : node)),
      published: {
        nodeId: target.id,
        sourceType: "google-places",
        sourceId: args.candidate.sourceId,
        publishedAt: new Date().toISOString()
      } satisfies PublishedSourceRecord
    };
  }

  const base = defaultExperienceDraft(args.candidate.city);
  const nextNode: ExperienceNode = {
    ...base,
    id: buildNodeId(args.candidate.city, args.draft.title),
    city: args.candidate.city,
    area: args.candidate.neighborhood,
    neighborhood: args.candidate.neighborhood,
    title: args.draft.title,
    category: args.draft.category,
    lat: args.candidate.lat,
    lng: args.candidate.lng,
    areaRadius: args.candidate.areaRadius,
    narrativeHook: args.draft.narrativeHook,
    themeTags: args.draft.themeTags,
    interestTags: args.draft.interestTags,
    legalConfidence: args.draft.legalConfidence,
    consentClarity: args.draft.consentClarity,
    exitOptions: args.draft.exitOptions,
    laneBias: args.draft.laneBias,
    edginess: args.draft.edginess,
    costBand: args.draft.costBand,
    durationMinutes: args.draft.durationMinutes,
    operatingWindows: args.draft.operatingWindows,
    sourceType: "google-places",
    sourceId: args.candidate.sourceId,
    sourceUpdatedAt: args.candidate.sourceUpdatedAt,
    verificationStatus: "approved",
    editorialStatus: "approved",
    lastReviewedAt: new Date().toISOString(),
    editorialNotes: args.draft.editorialNotes,
    trustSignals: args.candidate.trustSignals,
    placeMetadata: args.candidate.placeMetadata
  };

  return {
    nextCatalog: [...args.catalog, nextNode],
    published: {
      nodeId: nextNode.id,
      sourceType: "google-places",
      sourceId: args.candidate.sourceId,
      publishedAt: new Date().toISOString()
    } satisfies PublishedSourceRecord
  };
}

export function applyCandidateDecision(
  candidates: IngestionCandidate[],
  decision: CandidateReviewDecision
) {
  return candidates.map((candidate) => {
    if (candidate.id !== decision.candidateId) {
      return candidate;
    }

    if (decision.action === "approve" || decision.action === "merge") {
      return {
        ...candidate,
        verificationStatus: "approved" as const,
        editorialStatus: "review" as const,
        matchedNodeId: decision.targetNodeId ?? candidate.matchedNodeId,
        editorialNotes: decision.notes,
        lastReviewedAt: new Date().toISOString()
      } satisfies IngestionCandidate;
    }

    if (decision.action === "reject") {
      return {
        ...candidate,
        verificationStatus: "rejected" as const,
        editorialStatus: "rejected" as const,
        editorialNotes: decision.notes,
        lastReviewedAt: new Date().toISOString()
      } satisfies IngestionCandidate;
    }

    return {
      ...candidate,
      editorialStatus: "review" as const,
      editorialNotes: decision.notes,
      lastReviewedAt: new Date().toISOString()
    } satisfies IngestionCandidate;
  });
}

export function trustBadgeForNode(node: ExperienceNode) {
  const ageMs = node.sourceUpdatedAt
    ? Date.now() - new Date(node.sourceUpdatedAt).getTime()
    : 0;
  const fresh = ageMs < 1000 * 60 * 60 * 24 * 21;
  const stale = ageMs > 1000 * 60 * 60 * 24 * 45;

  if (stale && node.sourceType === "google-places") {
    return "Stale source";
  }

  if (node.verificationStatus === "approved" && fresh && node.sourceType === "google-places") {
    return "Freshly verified";
  }

  if (node.verificationStatus === "approved") {
    return "Vetted";
  }

  if (node.verificationStatus === "stale") {
    return "Stale source";
  }

  return "Editorial";
}
