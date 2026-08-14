// Prueba aislada de la extracción de intención con Groq (sin WhatsApp).
// Uso: npm run test:groq
import "dotenv/config";
import { extractIntent } from "../src/ai/groq";

const ejemplos = [
  "recordame el parcial de gestión el viernes a las 14",
  "gasté 5000 en sushi con mercado pago",
  "no se que poner aca",
];

async function main() {
  for (const texto of ejemplos) {
    console.log(`\nMensaje: "${texto}"`);
    const intent = await extractIntent(texto);
    console.log(JSON.stringify(intent, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
