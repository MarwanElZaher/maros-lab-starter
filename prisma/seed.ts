import { PrismaClient, UserRole } from "@prisma/client";

const db = new PrismaClient();

// 6 named users — 2 sales directors, 4 presales engineers.
// Replace emails with real CF Access team emails before production deploy.
const APP_USERS: { email: string; role: UserRole }[] = [
  { email: "marwan@marwanelzaher.info", role: "sales_director" },
  { email: "director@marwanelzaher.info", role: "sales_director" },
  { email: "eng1@marwanelzaher.info", role: "presales_engineer" },
  { email: "eng2@marwanelzaher.info", role: "presales_engineer" },
  { email: "eng3@marwanelzaher.info", role: "presales_engineer" },
  { email: "eng4@marwanelzaher.info", role: "presales_engineer" },
];

async function main() {
  console.log("Seeding database...");

  for (const user of APP_USERS) {
    await db.appUser.upsert({
      where: { email: user.email },
      update: { role: user.role },
      create: user,
    });
    console.log(`  upserted ${user.role}: ${user.email}`);
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
