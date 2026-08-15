import { getWhatsappConfig } from "../config";

function graphUrl(path: string): string {
  const { apiVersion } = getWhatsappConfig();
  return `https://graph.facebook.com/${apiVersion}/${path}`;
}

// Los números argentinos llegan en los webhooks con un "9" extra tras el
// código de país (ej. 54 9 3471 344387, indicador histórico de celular),
// pero la Graph API rechaza ese formato al enviar mensajes: hay que sacar
// el "9" para que coincida con el número tal como está en la lista de
// destinatarios autorizados.
function toSendableNumber(waId: string): string {
  return waId.startsWith("549") ? `54${waId.slice(3)}` : waId;
}

export async function sendText(to: string, body: string): Promise<void> {
  const { accessToken, phoneNumberId } = getWhatsappConfig();

  const res = await fetch(graphUrl(`${phoneNumberId}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toSendableNumber(to),
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Error enviando mensaje de WhatsApp (${res.status}): ${errorBody}`);
  }
}

// Descarga un archivo de media (audio o imagen) recibido en el webhook.
// El flujo de la Graph API es de dos pasos: primero resolver la URL temporal
// del media a partir de su ID, y luego descargar el binario de esa URL.
export async function downloadMedia(mediaId: string): Promise<Buffer> {
  const { accessToken } = getWhatsappConfig();

  const metaRes = await fetch(graphUrl(mediaId), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) {
    throw new Error(`Error resolviendo media ${mediaId}: ${metaRes.status}`);
  }
  const { url } = (await metaRes.json()) as { url: string };

  const fileRes = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!fileRes.ok) {
    throw new Error(`Error descargando media ${mediaId}: ${fileRes.status}`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
