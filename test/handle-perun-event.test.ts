// Тесты прикладного сценария обработки событий Perun.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ConfirmRegistry } from "../src/application/confirm-registry.ts";
import { createConfirmRegistry } from "../src/application/confirm-registry.ts";
import { createPerunEventHandler, type PerunEventHandler } from "../src/application/handle-perun-event.ts";
import { createSessionMemory } from "../src/application/session-memory.ts";
import type { PerunEvent } from "../src/domain/perun-event.ts";
import { createFakeNotifier, type FakeNotifier } from "./fake-notifier.ts";

interface Setup {
	notifier: FakeNotifier;
	registry: ConfirmRegistry;
	handle: PerunEventHandler;
}

const confirmEvent: PerunEvent = {
	kind: "confirm",
	id: "ui-7",
	title: "Разрешить вызов инструмента 'bash'?",
	message: "rm -rf build",
	timeoutMs: undefined,
};

function setup(options: { failSend?: boolean } = {}): Setup {
	const notifier = createFakeNotifier(options);
	const registry = createConfirmRegistry();
	const handle = createPerunEventHandler({
		notifier,
		registry,
		memory: createSessionMemory(),
		defaultConfirmTimeoutMs: 60_000,
		reportError: (error) => {
			throw error;
		},
	});
	return { notifier, registry, handle };
}

describe("createPerunEventHandler", () => {
	test("возвращает confirmed: true после нажатия «Разрешить»", async () => {
		const { notifier, registry, handle } = setup();
		const reply = handle(confirmEvent, { session: "erp", signal: new AbortController().signal });
		registry.settle(await notifier.nextConfirmKey(), "approved");
		assert.deepEqual(await reply, { type: "extension_ui_response", id: "ui-7", confirmed: true });
		assert.equal(await notifier.nextDecision(), "approved");
		assert.equal(notifier.sent[0]?.session, "erp");
	});

	test("возвращает confirmed: false после нажатия «Отклонить»", async () => {
		const { notifier, registry, handle } = setup();
		const reply = handle(confirmEvent, { session: undefined, signal: new AbortController().signal });
		registry.settle(await notifier.nextConfirmKey(), "rejected");
		assert.deepEqual(await reply, { type: "extension_ui_response", id: "ui-7", confirmed: false });
	});

	test("отменяет запрос по таймауту из события", async () => {
		const { notifier, handle } = setup();
		const reply = await handle(
			{ ...confirmEvent, timeoutMs: 20 },
			{ session: undefined, signal: AbortSignal.timeout(5_000) },
		);
		assert.deepEqual(reply, { type: "extension_ui_response", id: "ui-7", cancelled: true });
		assert.equal(await notifier.nextDecision(), "expired");
	});

	test("снимает запрос, когда клиент Perun отключился", async () => {
		const { notifier, registry, handle } = setup();
		const controller = new AbortController();
		const reply = handle(confirmEvent, { session: undefined, signal: controller.signal });
		const key = await notifier.nextConfirmKey();
		controller.abort();
		assert.deepEqual(await reply, { type: "extension_ui_response", id: "ui-7", cancelled: true });
		assert.equal(await notifier.nextDecision(), "aborted");
		assert.equal(registry.settle(key, "approved"), false);
	});

	test("пробрасывает ошибку Telegram и не оставляет висящих ожиданий", async () => {
		const { handle } = setup({ failSend: true });
		await assert.rejects(handle(confirmEvent, { session: undefined, signal: new AbortController().signal }));
	});

	test("присылает итог прогона при agent_settled и забывает его", async () => {
		const { notifier, handle } = setup();
		const signal = new AbortController().signal;
		const outcome = { finalText: "Готово", errorMessage: undefined };
		assert.deepEqual(await handle({ kind: "run-finished", outcome }, { session: "erp", signal }), {
			status: "accepted",
		});
		assert.deepEqual(await handle({ kind: "settled", aborted: false }, { session: "erp", signal }), {
			status: "notified",
		});
		await handle({ kind: "settled", aborted: false }, { session: "erp", signal });
		assert.deepEqual(notifier.sent, [
			{ kind: "done", session: "erp", aborted: false, outcome },
			{ kind: "done", session: "erp", aborted: false, outcome: undefined },
		]);
	});

	test("уведомляет об ожидании ввода и игнорирует прочие события", async () => {
		const { notifier, handle } = setup();
		const signal = new AbortController().signal;
		const inputEvent: PerunEvent = { kind: "input-required", id: "ui-9", method: "input", title: "Имя подсистемы" };
		assert.deepEqual(await handle(inputEvent, { session: undefined, signal }), { status: "notified" });
		assert.deepEqual(await handle({ kind: "other", type: "turn_end" }, { session: undefined, signal }), {
			status: "ignored",
		});
		assert.equal(notifier.sent.length, 1);
	});
});
