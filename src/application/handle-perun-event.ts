// Сценарий обработки одного события Perun: уведомить, спросить разрешение или промолчать.
import type { ConfirmDecision } from "../domain/notification.ts";
import type { PerunEvent } from "../domain/perun-event.ts";
import type { ConfirmRegistry } from "./confirm-registry.ts";
import type { Notifier } from "./ports.ts";
import type { SessionMemory } from "./session-memory.ts";

export type EndpointReply =
	| { status: "notified" | "accepted" | "ignored" }
	| { type: "extension_ui_response"; id: string; confirmed: boolean }
	| { type: "extension_ui_response"; id: string; cancelled: true };

export interface PerunEventContext {
	session: string | undefined;
	signal: AbortSignal;
}

export type PerunEventHandler = (event: PerunEvent, context: PerunEventContext) => Promise<EndpointReply>;

export interface PerunEventHandlerDeps {
	notifier: Notifier;
	registry: ConfirmRegistry;
	memory: SessionMemory;
	defaultConfirmTimeoutMs: number;
	reportError: (error: unknown) => void;
}

type ConfirmEvent = Extract<PerunEvent, { kind: "confirm" }>;

export function createPerunEventHandler(deps: PerunEventHandlerDeps): PerunEventHandler {
	// Сопоставляет событию Perun действие бота и ответ эндпоинта.
	return async (event, { session, signal }) => {
		switch (event.kind) {
			case "confirm":
				return askConfirm(deps, event, session, signal);
			case "input-required":
				await deps.notifier.send({ kind: "input-required", session, method: event.method, title: event.title });
				return { status: "notified" };
			case "run-finished":
				deps.memory.remember(session, event.outcome);
				return { status: "accepted" };
			case "settled":
				await deps.notifier.send({
					kind: "done",
					session,
					aborted: event.aborted,
					outcome: deps.memory.take(session),
				});
				return { status: "notified" };
			case "other":
				return { status: "ignored" };
		}
	};
}

async function askConfirm(
	deps: PerunEventHandlerDeps,
	event: ConfirmEvent,
	session: string | undefined,
	signal: AbortSignal,
): Promise<EndpointReply> {
	const pending = deps.registry.open(event.timeoutMs ?? deps.defaultConfirmTimeoutMs, signal);
	const question = { session, title: event.title, message: event.message };
	let messageId: number;
	try {
		messageId = await deps.notifier.send({ kind: "confirm", key: pending.key, ...question });
	} catch (error) {
		deps.registry.settle(pending.key, "aborted");
		throw error;
	}
	const decision = await pending.decision;
	try {
		await deps.notifier.replace(messageId, { kind: "confirm-resolved", decision, ...question });
	} catch (error) {
		deps.reportError(error);
	}
	return toUiResponse(event.id, decision);
}

function toUiResponse(id: string, decision: ConfirmDecision): EndpointReply {
	if (decision === "approved" || decision === "rejected") {
		return { type: "extension_ui_response", id, confirmed: decision === "approved" };
	}
	return { type: "extension_ui_response", id, cancelled: true };
}
