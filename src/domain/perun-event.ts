// Разбор сырых событий Perun RPC (stdout headless-режима) в события, важные для бота.
import { z } from "zod";
import type { InputMethod, RunOutcome } from "./notification.ts";

const eventTypeSchema = z.object({ type: z.string().min(1) });

const confirmSchema = z.object({
	type: z.literal("extension_ui_request"),
	method: z.literal("confirm"),
	id: z.string().min(1),
	title: z.string(),
	message: z.string(),
	timeout: z.number().int().positive().optional(),
});

const inputSchema = z.object({
	type: z.literal("extension_ui_request"),
	method: z.enum(["select", "input", "editor"]),
	id: z.string().min(1),
	title: z.string(),
});

const agentEndSchema = z.object({
	type: z.literal("agent_end"),
	messages: z.array(z.unknown()),
});

const agentSettledSchema = z.object({
	type: z.literal("agent_settled"),
	aborted: z.boolean(),
});

const assistantMessageSchema = z.object({
	role: z.literal("assistant"),
	content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
	errorMessage: z.string().optional(),
});

export type PerunEvent =
	| { kind: "confirm"; id: string; title: string; message: string; timeoutMs: number | undefined }
	| { kind: "input-required"; id: string; method: InputMethod; title: string }
	| { kind: "run-finished"; outcome: RunOutcome }
	| { kind: "settled"; aborted: boolean }
	| { kind: "other"; type: string };

export function parsePerunEvent(raw: unknown): PerunEvent | undefined {
	// Превращает JSON-объект из stdout Perun в типизированное событие, а не-событие — в undefined.
	const base = eventTypeSchema.safeParse(raw);
	if (!base.success) {
		return undefined;
	}
	const confirm = confirmSchema.safeParse(raw);
	if (confirm.success) {
		const { id, title, message, timeout } = confirm.data;
		return { kind: "confirm", id, title, message, timeoutMs: timeout };
	}
	const input = inputSchema.safeParse(raw);
	if (input.success) {
		const { id, method, title } = input.data;
		return { kind: "input-required", id, method, title };
	}
	const agentEnd = agentEndSchema.safeParse(raw);
	if (agentEnd.success) {
		return { kind: "run-finished", outcome: extractOutcome(agentEnd.data.messages) };
	}
	const settled = agentSettledSchema.safeParse(raw);
	if (settled.success) {
		return { kind: "settled", aborted: settled.data.aborted };
	}
	return { kind: "other", type: base.data.type };
}

function extractOutcome(messages: readonly unknown[]): RunOutcome {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const parsed = assistantMessageSchema.safeParse(messages[index]);
		if (!parsed.success) {
			continue;
		}
		const text = parsed.data.content
			.flatMap((part) => (part.type === "text" && part.text !== undefined ? [part.text] : []))
			.join("\n")
			.trim();
		return { finalText: text === "" ? undefined : text, errorMessage: parsed.data.errorMessage };
	}
	return { finalText: undefined, errorMessage: undefined };
}
