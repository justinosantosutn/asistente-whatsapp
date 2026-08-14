export interface WhatsappWebhookPayload {
  object: string;
  entry: WhatsappEntry[];
}

export interface WhatsappEntry {
  id: string;
  changes: WhatsappChange[];
}

export interface WhatsappChange {
  field: string;
  value: {
    messaging_product: "whatsapp";
    metadata: { display_phone_number: string; phone_number_id: string };
    contacts?: { profile: { name: string }; wa_id: string }[];
    messages?: WhatsappMessage[];
    statuses?: unknown[];
  };
}

export interface WhatsappMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "audio" | "image" | "document" | "video" | "voice" | string;
  text?: { body: string };
  audio?: WhatsappMedia;
  voice?: WhatsappMedia;
  image?: WhatsappMedia & { caption?: string };
}

export interface WhatsappMedia {
  id: string;
  mime_type: string;
  sha256?: string;
}

// Resultado normalizado que produce cada tipo de mensaje entrante,
// independientemente de si originalmente era texto, audio o imagen.
export interface IncomingMessage {
  from: string;
  waMessageId: string;
  kind: "text" | "audio" | "image";
  text?: string;
  mediaId?: string;
  mimeType?: string;
  caption?: string;
}
