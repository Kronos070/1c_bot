// Отправка уведомлений в Telegram-чат через Bot API grammY.
import { type Api, InlineKeyboard } from "grammy";
import type { Notifier } from "../../application/ports.ts";
import { confirmCallbackData } from "./confirm-callback.ts";
import { formatNotification } from "./format-notification.ts";

const MESSAGE_OPTIONS = { parse_mode: "HTML", link_preview_options: { is_disabled: true } } as const;

export function createTelegramNotifier(api: Api, chatId: number): Notifier {
	// Отправляет и обновляет сообщения в чате владельца, прикрепляя кнопки к запросам разрешения.
	return {
		send: async (notification) => {
			const keyboard = notification.kind === "confirm" ? { reply_markup: confirmKeyboard(notification.key) } : {};
			const message = await api.sendMessage(chatId, formatNotification(notification), {
				...MESSAGE_OPTIONS,
				...keyboard,
			});
			return message.message_id;
		},
		replace: async (messageId, notification) => {
			await api.editMessageText(chatId, messageId, formatNotification(notification), MESSAGE_OPTIONS);
		},
	};
}

function confirmKeyboard(key: string): InlineKeyboard {
	return new InlineKeyboard()
		.text("✅ Разрешить", confirmCallbackData(key, true))
		.text("❌ Отклонить", confirmCallbackData(key, false));
}
