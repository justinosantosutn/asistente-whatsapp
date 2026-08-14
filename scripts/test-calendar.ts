// Prueba aislada de la integración con Google Calendar.
// Uso: npm run test:calendar (requiere haber corrido antes npm run oauth:google)
import "dotenv/config";
import { createEvent } from "../src/integrations/googleCalendar";

async function main() {
  console.log("Creando evento de prueba en Google Calendar...");
  const link = await createEvent({
    summary: "[PRUEBA] Evento de prueba del bot",
    description: "Creado por el script de prueba del asistente de WhatsApp.",
    startIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    isAllDay: false,
  });
  console.log("OK:", link);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
