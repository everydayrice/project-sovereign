import { InMemorySovereignStore } from "./store.mjs";
import { CommandService } from "../command/command-service.mjs";
import { ContinuityService } from "../continuity/continuity-service.mjs";
import { TrafficService } from "../control-plane/traffic-service.mjs";
import { ExtensionHost } from "../extensions/extension-host.mjs";
import { SourceService } from "../sources/source-service.mjs";
import { IntelligenceService } from "../intelligence/intelligence-service.mjs";
import { InitializationService } from "../initialization/initialization-service.mjs";
import { ImprovementService } from "../improvement/improvement-service.mjs";
import { RecoveryService } from "../recovery/recovery-service.mjs";

export function createSovereignPlatform({ clock = () => new Date(), trafficPolicy } = {}) {
  const store = new InMemorySovereignStore();
  const command = new CommandService({ store, clock });
  const continuity = new ContinuityService({ store, clock });
  const sources = new SourceService({ store, clock });
  const intelligence = new IntelligenceService({ store, clock });
  const initialization = new InitializationService({ store, clock, sources, intelligence });
  const improvement = new ImprovementService({ store, clock });
  const recovery = new RecoveryService({ store, clock, intelligence, sources, initialization, improvement });
  const traffic = new TrafficService({ store, clock, command, continuity, policy: trafficPolicy });
  const extensions = new ExtensionHost({ store, clock });
  return { store, command, continuity, sources, intelligence, initialization, improvement, recovery, traffic, extensions };
}
