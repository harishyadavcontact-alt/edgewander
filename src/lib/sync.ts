import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  RemoteTripSessionRecord,
  RemoteTravelerProfileRecord,
  SyncIdentity,
  SyncMetadata,
  SyncStatus,
  TravelerState,
  TripSession,
  VisitReport
} from "../types";

interface SyncConfig {
  url: string;
  anonKey: string;
}

export interface SyncRunArgs {
  identity: SyncIdentity | null;
  travelerState: TravelerState;
  tripSession: TripSession;
  metadata: SyncMetadata;
  enabled?: boolean;
}

export interface SyncRunResult {
  identity: SyncIdentity | null;
  travelerState: TravelerState;
  tripSession: TripSession;
  metadata: SyncMetadata;
  status: SyncStatus;
  mergedRemote: boolean;
}

let supabaseClient: SupabaseClient | null | undefined;

function buildFallbackId() {
  return `edgewander-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function asIso(value: string | null | undefined) {
  return value ?? "1970-01-01T00:00:00.000Z";
}

function cloneReport(report: VisitReport): VisitReport {
  return { ...report };
}

function cloneTravelerState(state: TravelerState): TravelerState {
  return {
    profile: {
      ...state.profile,
      noGos: [...state.profile.noGos],
      interestTags: [...state.profile.interestTags]
    },
    completedNodeIds: [...state.completedNodeIds],
    reportMap: Object.fromEntries(
      Object.entries(state.reportMap).map(([nodeId, reports]) => [nodeId, reports.map(cloneReport)])
    )
  };
}

function cloneTripSession(session: TripSession): TripSession {
  return {
    ...session,
    visitedNodes: [...session.visitedNodes],
    skippedNodes: [...session.skippedNodes],
    quarantinedNodes: [...session.quarantinedNodes],
    confessionals: [...session.confessionals],
    lastKnownLocation: { ...session.lastKnownLocation },
    lastMapRegion: {
      center: { ...session.lastMapRegion.center },
      zoom: session.lastMapRegion.zoom
    }
  };
}

function maxTimestamp(left: string | null, right: string | null) {
  return asIso(left) >= asIso(right) ? left : right;
}

export function defaultSyncMetadata(): SyncMetadata {
  return {
    travelerStateUpdatedAt: null,
    tripSessionUpdatedAt: null,
    lastSyncedAt: null,
    pendingPush: false,
    lastError: null
  };
}

export function mergeStringSets(left: string[], right: string[]) {
  return Array.from(new Set([...left, ...right]));
}

export function mergeReportMap(
  localReportMap: Record<string, VisitReport[]>,
  remoteReportMap: Record<string, VisitReport[]>
) {
  const mergedEntries = new Map<string, VisitReport>();

  for (const reports of [...Object.values(remoteReportMap), ...Object.values(localReportMap)]) {
    for (const report of reports) {
      mergedEntries.set(`${report.nodeId}:${report.createdAt}`, cloneReport(report));
    }
  }

  const next: Record<string, VisitReport[]> = {};
  const ordered = Array.from(mergedEntries.values()).sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );

  for (const report of ordered) {
    next[report.nodeId] = [...(next[report.nodeId] ?? []), report];
  }

  return next;
}

export function mergeTravelerState(
  localState: TravelerState,
  localUpdatedAt: string | null,
  remoteRecord: RemoteTravelerProfileRecord | null
) {
  if (!remoteRecord) {
    return {
      travelerState: cloneTravelerState(localState),
      updatedAt: localUpdatedAt
    };
  }

  const remoteState = remoteRecord.payload_json;
  const travelerState =
    asIso(remoteRecord.updated_at) > asIso(localUpdatedAt)
      ? cloneTravelerState(remoteState)
      : cloneTravelerState(localState);

  travelerState.completedNodeIds = mergeStringSets(
    localState.completedNodeIds,
    remoteState.completedNodeIds
  );
  travelerState.reportMap = mergeReportMap(localState.reportMap, remoteState.reportMap);

  return {
    travelerState,
    updatedAt: maxTimestamp(localUpdatedAt, remoteRecord.updated_at)
  };
}

export function mergeTripSession(
  localSession: TripSession,
  localUpdatedAt: string | null,
  remoteRecord: RemoteTripSessionRecord | null
) {
  if (!remoteRecord) {
    return {
      tripSession: cloneTripSession(localSession),
      updatedAt: localUpdatedAt
    };
  }

  const remoteSession = remoteRecord.payload_json;
  const tripSession =
    asIso(remoteRecord.updated_at) > asIso(localUpdatedAt)
      ? cloneTripSession(remoteSession)
      : cloneTripSession(localSession);

  tripSession.visitedNodes = mergeStringSets(localSession.visitedNodes, remoteSession.visitedNodes);
  tripSession.skippedNodes = mergeStringSets(localSession.skippedNodes, remoteSession.skippedNodes);
  tripSession.quarantinedNodes = mergeStringSets(
    localSession.quarantinedNodes,
    remoteSession.quarantinedNodes
  );
  tripSession.confessionals = mergeStringSets(localSession.confessionals, remoteSession.confessionals);

  return {
    tripSession,
    updatedAt: maxTimestamp(localUpdatedAt, remoteRecord.updated_at)
  };
}

function getSyncConfig(): SyncConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function isSyncConfigured() {
  return getSyncConfig() !== null;
}

function getSupabaseClient() {
  if (supabaseClient !== undefined) {
    return supabaseClient;
  }

  const config = getSyncConfig();
  if (!config) {
    supabaseClient = null;
    return supabaseClient;
  }

  supabaseClient = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  return supabaseClient;
}

export async function ensureSyncIdentity(existing: SyncIdentity | null) {
  const client = getSupabaseClient();
  if (!client) {
    return existing;
  }

  const currentSession = await client.auth.getSession();
  let user = currentSession.data.session?.user ?? null;

  if (!user) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) {
      throw error;
    }

    user = data.user;
  }

  if (!user) {
    return existing;
  }

  return {
    travelerId: user.id || existing?.travelerId || buildFallbackId(),
    mode: "anonymous",
    createdAt: existing?.createdAt ?? new Date().toISOString()
  } satisfies SyncIdentity;
}

async function fetchTravelerRecord(
  client: SupabaseClient,
  travelerId: string
): Promise<RemoteTravelerProfileRecord | null> {
  const { data, error } = await client
    .from("traveler_profiles")
    .select("traveler_id,payload_json,updated_at")
    .eq("traveler_id", travelerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as RemoteTravelerProfileRecord | null;
}

async function fetchTripSessionRecord(
  client: SupabaseClient,
  travelerId: string,
  tripSession: TripSession
): Promise<RemoteTripSessionRecord | null> {
  const { data, error } = await client
    .from("trip_sessions")
    .select("traveler_id,city,trip_start_date,payload_json,updated_at")
    .eq("traveler_id", travelerId)
    .eq("city", tripSession.city)
    .eq("trip_start_date", tripSession.tripStartDate)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as RemoteTripSessionRecord | null;
}

function shouldPushRecord(localUpdatedAt: string | null, remoteUpdatedAt: string | null) {
  return asIso(localUpdatedAt) >= asIso(remoteUpdatedAt);
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function pushTravelerRecord(
  client: SupabaseClient,
  travelerId: string,
  travelerState: TravelerState,
  updatedAt: string
) {
  const { error } = await client.from("traveler_profiles").upsert(
    {
      traveler_id: travelerId,
      payload_json: travelerState,
      updated_at: updatedAt
    },
    {
      onConflict: "traveler_id"
    }
  );

  if (error) {
    throw error;
  }
}

async function pushTripSessionRecord(
  client: SupabaseClient,
  travelerId: string,
  tripSession: TripSession,
  updatedAt: string
) {
  const { error } = await client.from("trip_sessions").upsert(
    {
      traveler_id: travelerId,
      city: tripSession.city,
      trip_start_date: tripSession.tripStartDate,
      payload_json: tripSession,
      updated_at: updatedAt
    },
    {
      onConflict: "traveler_id,city,trip_start_date"
    }
  );

  if (error) {
    throw error;
  }
}

export async function syncEdgeWanderState(args: SyncRunArgs): Promise<SyncRunResult> {
  const client = getSupabaseClient();
  if (!client || args.enabled === false) {
    return {
      identity: args.identity,
      travelerState: cloneTravelerState(args.travelerState),
      tripSession: cloneTripSession(args.tripSession),
      metadata: args.metadata,
      status: "idle",
      mergedRemote: false
    };
  }

  const identity = await ensureSyncIdentity(args.identity);
  if (!identity) {
    return {
      identity,
      travelerState: cloneTravelerState(args.travelerState),
      tripSession: cloneTripSession(args.tripSession),
      metadata: {
        ...args.metadata,
        pendingPush: true
      },
      status: "error",
      mergedRemote: false
    };
  }

  const [remoteTravelerRecord, remoteTripRecord] = await Promise.all([
    fetchTravelerRecord(client, identity.travelerId),
    fetchTripSessionRecord(client, identity.travelerId, args.tripSession)
  ]);

  const mergedTraveler = mergeTravelerState(
    args.travelerState,
    args.metadata.travelerStateUpdatedAt,
    remoteTravelerRecord
  );
  const mergedTrip = mergeTripSession(
    args.tripSession,
    args.metadata.tripSessionUpdatedAt,
    remoteTripRecord
  );

  const mergedRemote =
    !sameJson(mergedTraveler.travelerState, args.travelerState) ||
    !sameJson(mergedTrip.tripSession, args.tripSession);

  const needsTravelerPush =
    args.metadata.pendingPush ||
    !remoteTravelerRecord ||
    !sameJson(remoteTravelerRecord.payload_json, mergedTraveler.travelerState) ||
    shouldPushRecord(args.metadata.travelerStateUpdatedAt, remoteTravelerRecord.updated_at);
  const needsTripPush =
    args.metadata.pendingPush ||
    !remoteTripRecord ||
    !sameJson(remoteTripRecord.payload_json, mergedTrip.tripSession) ||
    shouldPushRecord(args.metadata.tripSessionUpdatedAt, remoteTripRecord.updated_at);

  const nextTravelerUpdatedAt = needsTravelerPush
    ? new Date().toISOString()
    : mergedTraveler.updatedAt;
  const nextTripUpdatedAt = needsTripPush ? new Date().toISOString() : mergedTrip.updatedAt;

  if (needsTravelerPush) {
    await pushTravelerRecord(client, identity.travelerId, mergedTraveler.travelerState, nextTravelerUpdatedAt ?? new Date().toISOString());
  }

  if (needsTripPush) {
    await pushTripSessionRecord(client, identity.travelerId, mergedTrip.tripSession, nextTripUpdatedAt ?? new Date().toISOString());
  }

  const lastSyncedAt = new Date().toISOString();

  return {
    identity,
    travelerState: mergedTraveler.travelerState,
    tripSession: mergedTrip.tripSession,
    metadata: {
      travelerStateUpdatedAt: nextTravelerUpdatedAt,
      tripSessionUpdatedAt: nextTripUpdatedAt,
      lastSyncedAt,
      pendingPush: false,
      lastError: null
    },
    status: "synced",
    mergedRemote
  };
}
