// Точка входа: собирает конфиг, Telegram-бота и HTTP-эндпоинт для событий Perun.
import { Bot } from "grammy";
import { createConfirmRegistry } from "./application/confirm-registry.ts";
import { createPerunEventHandler } from "./application/handle-perun-event.ts";
import { createSessionMemory } from "./application/session-memory.ts";
import { loadConfig } from "./infrastructure/config/load-config.ts";
import { registerBotHandlers } from "./infrastructure/telegram/register-bot-handlers.ts";
import { createTelegramNotifier } from "./infrastructure/telegram/telegram-notifier.ts";
import { createHttpServer, ENDPOINT_PATH } from "./presentation/http/create-http-server.ts";

async function main(): Promise<void> {
	// Запускает бота и эндпоинт, а по сигналу остановки корректно гасит оба.
	const config = loadConfig(process.env);
	const reportError = (error: unknown): void => {
		console.error("[perun-bot]", error);
	};
	const bot = new Bot(config.botToken);
	const registry = createConfirmRegistry();
	registerBotHandlers(bot, registry, config.chatId);
	bot.catch((error) => {
		reportError(error.error);
	});

	if (config.chatId === undefined) {
		console.warn("[perun-bot] TELEGRAM_CHAT_ID не задан: напишите боту /start, чтобы узнать chat_id.");
		process.once("SIGINT", () => void bot.stop());
		process.once("SIGTERM", () => void bot.stop());
		await bot.start();
		return;
	}

	const handle = createPerunEventHandler({
		notifier: createTelegramNotifier(bot.api, config.chatId),
		registry,
		memory: createSessionMemory(),
		defaultConfirmTimeoutMs: config.confirmTimeoutMs,
		reportError,
	});
	const server = createHttpServer({ secret: config.webhookSecret, handle, reportError });
	const stop = (): void => {
		if (server.listening) {
			server.close();
			server.closeAllConnections();
		}
		if (bot.isRunning()) {
			void bot.stop();
		}
	};
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
	server.once("error", (error) => {
		reportError(error);
		process.exitCode = 1;
		stop();
	});

	server.listen(config.port, config.host, () => {
		console.log(`[perun-bot] Эндпоинт: POST http://${config.host}:${config.port}${ENDPOINT_PATH}`);
	});
	try {
		await bot.start({
			onStart: (me) => {
				console.log(`[perun-bot] Бот @${me.username} запущен`);
			},
		});
	} finally {
		stop();
	}
}

main().catch((error: unknown) => {
	console.error("[perun-bot]", error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
