// Формат callback_data для кнопок «Разрешить» / «Отклонить».

export const CONFIRM_CALLBACK_PATTERN = /^confirm:([0-9a-f-]{36}):(yes|no)$/;

export function confirmCallbackData(key: string, approved: boolean): string {
	// Кодирует ключ ожидания и ответ пользователя в callback_data кнопки.
	return `confirm:${key}:${approved ? "yes" : "no"}`;
}
