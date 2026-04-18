import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("Seeding database...");
  // Add seed data here for local development
  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
