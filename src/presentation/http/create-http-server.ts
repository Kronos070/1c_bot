// HTTP-слой: единственный эндпоинт POST /perun/events для событий Perun.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { PerunEventHandler } from "../../application/handle-perun-event.ts";
import { parsePerunEvent } from "../../domain/perun-event.ts";
import { isAuthorized } from "./is-authorized.ts";
import { readJsonBody } from "./read-json-body.ts";

export const ENDPOINT_PATH = "/perun/events";

const MAX_BODY_BYTES = 16 * 1024 * 1024;
const MAX_SESSION_LENGTH = 64;

export interface HttpServerDeps {
	secret: string;
	handle: PerunEventHandler;
	reportError: (error: unknown) => void;
}

export function createHttpServer(deps: HttpServerDeps): Server {
	// Создаёт HTTP-сервер, который принимает события Perun и отвечает решением бота.
	return createServer((request, response) => {
		handleRequest(deps, request, response).catch((error: unknown) => {
			deps.reportError(error);
			sendJson(response, 502, { error: "Не удалось доставить уведомление в Telegram" });
		});
	});
}

async function handleRequest(deps: HttpServerDeps, request: IncomingMessage, response: ServerResponse): Promise<void> {
	const url = new URL(request.url ?? "/", "http://localhost");
	if (url.pathname !== ENDPOINT_PATH) {
		sendJson(response, 404, { error: `Единственный эндпоинт: POST ${ENDPOINT_PATH}` });
		return;
	}
	if (request.method !== "POST") {
		response.setHeader("Allow", "POST");
		sendJson(response, 405, { error: "Разрешён только метод POST" });
		return;
	}
	if (!isAuthorized(request.headers.authorization, deps.secret)) {
		sendJson(response, 401, { error: "Неверный или отсутствующий Bearer-токен" });
		return;
	}
	const body = await readJsonBody(request, MAX_BODY_BYTES);
	if (!body.ok) {
		sendJson(response, body.status, { error: body.error });
		return;
	}
	const event = parsePerunEvent(body.value);
	if (event === undefined) {
		sendJson(response, 400, { error: "Ожидался JSON-объект события Perun с полем type" });
		return;
	}
	const controller = new AbortController();
	response.on("close", () => {
		if (!response.writableEnded) {
			controller.abort();
		}
	});
	const reply = await deps.handle(event, { session: readSession(url), signal: controller.signal });
	sendJson(response, 200, reply);
}

function readSession(url: URL): string | undefined {
	const session = url.searchParams.get("session")?.trim();
	return session === undefined || session === "" ? undefined : session.slice(0, MAX_SESSION_LENGTH);
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
	if (response.headersSent || response.destroyed) {
		return;
	}
	const body = JSON.stringify(payload);
	response.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(body),
	});
	response.end(body);
}
