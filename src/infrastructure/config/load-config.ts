// Чтение и проверка настроек бота из переменных окружения.
import { z } from "zod";

const MAX_TIMER_MS = 2_147_483_647;

const envSchema = z.object({
	TELEGRAM_BOT_TOKEN: z.string().min(1),
	TELEGRAM_CHAT_ID: z
		.string()
		.regex(/^-?\d+$/, "ожидается числовой chat_id")
		.transform(Number)
		.optional(),
	PERUN_WEBHOOK_SECRET: z.string().min(16, "секрет должен быть не короче 16 символов"),
	HOST: z.string().min(1).default("127.0.0.1"),
	PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
	CONFIRM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(MAX_TIMER_MS).default(270_000),
});

export interface AppConfig {
	botToken: string;
	chatId: number | undefined;
	webhookSecret: string;
	host: string;
	port: number;
	confirmTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
	// Проверяет переменные окружения и возвращает готовый конфиг либо бросает понятную ошибку.
	const filled = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ""));
	const parsed = envSchema.safeParse(filled);
	if (!parsed.success) {
		throw new Error(`Некорректные настройки окружения:\n${z.prettifyError(parsed.error)}`);
	}
	const { data } = parsed;
	return {
		botToken: data.TELEGRAM_BOT_TOKEN,
		chatId: data.TELEGRAM_CHAT_ID,
		webhookSecret: data.PERUN_WEBHOOK_SECRET,
		host: data.HOST,
		port: data.PORT,
		confirmTimeoutMs: data.CONFIRM_TIMEOUT_MS,
	};
}
