import { useMemo } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Coordinates, MapRegionCache, TrailResult } from "../types";

function markerIcon(tone: "guardian" | "expressive" | "fallback" | "user" | "emergency") {
  return L.divIcon({
    className: "",
    html: `<span class="map-marker map-marker--${tone}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function RegionWatcher(props: {
  onRegionChange: (region: MapRegionCache) => void;
}) {
  useMapEvents({
    moveend(event) {
      const center = event.target.getCenter();
      props.onRegionChange({
        center: {
          lat: Number(center.lat.toFixed(6)),
          lng: Number(center.lng.toFixed(6))
        },
        zoom: event.target.getZoom()
      });
    }
  });

  return null;
}

export function MapExplorer(props: {
  trail: TrailResult;
  mapRegion: MapRegionCache;
  liveLocation?: Coordinates;
  onRegionChange: (region: MapRegionCache) => void;
  onSelectNode: (nodeId: string) => void;
  selectedNodeId?: string | null;
}) {
  const markers = useMemo(() => {
    const nodes = props.trail.arcs.flatMap((arc) => [
      { node: arc.guardian.node, tone: "guardian" as const },
      { node: arc.expressive.node, tone: "expressive" as const },
      { node: arc.fallback.node, tone: "fallback" as const }
    ]);

    return nodes.filter((entry) => entry.node);
  }, [props.trail.arcs]);

  return (
    <div className="map-shell">
      <MapContainer
        center={props.mapRegion.center}
        zoom={props.mapRegion.zoom}
        scrollWheelZoom={false}
        className="map-canvas"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RegionWatcher onRegionChange={props.onRegionChange} />

        <Marker
          position={props.liveLocation ?? props.trail.effectiveLocation}
          icon={markerIcon("user")}
        />
        <Circle
          center={props.trail.effectiveLocation}
          radius={props.trail.locationSource === "live" ? 4800 : 3600}
          pathOptions={{ color: "#85c6b6", opacity: 0.5, fillOpacity: 0.08 }}
        />

        {markers.map(({ node, tone }) => (
          <Marker
            key={`${tone}-${node!.id}`}
            position={{ lat: node!.lat, lng: node!.lng }}
            icon={markerIcon(tone)}
            eventHandlers={{
              click: () => props.onSelectNode(node!.id)
            }}
          />
        ))}

        {props.trail.emergencyAnchors.map((anchor) => (
          <Marker
            key={anchor.id}
            position={anchor.location}
            icon={markerIcon("emergency")}
            eventHandlers={{
              click: () => props.onSelectNode(anchor.id)
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
