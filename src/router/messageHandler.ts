import { downloadMedia, sendText } from "../whatsapp/client";
import { IncomingMessage, WhatsappMessage } from "../whatsapp/types";
import { describeImage, extractIntent, transcribeAudio } from "../ai/groq";
import {
  ACTIVITY_CALENDAR_OPTIONS,
  ActivityCalendar,
  ActivityMatch,
  archiveActivity,
  createActivity,
  createExpense,
  EXPENSE_CATEGORY_KEYS,
  EXPENSE_PAYMENT_METHOD_KEYS,
  findActivities,
  updateActivity,
} from "../integrations/notion";
import {
  CalendarEventMatch,
  createEvent,
  deleteEvent,
  findEvents,
  updateEvent,
} from "../integrations/googleCalendar";

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

// --- Desambiguación cuando la búsqueda de un evento a borrar/modificar
// devuelve más de un resultado: guardamos en memoria qué le preguntamos a
// cada usuario, y esperamos que el próximo mensaje sea su elección.

type PendingAction =
  | { kind: "eliminar" }
  | {
      kind: "modificar";
      nuevaFechaInicioIso: string | null;
      nuevaFechaFinIso: string | null;
      nuevaDescripcion: string | null;
    };

interface Candidate {
  source: "notion" | "calendar";
  id: string;
  label: string;
}

interface PendingDisambiguation {
  candidates: Candidate[];
  action: PendingAction;
  createdAt: number;
}

const pendingByUser = new Map<string, PendingDisambiguation>();
const PENDING_TTL_MS = 5 * 60 * 1000;

function formatFecha(iso: string | null): string {
  if (!iso) return "(sin fecha)";
  return iso.slice(0, 16).replace("T", " ");
}

async function searchCandidates(
  busqueda: string,
  fechaHintIso: string | null
): Promise<{ notion: ActivityMatch[]; calendar: CalendarEventMatch[] }> {
  const [notion, calendar] = await Promise.all([
    findActivities(busqueda, fechaHintIso ?? undefined),
    findEvents(busqueda, fechaHintIso ?? undefined),
  ]);
  return { notion, calendar };
}

function toCandidates(notion: ActivityMatch[], calendar: CalendarEventMatch[]): Candidate[] {
  return [
    ...notion.map((a) => ({
      source: "notion" as const,
      id: a.pageId,
      label: `[Notion] ${a.actividad} — ${formatFecha(a.fechaInicioIso)}`,
    })),
    ...calendar.map((e) => ({
      source: "calendar" as const,
      id: e.eventId,
      label: `[Calendar] ${e.summary} — ${formatFecha(e.startIso)}`,
    })),
  ];
}

async function applyAction(candidate: Candidate, action: PendingAction): Promise<void> {
  if (action.kind === "eliminar") {
    if (candidate.source === "notion") {
      await archiveActivity(candidate.id);
    } else {
      await deleteEvent(candidate.id);
    }
    return;
  }

  if (candidate.source === "notion") {
    await updateActivity(candidate.id, {
      actividad: action.nuevaDescripcion ?? undefined,
      fechaInicioIso: action.nuevaFechaInicioIso ?? undefined,
      fechaFinIso: action.nuevaFechaFinIso ?? undefined,
    });
  } else {
    await updateEvent(candidate.id, {
      summary: action.nuevaDescripcion ?? undefined,
      startIso: action.nuevaFechaInicioIso ?? undefined,
      endIso: action.nuevaFechaFinIso ?? undefined,
      isAllDay: false,
    });
  }
}

async function tryResolvePending(from: string, text: string): Promise<boolean> {
  const pending = pendingByUser.get(from);
  if (!pending) return false;

  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    pendingByUser.delete(from);
    return false;
  }

  if (/cancel|olvid|dejalo/i.test(text)) {
    pendingByUser.delete(from);
    await sendText(from, "Listo, cancelado.");
    return true;
  }

  const match = text.match(/\d+/);
  const index = match ? Number(match[0]) - 1 : -1;

  if (index < 0 || index >= pending.candidates.length) {
    await sendText(
      from,
      `No entendí cuál. Respondé con el número correspondiente:\n${pending.candidates
        .map((c, i) => `${i + 1}) ${c.label}`)
        .join("\n")}\n(o "cancelar")`
    );
    return true;
  }

  const chosen = pending.candidates[index];
  pendingByUser.delete(from);

  try {
    await applyAction(chosen, pending.action);
    await sendText(
      from,
      pending.action.kind === "eliminar" ? `Listo, borré "${chosen.label}".` : `Listo, actualicé "${chosen.label}".`
    );
  } catch (err) {
    console.error("Error aplicando acción sobre candidato elegido:", err);
    await sendText(from, "Entendí cuál, pero falló al aplicarlo. Voy a revisar el error.");
  }

  return true;
}

async function handleEliminarEvento(from: string, busqueda: string, fechaHintIso: string | null): Promise<void> {
  const { notion, calendar } = await searchCandidates(busqueda, fechaHintIso);

  if (notion.length === 0 && calendar.length === 0) {
    await sendText(from, `No encontré ningún evento que coincida con "${busqueda}".`);
    return;
  }

  if (notion.length <= 1 && calendar.length <= 1) {
    const results: string[] = [];
    if (notion[0]) {
      await archiveActivity(notion[0].pageId);
      results.push("Notion");
    }
    if (calendar[0]) {
      await deleteEvent(calendar[0].eventId);
      results.push("Google Calendar");
    }
    await sendText(from, `Listo, borré "${busqueda}" de ${results.join(" y ")}.`);
    return;
  }

  const candidates = toCandidates(notion, calendar);
  pendingByUser.set(from, { candidates, action: { kind: "eliminar" }, createdAt: Date.now() });
  await sendText(
    from,
    `Encontré varios eventos con "${busqueda}". ¿Cuál borro? Respondé con el número:\n${candidates
      .map((c, i) => `${i + 1}) ${c.label}`)
      .join("\n")}`
  );
}

async function handleModificarEvento(
  from: string,
  busqueda: string,
  fechaHintIso: string | null,
  action: Extract<PendingAction, { kind: "modificar" }>
): Promise<void> {
  const { notion, calendar } = await searchCandidates(busqueda, fechaHintIso);

  if (notion.length === 0 && calendar.length === 0) {
    await sendText(from, `No encontré ningún evento que coincida con "${busqueda}".`);
    return;
  }

  if (notion.length <= 1 && calendar.length <= 1) {
    const results: string[] = [];
    if (notion[0]) {
      await applyAction({ source: "notion", id: notion[0].pageId, label: notion[0].actividad }, action);
      results.push("Notion");
    }
    if (calendar[0]) {
      await applyAction({ source: "calendar", id: calendar[0].eventId, label: calendar[0].summary }, action);
      results.push("Google Calendar");
    }
    await sendText(from, `Listo, actualicé "${busqueda}" en ${results.join(" y ")}.`);
    return;
  }

  const candidates = toCandidates(notion, calendar);
  pendingByUser.set(from, { candidates, action, createdAt: Date.now() });
  await sendText(
    from,
    `Encontré varios eventos con "${busqueda}". ¿Cuál modifico? Respondé con el número:\n${candidates
      .map((c, i) => `${i + 1}) ${c.label}`)
      .join("\n")}`
  );
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

  if (await tryResolvePending(normalized.from, text)) {
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

    if (intent.tipo === "eliminar_evento") {
      await handleEliminarEvento(normalized.from, intent.busqueda, intent.fecha_referencia_iso);
      return;
    }

    if (intent.tipo === "modificar_evento") {
      await handleModificarEvento(normalized.from, intent.busqueda, intent.fecha_referencia_iso, {
        kind: "modificar",
        nuevaFechaInicioIso: intent.nueva_fecha_inicio_iso,
        nuevaFechaFinIso: intent.nueva_fecha_fin_iso,
        nuevaDescripcion: intent.nueva_descripcion,
      });
      return;
    }

    await sendText(
      normalized.from,
      "No pude identificar qué querías hacer. ¿Podés ser más específico?"
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
