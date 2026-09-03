import { InMemorySovereignStore } from "./store.mjs";
import { CommandService } from "../command/command-service.mjs";
import { ContinuityService } from "../continuity/continuity-service.mjs";
import { TrafficService } from "../control-plane/traffic-service.mjs";
import { ExtensionHost } from "../extensions/extension-host.mjs";

export function createSovereignPlatform({ clock = () => new Date(), trafficPolicy } = {}) {
  const store = new InMemorySovereignStore();
  const command = new CommandService({ store, clock });
  const continuity = new ContinuityService({ store, clock });
  const traffic = new TrafficService({ store, clock, command, continuity, policy: trafficPolicy });
  const extensions = new ExtensionHost({ store, clock });
  return { store, command, continuity, traffic, extensions };
}
