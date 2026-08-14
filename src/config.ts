import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

// Cada sección se valida de forma perezosa (solo al usarla), así los scripts
// de prueba de una sola integración no fallan por variables de otras que
// todavía no estén configuradas.

export const port = Number(process.env.PORT ?? 3000);
export const timezone = process.env.TIMEZONE ?? "America/Argentina/Buenos_Aires";

export function getWhatsappConfig() {
  return {
    verifyToken: required("WHATSAPP_VERIFY_TOKEN"),
    accessToken: required("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v20.0",
  };
}

export function getGroqConfig() {
  return {
    apiKey: required("GROQ_API_KEY"),
    transcriptionModel: process.env.GROQ_TRANSCRIPTION_MODEL ?? "whisper-large-v3-turbo",
    visionModel: process.env.GROQ_VISION_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct",
    textModel: process.env.GROQ_TEXT_MODEL ?? "llama-3.3-70b-versatile",
  };
}

export function getNotionConfig() {
  return {
    token: required("NOTION_TOKEN"),
    activitiesDataSourceId: required("NOTION_ACTIVITIES_DATABASE_ID"),
    expensesDataSourceId: required("NOTION_EXPENSES_DATABASE_ID"),
  };
}

export function getGoogleConfig() {
  return {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/oauth2callback",
    refreshToken: required("GOOGLE_REFRESH_TOKEN"),
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
  };
}

// Config combinada para el servidor completo (requiere todas las variables).
export function getFullConfig() {
  return {
    port,
    timezone,
    whatsapp: getWhatsappConfig(),
    groq: getGroqConfig(),
    notion: getNotionConfig(),
    google: getGoogleConfig(),
  };
}
