// Порт мессенджера: что прикладному слою нужно от канала уведомлений.
import type { Notification } from "../domain/notification.ts";

export interface Notifier {
	send(notification: Notification): Promise<number>;
	replace(messageId: number, notification: Notification): Promise<void>;
}
