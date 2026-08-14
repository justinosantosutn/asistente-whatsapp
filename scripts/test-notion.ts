// Prueba aislada de la integración con Notion.
// Uso: npm run test:notion
import "dotenv/config";
import { createActivity, createExpense } from "../src/integrations/notion";

async function main() {
  console.log("Creando actividad de prueba en 'Repaso de Actividades'...");
  const activityUrl = await createActivity({
    actividad: "[PRUEBA] Evento de prueba del bot",
    fechaInicioIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    esDatetime: true,
    calendario: "Personal",
  });
  console.log("OK:", activityUrl);

  console.log("\nCreando gasto de prueba en 'Gastos Personales'...");
  const expenseUrl = await createExpense({
    descripcion: "[PRUEBA] Gasto de prueba del bot",
    monto: 1,
    categoria: "🎉 Salidas / ocio",
    medioPago: "💵 Efectivo",
    fechaIso: new Date().toISOString().slice(0, 10),
  });
  console.log("OK:", expenseUrl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
