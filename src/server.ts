import express from "express";
import { port, getWhatsappConfig } from "./config";
import { WhatsappWebhookPayload } from "./whatsapp/types";
import { handleIncomingMessage } from "./router/messageHandler";

const app = express();
app.use(express.json());

// Verificación del webhook (Meta hace un GET una sola vez al configurarlo).
app.get("/webhook", (req, res) => {
  const { verifyToken } = getWhatsappConfig();

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Recepción de mensajes entrantes.
app.post("/webhook", (req, res) => {
  // Responder 200 inmediatamente: Meta espera una respuesta rápida y
  // reintenta agresivamente si no la recibe a tiempo.
  res.sendStatus(200);

  const payload = req.body as WhatsappWebhookPayload;
  const messages = payload.entry?.flatMap((entry) => entry.changes.flatMap((change) => change.value.messages ?? [])) ?? [];

  for (const message of messages) {
    handleIncomingMessage(message).catch((err) => {
      console.error("Error no manejado procesando un mensaje:", err);
    });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});
