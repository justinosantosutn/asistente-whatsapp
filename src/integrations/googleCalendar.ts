import { google } from "googleapis";
import { getGoogleConfig, timezone } from "../config";

function getAuthClient() {
  const { clientId, clientSecret, redirectUri, refreshToken } = getGoogleConfig();
  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

export interface CreateCalendarEventInput {
  summary: string;
  description?: string;
  startIso: string; // ISO datetime o ISO date (evento de todo el día)
  endIso?: string;
  isAllDay: boolean;
}

export async function createEvent(input: CreateCalendarEventInput): Promise<string> {
  const { calendarId } = getGoogleConfig();
  const calendar = google.calendar({ version: "v3", auth: getAuthClient() });

  const start = input.isAllDay
    ? { date: input.startIso.slice(0, 10) }
    : { dateTime: input.startIso, timeZone: timezone };

  const end = input.isAllDay
    ? { date: (input.endIso ?? input.startIso).slice(0, 10) }
    : { dateTime: input.endIso ?? input.startIso, timeZone: timezone };

  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      start,
      end,
    },
  });

  return res.data.htmlLink ?? res.data.id ?? "";
}

export interface CalendarEventMatch {
  eventId: string;
  summary: string;
  startIso: string | null;
  url: string;
}

// Busca eventos cuyo texto contenga `query`. Si se pasa `dateHintIso`
// (YYYY-MM-DD) acota la búsqueda a ese día; si no, busca en una ventana
// amplia alrededor de hoy (últimos 7 días, próximos 180).
export async function findEvents(query: string, dateHintIso?: string): Promise<CalendarEventMatch[]> {
  const { calendarId } = getGoogleConfig();
  const calendar = google.calendar({ version: "v3", auth: getAuthClient() });

  const timeMin = dateHintIso
    ? new Date(`${dateHintIso}T00:00:00`).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = dateHintIso
    ? new Date(`${dateHintIso}T23:59:59`).toISOString()
    : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

  const res = await calendar.events.list({
    calendarId,
    q: query,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 10,
  });

  return (res.data.items ?? []).map((event) => ({
    eventId: event.id ?? "",
    summary: event.summary ?? "(sin título)",
    startIso: event.start?.dateTime ?? event.start?.date ?? null,
    url: event.htmlLink ?? "",
  }));
}

export interface UpdateCalendarEventInput {
  summary?: string;
  startIso?: string;
  endIso?: string;
  isAllDay?: boolean;
}

export async function updateEvent(eventId: string, updates: UpdateCalendarEventInput): Promise<void> {
  const { calendarId } = getGoogleConfig();
  const calendar = google.calendar({ version: "v3", auth: getAuthClient() });

  const requestBody: Record<string, unknown> = {};
  if (updates.summary) requestBody.summary = updates.summary;

  if (updates.startIso) {
    requestBody.start = updates.isAllDay
      ? { date: updates.startIso.slice(0, 10) }
      : { dateTime: updates.startIso, timeZone: timezone };
    requestBody.end = updates.isAllDay
      ? { date: (updates.endIso ?? updates.startIso).slice(0, 10) }
      : { dateTime: updates.endIso ?? updates.startIso, timeZone: timezone };
  }

  await calendar.events.patch({ calendarId, eventId, requestBody });
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { calendarId } = getGoogleConfig();
  const calendar = google.calendar({ version: "v3", auth: getAuthClient() });
  await calendar.events.delete({ calendarId, eventId });
}
