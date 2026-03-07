import type {
  Coordinates,
  Destination,
  EmergencyAnchor,
  ExperienceNode,
  LocationContext,
  MapRegionCache,
  RoutePreview,
  TravelMode
} from "../types";

export const cityAnchors: Record<Destination, Coordinates> = {
  Tokyo: { lat: 35.6812, lng: 139.7671 },
  Berlin: { lat: 52.52, lng: 13.405 },
  "New Orleans": { lat: 29.9511, lng: -90.0715 }
};

export const defaultMapRegions: Record<Destination, MapRegionCache> = {
  Tokyo: { center: cityAnchors.Tokyo, zoom: 13 },
  Berlin: { center: cityAnchors.Berlin, zoom: 13 },
  "New Orleans": { center: cityAnchors["New Orleans"], zoom: 13 }
};

export const emergencyAnchorsByCity: Record<Destination, EmergencyAnchor[]> = {
  Tokyo: [
    {
      id: "tokyo-transit",
      city: "Tokyo",
      kind: "transit",
      label: "Tokyo Station Transit Spine",
      location: { lat: 35.6812, lng: 139.7671 }
    },
    {
      id: "tokyo-hospital",
      city: "Tokyo",
      kind: "hospital",
      label: "St. Luke's International Hospital",
      location: { lat: 35.6676, lng: 139.7771 }
    },
    {
      id: "tokyo-safe-lobby",
      city: "Tokyo",
      kind: "safe-lobby",
      label: "24h Hotel Lobby Spine",
      location: { lat: 35.6901, lng: 139.7006 }
    }
  ],
  Berlin: [
    {
      id: "berlin-transit",
      city: "Berlin",
      kind: "transit",
      label: "Alexanderplatz Transit Spine",
      location: { lat: 52.5219, lng: 13.4132 }
    },
    {
      id: "berlin-hospital",
      city: "Berlin",
      kind: "hospital",
      label: "Charite Emergency",
      location: { lat: 52.5255, lng: 13.3769 }
    },
    {
      id: "berlin-safe-lobby",
      city: "Berlin",
      kind: "safe-lobby",
      label: "Station Hotel Lobby Cluster",
      location: { lat: 52.5251, lng: 13.3694 }
    }
  ],
  "New Orleans": [
    {
      id: "nola-transit",
      city: "New Orleans",
      kind: "transit",
      label: "Canal Streetcar Spine",
      location: { lat: 29.9516, lng: -90.0711 }
    },
    {
      id: "nola-hospital",
      city: "New Orleans",
      kind: "hospital",
      label: "University Medical Center",
      location: { lat: 29.9584, lng: -90.0817 }
    },
    {
      id: "nola-safe-lobby",
      city: "New Orleans",
      kind: "safe-lobby",
      label: "French Quarter Hotel Lobby Spine",
      location: { lat: 29.9544, lng: -90.0684 }
    }
  ]
};

export function distanceKm(from: Coordinates, to: Coordinates) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function pickTravelMode(node: ExperienceNode, distance: number): TravelMode {
  if (node.walkable && distance <= 1.4) {
    return "walk";
  }

  if (node.transitAccess || node.arrivalModes.includes("transit")) {
    return "transit";
  }

  return "rideshare";
}

export function buildRoutePreview(from: Coordinates, node: ExperienceNode): RoutePreview {
  const distance = Number(distanceKm(from, { lat: node.lat, lng: node.lng }).toFixed(2));
  const mode = pickTravelMode(node, distance);
  const speedKmPerMinute = mode === "walk" ? 0.08 : mode === "transit" ? 0.35 : 0.42;
  const etaMinutes = Math.max(4, Math.round(distance / speedKmPerMinute));

  return {
    distanceKm: distance,
    etaMinutes,
    mode,
    exitSummary: node.exitOptions[0] ?? "Pinned safe exit nearby",
    confidence: Math.round(((node.exitConfidence + node.transportExitQuality / 100) / 2) * 100)
  };
}

export function nodeIsOpen(node: ExperienceNode, hour: number) {
  const { openHour, closeHour } = node.operatingHours;
  if (openHour <= closeHour) {
    return hour >= openHour && hour < closeHour;
  }

  return hour >= openHour || hour < closeHour;
}

export function resolveLocationContext(args: {
  destination: Destination;
  liveLocation?: Coordinates;
  cachedLocation?: Coordinates | null;
}): LocationContext {
  const cityAnchor = cityAnchors[args.destination];
  const liveIsInCity =
    args.liveLocation && distanceKm(args.liveLocation, cityAnchor) <= 18;

  if (args.liveLocation && liveIsInCity) {
    return {
      userLocation: args.liveLocation,
      effectiveLocation: args.liveLocation,
      cityAnchor,
      walkRadiusKm: 4.8,
      source: "live"
    };
  }

  if (args.cachedLocation) {
    return {
      userLocation: args.cachedLocation,
      effectiveLocation: args.cachedLocation,
      cityAnchor,
      walkRadiusKm: 4.8,
      source: "cached"
    };
  }

  return {
    effectiveLocation: cityAnchor,
    cityAnchor,
    walkRadiusKm: 4.8,
    source: "city-fallback"
  };
}
