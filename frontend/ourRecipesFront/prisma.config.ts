// Prisma 7.0 configuration file
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Provide fallback for build time when DATABASE_URL is not available
const databaseUrl = process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
