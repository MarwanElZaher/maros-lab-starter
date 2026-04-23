export const PRODUCT_SLUGS = [
  "acme-core",
  "acme-cloud",
  "acme-edge",
  "acme-analytics",
  "acme-security",
  "acme-connect",
  "acme-platform",
  "cross",
] as const;

export type ProductSlug = (typeof PRODUCT_SLUGS)[number];

export const OUTCOME_VALUES = ["won", "lost", "no-bid", "override"] as const;
export type OutcomeValue = (typeof OUTCOME_VALUES)[number];

/** Datasets where `product` is required (not just optional). */
export const PRODUCT_REQUIRED_DATASETS = new Set([
  "products",
  "pricing",
  "licensing",
  "user_guides",
]);

/** Datasets where `outcome` + `customer` are required. */
export const PAST_BIDS_ONLY_DATASETS = new Set(["past_bids"]);
