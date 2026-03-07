import { useEffect, useState, useTransition } from "react";
import { MapExplorer } from "./components/MapExplorer";
import { allInterests } from "./data/experiences";
import { buildNodeId, cloneSeedCatalog, defaultExperienceDraft, validateCatalog } from "./lib/catalog";
import { buildTrailResult, createTrailCache, summarizeReports } from "./lib/engine";
import { defaultMapRegions, emergencyAnchorsByCity, resolveLocationContext } from "./lib/spatial";
import {
  loadCompletedNodeIds,
  loadEmergencyAnchors,
  loadExperienceCatalog,
  loadLastLocation,
  loadMapRegion,
  loadProfile,
  loadReportMap,
  loadTrailCache,
  loadTripSession,
  saveCompletedNodeIds,
  saveEmergencyAnchors,
  saveExperienceCatalog,
  saveLastLocation,
  saveMapRegion,
  saveProfile,
  saveReportMap,
  saveTrailCache,
  saveTripSession
} from "./lib/storage";
import type {
  BranchStatus,
  Coordinates,
  CrowdVibe,
  Destination,
  EmergencyAnchor,
  ExperienceNode,
  InterestTag,
  MapRegionCache,
  NoGo,
  QuestArc,
  QuestBranch,
  RiskEnvelope,
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

function App() {
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
  const nodeTitles = Object.fromEntries(catalog.map((node) => [node.id, node.title]));

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
    saveTripSession(tripSession);
  }, [tripSession]);

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
    const nextRegion = defaultMapRegions[profile.destination];
    setMapRegion((current) =>
      current.center.lat === nextRegion.center.lat && current.center.lng === nextRegion.center.lng
        ? current
        : nextRegion
    );
    setTripSession((current) =>
      current.city === profile.destination
        ? current
        : defaultTripSession(profile.destination, profile.tripStart, nextRegion)
    );
    setCachedEmergencyAnchors(emergencyAnchorsByCity[profile.destination]);
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
    setTripSession((current) => ({
      ...current,
      city: profile.destination,
      tripStartDate: profile.tripStart,
      activeTrailGeneratedAt: trail.generatedAt,
      lastKnownLocation: trail.effectiveLocation,
      locationSource: trail.locationSource,
      lastMapRegion: trail.mapRegion
    }));
  }, [trail, profile.destination, profile.tripStart]);

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

  function toggleInterest(tag: InterestTag) {
    setProfile((current) => ({
      ...current,
      interestTags: current.interestTags.includes(tag)
        ? current.interestTags.filter((entry) => entry !== tag)
        : [...current.interestTags, tag]
    }));
  }

  function toggleNoGo(tag: NoGo) {
    setProfile((current) => ({
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

    setCompletedNodeIds((current) => Array.from(new Set([...current, branch.node!.id])));
    setTripSession((current) => ({
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

    setReportMap((current) => ({
      ...current,
      [activeReviewNodeId]: [...(current[activeReviewNodeId] ?? []), nextReport]
    }));
    setCompletedNodeIds((current) => Array.from(new Set([...current, activeReviewNodeId])));
    setTripSession((current) => ({
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

    setTripSession((current) => ({
      ...current,
      skippedNodes: Array.from(new Set([...current.skippedNodes, selectedExploreBranch.node!.id]))
    }));
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
        </div>
        <div className="signal-board">
          <div className="signal-board__label">Current envelope</div>
          <div className="signal-board__value">{modeLabel}</div>
          <div className="signal-grid">
            <SignalStat label="Red Thread" value={trail.redThread} tone="gold" />
            <SignalStat label="Destination" value={profile.destination} tone="teal" />
            <SignalStat label="Envelope floor" value={`${envelopeFloor}/100`} tone="smoke" />
            <SignalStat label="Catalog" value={`${catalog.length} curated nodes`} tone="rose" />
          </div>
        </div>
      </header>

      <main className="layout layout--expanded">
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
                  setProfile((current) => ({
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
                  setProfile((current) => ({ ...current, tripStart: event.target.value }))
                }
              />
            </label>

            <label className="field">
              <span>Trip end</span>
              <input
                type="date"
                value={profile.tripEnd}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, tripEnd: event.target.value }))
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
                    setProfile((current) => ({
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
                setProfile((current) => ({
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

        <section className="panel editor-panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Editorial console</span>
            <h2>Curate the weird map without touching code.</h2>
          </div>

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

          {editorMessage && <div className="banner banner--quiet">{editorMessage}</div>}

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
        </section>

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
              Save confessional
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
            Confessional
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
