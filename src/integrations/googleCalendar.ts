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
