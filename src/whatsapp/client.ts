import { getWhatsappConfig } from "../config";

function graphUrl(path: string): string {
  const { apiVersion } = getWhatsappConfig();
  return `https://graph.facebook.com/${apiVersion}/${path}`;
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
      to,
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
