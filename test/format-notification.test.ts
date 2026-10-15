// Тесты HTML-форматирования уведомлений для Telegram.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatNotification } from "../src/infrastructure/telegram/format-notification.ts";

describe("formatNotification", () => {
	test("экранирует HTML в данных от Perun", () => {
		const text = formatNotification({
			kind: "confirm",
			key: "k",
			session: "<erp>",
			title: "Разрешить 'bash'?",
			message: "echo <b>&</b>",
		});
		assert.match(text, /<code>&lt;erp&gt;<\/code>/);
		assert.match(text, /<blockquote>echo &lt;b&gt;&amp;&lt;\/b&gt;<\/blockquote>/);
	});

	test("показывает решение в обновлённом запросе", () => {
		const text = formatNotification({
			kind: "confirm-resolved",
			session: undefined,
			title: "Разрешить 'edit'?",
			message: "",
			decision: "expired",
		});
		assert.match(text, /Время ожидания истекло/);
		assert.doesNotMatch(text, /📁|<blockquote>/);
	});

	test("отличает ошибку, прерывание и успешное завершение", () => {
		const done = (aborted: boolean, errorMessage: string | undefined): string =>
			formatNotification({ kind: "done", session: undefined, aborted, outcome: { finalText: "Итог", errorMessage } });
		assert.match(done(false, undefined), /Perun закончил работу[\s\S]*Итог/);
		assert.match(done(false, "rate limit"), /с ошибкой[\s\S]*rate limit/);
		assert.match(done(true, undefined), /прервана/);
	});

	test("обрезает слишком длинный итог", () => {
		const text = formatNotification({
			kind: "done",
			session: undefined,
			aborted: false,
			outcome: { finalText: "я".repeat(10_000), errorMessage: undefined },
		});
		assert.ok(text.length < 3_200);
		assert.match(text, /…<\/blockquote>$/);
	});
});
