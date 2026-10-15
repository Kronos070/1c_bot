// Тесты разбора сырых событий Perun RPC.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parsePerunEvent } from "../src/domain/perun-event.ts";

describe("parsePerunEvent", () => {
	test("отклоняет значения без поля type", () => {
		assert.equal(parsePerunEvent(null), undefined);
		assert.equal(parsePerunEvent("agent_settled"), undefined);
		assert.equal(parsePerunEvent({ id: "1" }), undefined);
	});

	test("распознаёт запрос подтверждения от PermissionManager", () => {
		const event = parsePerunEvent({
			type: "extension_ui_request",
			id: "ui-1",
			method: "confirm",
			title: "[1C Безопасность]: Разрешить вызов инструмента 'bash'?",
			message: "Выполнение команд терминала (bash) требует подтверждения пользователя.",
			timeout: 30_000,
		});
		assert.deepEqual(event, {
			kind: "confirm",
			id: "ui-1",
			title: "[1C Безопасность]: Разрешить вызов инструмента 'bash'?",
			message: "Выполнение команд терминала (bash) требует подтверждения пользователя.",
			timeoutMs: 30_000,
		});
	});

	test("распознаёт select, input и editor как ожидание ввода", () => {
		const event = parsePerunEvent({
			type: "extension_ui_request",
			id: "ui-2",
			method: "select",
			title: "Выберите конфигурацию",
			options: ["ERP", "УТ"],
		});
		assert.deepEqual(event, { kind: "input-required", id: "ui-2", method: "select", title: "Выберите конфигурацию" });
	});

	test("достаёт текст последнего ответа ассистента из agent_end", () => {
		const event = parsePerunEvent({
			type: "agent_end",
			willRetry: false,
			messages: [
				{ role: "user", content: "Найди регистр" },
				{ role: "assistant", content: [{ type: "text", text: "черновик" }] },
				{ role: "toolResult", content: [{ type: "text", text: "вывод" }] },
				{
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "думаю" },
						{ type: "text", text: "Готово." },
						{ type: "toolCall", id: "c1", name: "read", arguments: {} },
						{ type: "text", text: "Изменён 1 файл." },
					],
				},
			],
		});
		assert.deepEqual(event, {
			kind: "run-finished",
			outcome: { finalText: "Готово.\nИзменён 1 файл.", errorMessage: undefined },
		});
	});

	test("передаёт текст ошибки модели из agent_end", () => {
		const event = parsePerunEvent({
			type: "agent_end",
			messages: [{ role: "assistant", content: [], stopReason: "error", errorMessage: "429 Too Many Requests" }],
		});
		assert.deepEqual(event, {
			kind: "run-finished",
			outcome: { finalText: undefined, errorMessage: "429 Too Many Requests" },
		});
	});

	test("распознаёт agent_settled и пропускает прочие события", () => {
		assert.deepEqual(parsePerunEvent({ type: "agent_settled", aborted: true }), { kind: "settled", aborted: true });
		assert.deepEqual(parsePerunEvent({ type: "message_update", assistantMessageEvent: {} }), {
			kind: "other",
			type: "message_update",
		});
	});
});
