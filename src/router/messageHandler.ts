import { downloadMedia, sendText } from "../whatsapp/client";
import { IncomingMessage, WhatsappMessage } from "../whatsapp/types";
import { describeImage, extractIntent, transcribeAudio } from "../ai/groq";
import {
  ACTIVITY_CALENDAR_OPTIONS,
  ActivityCalendar,
  createActivity,
  createExpense,
  EXPENSE_CATEGORY_KEYS,
  EXPENSE_PAYMENT_METHOD_KEYS,
} from "../integrations/notion";
import { createEvent } from "../integrations/googleCalendar";

export function normalizeMessage(message: WhatsappMessage): IncomingMessage | null {
  if (message.type === "text" && message.text) {
    return { from: message.from, waMessageId: message.id, kind: "text", text: message.text.body };
  }
  if ((message.type === "audio" || message.type === "voice") && (message.audio || message.voice)) {
    const media = message.audio ?? message.voice!;
    return { from: message.from, waMessageId: message.id, kind: "audio", mediaId: media.id, mimeType: media.mime_type };
  }
  if (message.type === "image" && message.image) {
    return {
      from: message.from,
      waMessageId: message.id,
      kind: "image",
      mediaId: message.image.id,
      mimeType: message.image.mime_type,
      caption: message.image.caption,
    };
  }
  return null;
}

function coerceEnum<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

function coerceKey<T extends Record<string, string>>(
  value: string,
  map: T,
  fallbackKey: keyof T
): T[keyof T] {
  return value in map ? map[value as keyof T] : map[fallbackKey];
}

export async function handleIncomingMessage(message: WhatsappMessage): Promise<void> {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return;
  }

  let text: string;
  try {
    text = await resolveText(normalized);
  } catch (err) {
    console.error("Error procesando el contenido del mensaje:", err);
    await sendText(normalized.from, "No pude procesar ese mensaje. ¿Podés intentar de nuevo?");
    return;
  }

  if (!text.trim()) {
    await sendText(normalized.from, "No entendí el contenido del mensaje. ¿Podés reformularlo?");
    return;
  }

  let intent;
  try {
    intent = await extractIntent(text);
  } catch (err) {
    console.error("Error extrayendo intención:", err);
    await sendText(normalized.from, "Tuve un problema entendiendo tu mensaje. Probá de nuevo en un momento.");
    return;
  }

  try {
    if (intent.tipo === "evento") {
      const calendario = coerceEnum(intent.calendario, ACTIVITY_CALENDAR_OPTIONS, "Personal" as ActivityCalendar);

      const [notionUrl, calendarUrl] = await Promise.all([
        createActivity({
          actividad: intent.descripcion,
          fechaInicioIso: intent.fecha_inicio_iso,
          fechaFinIso: intent.fecha_fin_iso ?? undefined,
          esDatetime: intent.es_datetime,
          calendario,
        }),
        createEvent({
          summary: intent.descripcion,
          startIso: intent.fecha_inicio_iso,
          endIso: intent.fecha_fin_iso ?? undefined,
          isAllDay: !intent.es_datetime,
        }),
      ]);

      await sendText(
        normalized.from,
        `Listo, creé el evento "${intent.descripcion}".\nNotion: ${notionUrl}\nGoogle Calendar: ${calendarUrl}`
      );
      return;
    }

    if (intent.tipo === "gasto") {
      const categoria = coerceKey(intent.categoria, EXPENSE_CATEGORY_KEYS, "ocio");
      const medioPago = intent.medio_pago
        ? coerceKey(intent.medio_pago, EXPENSE_PAYMENT_METHOD_KEYS, "efectivo")
        : undefined;

      const notionUrl = await createExpense({
        descripcion: intent.descripcion,
        monto: intent.monto,
        categoria,
        medioPago,
        fechaIso: intent.fecha_iso,
      });

      await sendText(
        normalized.from,
        `Listo, registré el gasto "${intent.descripcion}" por $${intent.monto}.\nNotion: ${notionUrl}`
      );
      return;
    }

    await sendText(
      normalized.from,
      "No pude identificar si querías crear un evento o registrar un gasto. ¿Podés ser más específico?"
    );
  } catch (err) {
    console.error("Error ejecutando la acción (Notion/Calendar):", err);
    await sendText(normalized.from, "Entendí tu mensaje pero falló al guardarlo. Voy a revisar el error.");
  }
}

async function resolveText(message: IncomingMessage): Promise<string> {
  if (message.kind === "text") {
    return message.text ?? "";
  }

  if (message.kind === "audio") {
    const buffer = await downloadMedia(message.mediaId!);
    return transcribeAudio(buffer, "audio.ogg");
  }

  // image
  const buffer = await downloadMedia(message.mediaId!);
  return describeImage(buffer, message.mimeType ?? "image/jpeg", message.caption);
}
