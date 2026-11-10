import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Client generation can run without a database URL or application secrets
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
