// Обработчики входящих событий Telegram: команда /start и нажатия кнопок разрешения.
import type { Bot } from "grammy";
import type { ConfirmRegistry } from "../../application/confirm-registry.ts";
import { CONFIRM_CALLBACK_PATTERN } from "./confirm-callback.ts";

export function registerBotHandlers(bot: Bot, registry: ConfirmRegistry, chatId: number | undefined): void {
	// Подключает к боту команду /start и обработку кнопок «Разрешить» / «Отклонить».
	bot.command("start", async (ctx) => {
		const text =
			ctx.chat.id === chatId
				? "Уведомления Perun приходят в этот чат."
				: `chat_id этого чата: <code>${ctx.chat.id}</code>\nУкажите его в TELEGRAM_CHAT_ID и перезапустите бота.`;
		await ctx.reply(text, { parse_mode: "HTML" });
	});

	bot.callbackQuery(CONFIRM_CALLBACK_PATTERN, async (ctx) => {
		const match = typeof ctx.match === "string" ? undefined : ctx.match;
		const key = match?.[1];
		if (key === undefined || ctx.chat?.id !== chatId) {
			await ctx.answerCallbackQuery({ text: "Нет доступа к этому запросу" });
			return;
		}
		const settled = registry.settle(key, match?.[2] === "yes" ? "approved" : "rejected");
		await ctx.answerCallbackQuery({ text: settled ? "Ответ передан в Perun" : "Запрос уже неактуален" });
	});
}
