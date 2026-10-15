// Превращение доменных уведомлений в HTML-текст сообщений Telegram.
import type { ConfirmDecision, InputMethod, Notification, RunOutcome } from "../../domain/notification.ts";

const MAX_DETAILS_LENGTH = 3_000;

const DECISION_LABELS: Record<ConfirmDecision, string> = {
	approved: "✅ Разрешено",
	rejected: "❌ Отклонено",
	expired: "⏱ Время ожидания истекло — запрос отменён",
	aborted: "🔌 Запрос снят: Perun больше не ждёт ответа",
};

const INPUT_LABELS: Record<InputMethod, string> = {
	select: "Нужно выбрать вариант",
	input: "Нужно ввести значение",
	editor: "Нужно отредактировать текст",
};

export function formatNotification(notification: Notification): string {
	// Собирает HTML-текст сообщения Telegram для конкретного уведомления.
	switch (notification.kind) {
		case "confirm":
			return joinLines([
				"🔐 <b>Perun просит разрешение</b>",
				sessionLine(notification.session),
				"",
				...questionLines(notification.title, notification.message),
			]);
		case "confirm-resolved":
			return joinLines([
				"🔐 <b>Запрос разрешения</b>",
				sessionLine(notification.session),
				"",
				...questionLines(notification.title, notification.message),
				"",
				`<b>${DECISION_LABELS[notification.decision]}</b>`,
			]);
		case "input-required":
			return joinLines([
				"✋ <b>Perun ждёт ввода</b>",
				sessionLine(notification.session),
				"",
				`${INPUT_LABELS[notification.method]}: <b>${escapeHtml(notification.title)}</b>`,
				"Ответьте в клиенте Perun.",
			]);
		case "done":
			return joinLines([
				doneHeadline(notification.aborted, notification.outcome),
				sessionLine(notification.session),
				...detailsLines(notification.outcome),
			]);
	}
}

function questionLines(title: string, message: string): string[] {
	const lines = [`<b>${escapeHtml(title)}</b>`];
	if (message.trim() !== "") {
		lines.push(`<blockquote>${escapeHtml(truncate(message))}</blockquote>`);
	}
	return lines;
}

function doneHeadline(aborted: boolean, outcome: RunOutcome | undefined): string {
	if (aborted) {
		return "⛔ <b>Работа Perun прервана</b>";
	}
	if (outcome?.errorMessage !== undefined) {
		return "⚠️ <b>Perun завершил работу с ошибкой</b>";
	}
	return "✅ <b>Perun закончил работу</b>";
}

function detailsLines(outcome: RunOutcome | undefined): string[] {
	const details = outcome?.errorMessage ?? outcome?.finalText;
	if (details === undefined) {
		return [];
	}
	return ["", `<blockquote expandable>${escapeHtml(truncate(details))}</blockquote>`];
}

function sessionLine(session: string | undefined): string | undefined {
	return session === undefined ? undefined : `📁 <code>${escapeHtml(session)}</code>`;
}

function joinLines(lines: ReadonlyArray<string | undefined>): string {
	return lines.filter((line): line is string => line !== undefined).join("\n");
}

function truncate(text: string): string {
	return text.length <= MAX_DETAILS_LENGTH ? text : `${text.slice(0, MAX_DETAILS_LENGTH).trimEnd()}…`;
}

function escapeHtml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
