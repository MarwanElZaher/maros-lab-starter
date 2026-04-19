import { Logger, ConsoleTransport } from "@axiomhq/logging";

export const logger = new Logger({ transports: [new ConsoleTransport()] });

// Usage: logger.info("event.name", { key: "value" })
// To enable Axiom ingestion: wire up AxiomJSTransport with @axiomhq/js once installed.
