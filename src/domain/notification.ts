// Доменные типы уведомлений, которые бот отправляет пользователю.

export type ConfirmDecision = "approved" | "rejected" | "expired" | "aborted";

export type InputMethod = "select" | "input" | "editor";

export interface RunOutcome {
	finalText: string | undefined;
	errorMessage: string | undefined;
}

export type Notification =
	| { kind: "confirm"; key: string; session: string | undefined; title: string; message: string }
	| {
			kind: "confirm-resolved";
			session: string | undefined;
			title: string;
			message: string;
			decision: ConfirmDecision;
	  }
	| { kind: "input-required"; session: string | undefined; method: InputMethod; title: string }
	| { kind: "done"; session: string | undefined; aborted: boolean; outcome: RunOutcome | undefined };
