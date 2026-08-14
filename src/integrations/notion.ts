import { Client } from "@notionhq/client";
import { getNotionConfig } from "../config";

let client: Client | null = null;
function getClient(): Client {
  if (!client) {
    client = new Client({ auth: getNotionConfig().token });
  }
  return client;
}

export const ACTIVITY_CALENDAR_OPTIONS = [
  "Facultad",
  "Parciales",
  "Compras",
  "Personal",
  "Organización",
  "Fechas Importantes",
  "Ocio",
] as const;
export type ActivityCalendar = (typeof ACTIVITY_CALENDAR_OPTIONS)[number];

export const EXPENSE_CATEGORY_OPTIONS = [
  "🛒 Comida y supermercado",
  "🚌 Transporte",
  "📦 Pedidos Ya",
  "📺 Suscripciones",
  "👕 Ropa",
  "🎓 Educación",
  "🏥 Salud",
  "🎉 Salidas / ocio",
  "📌Inversiones",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORY_OPTIONS)[number];

export const EXPENSE_PAYMENT_METHOD_OPTIONS = ["💳 Crédito", "📱 Mercado Pago", "💵 Efectivo"] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHOD_OPTIONS)[number];

// El modelo de IA genera claves simples en texto plano (sin emoji) porque el
// generador de JSON de Groq falla al escapar emojis dentro de un string JSON.
// Estas claves se mapean acá a las etiquetas reales que espera Notion.
export const EXPENSE_CATEGORY_KEYS = {
  comida: "🛒 Comida y supermercado",
  transporte: "🚌 Transporte",
  pedidos_ya: "📦 Pedidos Ya",
  suscripciones: "📺 Suscripciones",
  ropa: "👕 Ropa",
  educacion: "🎓 Educación",
  salud: "🏥 Salud",
  ocio: "🎉 Salidas / ocio",
  inversiones: "📌Inversiones",
} as const satisfies Record<string, ExpenseCategory>;
export type ExpenseCategoryKey = keyof typeof EXPENSE_CATEGORY_KEYS;

export const EXPENSE_PAYMENT_METHOD_KEYS = {
  credito: "💳 Crédito",
  mercado_pago: "📱 Mercado Pago",
  efectivo: "💵 Efectivo",
} as const satisfies Record<string, ExpensePaymentMethod>;
export type ExpensePaymentMethodKey = keyof typeof EXPENSE_PAYMENT_METHOD_KEYS;

export interface CreateActivityInput {
  actividad: string;
  fechaInicioIso: string; // ISO 8601 date o datetime
  fechaFinIso?: string;
  esDatetime: boolean;
  calendario: ActivityCalendar;
}

export async function createActivity(input: CreateActivityInput): Promise<string> {
  const { activitiesDataSourceId } = getNotionConfig();

  const page = await getClient().pages.create({
    parent: { database_id: activitiesDataSourceId },
    properties: {
      Actividad: { title: [{ text: { content: input.actividad } }] },
      Fecha: {
        date: {
          start: input.fechaInicioIso,
          ...(input.fechaFinIso ? { end: input.fechaFinIso } : {}),
        },
      },
      Calendario: { select: { name: input.calendario } },
      Estado: { status: { name: "Sin empezar" } },
    },
  });

  return (page as any).url ?? page.id;
}

export interface CreateExpenseInput {
  descripcion: string;
  monto: number;
  categoria: ExpenseCategory;
  medioPago?: ExpensePaymentMethod;
  fechaIso: string;
  notas?: string;
}

export async function createExpense(input: CreateExpenseInput): Promise<string> {
  const { expensesDataSourceId } = getNotionConfig();

  const page = await getClient().pages.create({
    parent: { database_id: expensesDataSourceId },
    properties: {
      Descripción: { title: [{ text: { content: input.descripcion } }] },
      Monto: { number: input.monto },
      Fecha: { date: { start: input.fechaIso } },
      Categoría: { select: { name: input.categoria } },
      ...(input.medioPago ? { "Método de pago": { select: { name: input.medioPago } } } : {}),
      ...(input.notas ? { Notas: { rich_text: [{ text: { content: input.notas } }] } } : {}),
    },
  });

  return (page as any).url ?? page.id;
}
