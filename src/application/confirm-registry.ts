// Реестр запросов разрешения, которые ждут ответа пользователя в Telegram.
import { randomUUID } from "node:crypto";
import type { ConfirmDecision } from "../domain/notification.ts";

export interface PendingConfirm {
	key: string;
	decision: Promise<ConfirmDecision>;
}

export interface ConfirmRegistry {
	open(timeoutMs: number, signal: AbortSignal): PendingConfirm;
	settle(key: string, decision: ConfirmDecision): boolean;
}

export function createConfirmRegistry(): ConfirmRegistry {
	// Выдаёт ключ ожидания и завершает его ответом пользователя, таймаутом или обрывом соединения.
	const pending = new Map<string, (decision: ConfirmDecision) => void>();

	const settle = (key: string, decision: ConfirmDecision): boolean => {
		const finish = pending.get(key);
		if (finish === undefined) {
			return false;
		}
		finish(decision);
		return true;
	};

	const open = (timeoutMs: number, signal: AbortSignal): PendingConfirm => {
		const key = randomUUID();
		const decision = new Promise<ConfirmDecision>((resolve) => {
			const finish = (result: ConfirmDecision): void => {
				if (!pending.delete(key)) {
					return;
				}
				clearTimeout(timer);
				signal.removeEventListener("abort", onAbort);
				resolve(result);
			};
			const onAbort = (): void => {
				finish("aborted");
			};
			const timer = setTimeout(() => {
				finish("expired");
			}, timeoutMs);
			pending.set(key, finish);
			signal.addEventListener("abort", onAbort, { once: true });
			if (signal.aborted) {
				finish("aborted");
			}
		});
		return { key, decision };
	};

	return { open, settle };
}
