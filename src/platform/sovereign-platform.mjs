import { InMemorySovereignStore } from "./store.mjs";
import { CommandService } from "../command/command-service.mjs";
import { ContinuityService } from "../continuity/continuity-service.mjs";
import { V1TrafficService } from "../control-plane/v1-traffic-service.mjs";
import { ExtensionHost } from "../extensions/extension-host.mjs";
import { SourceService } from "../sources/source-service.mjs";
import { IntelligenceService } from "../intelligence/intelligence-service.mjs";
import { InitializationService } from "../initialization/initialization-service.mjs";
import { ImprovementService } from "../improvement/improvement-service.mjs";
import { RecoveryService } from "../recovery/recovery-service.mjs";

export function createSovereignPlatform({ clock = () => new Date(), trafficPolicy, store = new InMemorySovereignStore() } = {}) {
  const command = new CommandService({ store, clock });
  const continuity = new ContinuityService({ store, clock });
  const sources = new SourceService({ store, clock });
  const intelligence = new IntelligenceService({ store, clock });
  const initialization = new InitializationService({ store, clock, sources, intelligence });
  const improvement = new ImprovementService({ store, clock });
  const recovery = new RecoveryService({ store, clock, intelligence, sources, initialization, improvement });
  const extensions = new ExtensionHost({ store, clock });
  const traffic = new V1TrafficService({ store, clock, command, continuity, intelligence, sources, extensions, policy: trafficPolicy });
  return { store, command, continuity, sources, intelligence, initialization, improvement, recovery, traffic, extensions };
}
