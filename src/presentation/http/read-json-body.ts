// Чтение тела HTTP-запроса как JSON с ограничением размера.
import type { IncomingMessage } from "node:http";

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string };

export async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<JsonBodyResult> {
	// Собирает тело запроса и разбирает его как JSON, не храня в памяти больше лимита.
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
		size += buffer.length;
		if (size <= maxBytes) {
			chunks.push(buffer);
		}
	}
	if (size > maxBytes) {
		return { ok: false, status: 413, error: `Тело запроса больше ${maxBytes} байт` };
	}
	try {
		return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
	} catch {
		return { ok: false, status: 400, error: "Тело запроса не является корректным JSON" };
	}
}
