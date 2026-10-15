// Проверка секрета из заголовка Authorization без утечки по времени сравнения.
import { createHash, timingSafeEqual } from "node:crypto";

export function isAuthorized(header: string | undefined, secret: string): boolean {
	// Сравнивает Bearer-токен запроса с секретом за постоянное время.
	if (header === undefined) {
		return false;
	}
	return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

function digest(value: string): Buffer {
	return createHash("sha256").update(value).digest();
}
