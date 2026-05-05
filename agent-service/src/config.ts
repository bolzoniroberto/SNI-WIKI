export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  wikijsUrl: process.env.WIKIJS_URL ?? "http://wiki:3000",
  wikijsToken: process.env.WIKIJS_TOKEN ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
  adminGroup: process.env.ADMIN_GROUP ?? "admins",
  port: Number(process.env.PORT ?? 8080),
};
