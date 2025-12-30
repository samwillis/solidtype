/**
 * y-durable-streams - Yjs provider for Durable Streams
 *
 * Sync Yjs documents over append-only durable streams with optional
 * awareness (presence) support.
 * 
 * Vendored from https://github.com/durable-streams/durable-streams
 * TODO: Replace with @durable-streams/y-durable-streams when released
 *
 * @packageDocumentation
 */

// Main provider class and constants
export {
  DurableStreamsProvider,
  AWARENESS_HEARTBEAT_INTERVAL,
} from "./provider"

// Types
export type {
  DurableStreamsProviderOptions,
  DurableStreamsProviderEvents,
  ProviderStatus,
  StreamConfig,
  AwarenessConfig,
  AwarenessUpdate,
} from "./types"
