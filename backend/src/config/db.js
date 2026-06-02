
const { neonConfig } = require("@neondatabase/serverless");
const { PrismaNeon } = require("@prisma/adapter-neon");
const { PrismaClient } = require("@prisma/client");
const ws = require("ws");
const env = require("./env");

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
