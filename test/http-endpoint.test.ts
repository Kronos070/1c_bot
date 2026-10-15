// Интеграционные тесты единственного HTTP-эндпоинта с двойником Telegram.
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { createConfirmRegistry } from "../src/application/confirm-registry.ts";
import { createPerunEventHandler } from "../src/application/handle-perun-event.ts";
import { createSessionMemory } from "../src/application/session-memory.ts";
import { createHttpServer, ENDPOINT_PATH } from "../src/presentation/http/create-http-server.ts";
import { createFakeNotifier } from "./fake-notifier.ts";

const SECRET = "test-secret-1234567890";
const notifier = createFakeNotifier();
const registry = createConfirmRegistry();
const server = createHttpServer({
	secret: SECRET,
	reportError: () => undefined,
	handle: createPerunEventHandler({
		notifier,
		registry,
		memory: createSessionMemory(),
		defaultConfirmTimeoutMs: 60_000,
		reportError: () => undefined,
	}),
});
let baseUrl = "";

function post(body: string, init: { path?: string; token?: string; signal?: AbortSignal } = {}): Promise<Response> {
	return fetch(`${baseUrl}${init.path ?? ENDPOINT_PATH}`, {
		method: "POST",
		headers: { Authorization: `Bearer ${init.token ?? SECRET}`, "Content-Type": "application/json" },
		body,
		...(init.signal === undefined ? {} : { signal: init.signal }),
	});
}

describe("POST /perun/events", () => {
	before(async () => {
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	after(() => {
		server.close();
		server.closeAllConnections();
	});

	test("отвечает 404 на другие пути и 405 на другие методы", async () => {
		assert.equal((await post("{}", { path: "/other" })).status, 404);
		const response = await fetch(`${baseUrl}${ENDPOINT_PATH}`);
		assert.equal(response.status, 405);
		assert.equal(response.headers.get("allow"), "POST");
	});

	test("отвечает 401 без верного Bearer-токена", async () => {
		assert.equal((await post('{"type":"agent_settled","aborted":false}', { token: "wrong" })).status, 401);
	});

	test("отвечает 400 на битый JSON и на объект без type", async () => {
		assert.equal((await post("{oops")).status, 400);
		assert.equal((await post('{"id":"1"}')).status, 400);
	});

	test("игнорирует нерелевантные события", async () => {
		const response = await post('{"type":"message_update","assistantMessageEvent":{"type":"text_delta"}}');
		assert.deepEqual(await response.json(), { status: "ignored" });
	});

	test("держит запрос до нажатия кнопки и возвращает extension_ui_response", async () => {
		const reply = post(
			JSON.stringify({ type: "extension_ui_request", id: "ui-1", method: "confirm", title: "bash?", message: "ls" }),
			{ path: `${ENDPOINT_PATH}?session=erp-dev` },
		);
		registry.settle(await notifier.nextConfirmKey(), "approved");
		const response = await reply;
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { type: "extension_ui_response", id: "ui-1", confirmed: true });
		assert.equal(await notifier.nextDecision(), "approved");
		assert.equal(notifier.sent.at(-1)?.session, "erp-dev");
	});

	test("снимает запрос, если клиент оборвал соединение", async () => {
		const controller = new AbortController();
		const reply = post(
			JSON.stringify({ type: "extension_ui_request", id: "ui-2", method: "confirm", title: "edit?", message: "" }),
			{ signal: controller.signal },
		);
		await notifier.nextConfirmKey();
		controller.abort();
		await assert.rejects(reply);
		assert.equal(await notifier.nextDecision(), "aborted");
	});

	test("присылает уведомление о завершении по agent_settled", async () => {
		const response = await post('{"type":"agent_settled","aborted":false}');
		assert.deepEqual(await response.json(), { status: "notified" });
		assert.equal(notifier.sent.at(-1)?.kind, "done");
	});
});
