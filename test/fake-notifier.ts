// Тестовый двойник порта уведомлений: хранит сообщения в памяти вместо Telegram.
import type { Notifier } from "../src/application/ports.ts";
import type { ConfirmDecision, Notification } from "../src/domain/notification.ts";

export interface FakeNotifier extends Notifier {
	sent: Notification[];
	nextConfirmKey(): Promise<string>;
	nextDecision(): Promise<ConfirmDecision>;
}

export function createFakeNotifier(options: { failSend?: boolean } = {}): FakeNotifier {
	// Создаёт двойник Notifier, который запоминает отправленное и выдаёт ключи запросов разрешения.
	const sent: Notification[] = [];
	const confirmKeys = createQueue<string>();
	const decisions = createQueue<ConfirmDecision>();
	return {
		sent,
		nextConfirmKey: confirmKeys.next,
		nextDecision: decisions.next,
		send: async (notification) => {
			if (options.failSend === true) {
				throw new Error("Telegram недоступен");
			}
			sent.push(notification);
			if (notification.kind === "confirm") {
				confirmKeys.push(notification.key);
			}
			return sent.length;
		},
		replace: async (_messageId, notification) => {
			if (notification.kind === "confirm-resolved") {
				decisions.push(notification.decision);
			}
		},
	};
}

function createQueue<T>(): { push: (value: T) => void; next: () => Promise<T> } {
	const items: T[] = [];
	const waiters: Array<(value: T) => void> = [];
	return {
		push: (value) => {
			const waiter = waiters.shift();
			if (waiter === undefined) {
				items.push(value);
			} else {
				waiter(value);
			}
		},
		next: () => {
			if (items.length > 0) {
				return Promise.resolve(items.shift() as T);
			}
			return new Promise<T>((resolve) => {
				waiters.push(resolve);
			});
		},
	};
}
