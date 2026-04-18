import { Logger } from "@axiomhq/nextjs";

export const logger = new Logger();

// Usage: logger.info("event.name", { key: "value" })
// Axiom dataset is set via NEXT_PUBLIC_AXIOM_DATASET + AXIOM_TOKEN env vars
