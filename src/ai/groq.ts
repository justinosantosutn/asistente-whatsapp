import Groq from "groq-sdk";
import { getGroqConfig, timezone } from "../config";
import { buildIntentSystemPrompt, IMAGE_DESCRIPTION_PROMPT } from "./prompts";

// Devuelve la fecha/hora actual como string local a la zona horaria dada
// (sin conversión a UTC), para que el modelo resuelva expresiones relativas
// ("mañana", "el viernes") respecto al día real del usuario, no al de UTC.
function nowInTimezone(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

let client: Groq | null = null;
function getClient(): Groq {
  if (!client) {
    client = new Groq({ apiKey: getGroqConfig().apiKey });
  }
  return client;
}

export async function transcribeAudio(audio: Buffer, filename = "audio.ogg"): Promise<string> {
  const { transcriptionModel } = getGroqConfig();
  const file = new File([audio], filename);

  const result = (await getClient().audio.transcriptions.create({
    file,
    model: transcriptionModel,
    language: "es",
    response_format: "text",
  })) as unknown as string | { text: string };

  return (typeof result === "string" ? result : result.text).trim();
}

export async function describeImage(image: Buffer, mimeType: string, caption?: string): Promise<string> {
  const { visionModel } = getGroqConfig();
  const base64 = image.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const prompt = caption
    ? `${IMAGE_DESCRIPTION_PROMPT}\n\nEl usuario agregó este texto junto a la imagen: "${caption}"`
    : IMAGE_DESCRIPTION_PROMPT;

  const completion = await getClient().chat.completions.create({
    model: visionModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

export type IntentResult =
  | {
      tipo: "evento";
      descripcion: string;
      fecha_inicio_iso: string;
      fecha_fin_iso: string | null;
      es_datetime: boolean;
      calendario: string;
    }
  | {
      tipo: "gasto";
      descripcion: string;
      monto: number;
      categoria: string;
      medio_pago: string | null;
      fecha_iso: string;
    }
  | { tipo: "no_reconocido"; razon: string };

export async function extractIntent(text: string): Promise<IntentResult> {
  const { textModel } = getGroqConfig();
  const nowLocal = nowInTimezone(timezone);
  console.log(`[extractIntent] ahora local (${timezone}): ${nowLocal} | mensaje: "${text}"`);

  const completion = await getClient().chat.completions.create({
    model: textModel,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: buildIntentSystemPrompt(nowLocal, timezone) },
      { role: "user", content: text },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  console.log(`[extractIntent] respuesta cruda del modelo: ${raw}`);
  return JSON.parse(raw) as IntentResult;
}
