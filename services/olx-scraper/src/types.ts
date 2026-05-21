import { z } from 'zod';

export const ListingSchema = z.object({
  post_url: z.string(),
  mobile_number: z.string(),
  description_snippet: z.string(),
  price: z.string(),
  size: z.string(),
  source: z.string().optional(),
});

export type Listing = z.infer<typeof ListingSchema>;

export interface ScrapeParams {
  location: string;
  sizeMin: number;
  sizeMax: number;
  priceMax?: number;
}
