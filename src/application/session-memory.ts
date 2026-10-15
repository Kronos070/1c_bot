// Память итога последнего прогона агента для каждой сессии Perun.
import type { RunOutcome } from "../domain/notification.ts";

export interface SessionMemory {
	remember(session: string | undefined, outcome: RunOutcome): void;
	take(session: string | undefined): RunOutcome | undefined;
}

export function createSessionMemory(): SessionMemory {
	// Хранит итог agent_end, пока не придёт agent_settled той же сессии.
	const outcomes = new Map<string, RunOutcome>();
	return {
		remember: (session, outcome) => {
			outcomes.set(session ?? "", outcome);
		},
		take: (session) => {
			const key = session ?? "";
			const outcome = outcomes.get(key);
			outcomes.delete(key);
			return outcome;
		},
	};
}
