# Perun → Telegram: уведомления от ИИ-напарника

Когда [ПерУН](https://github.com/kennyluvvuu/perun) работает в фоне (headless-режим), за ним не нужно следить с экрана. Этот бот пишет вам в Telegram в двух случаях:

- **Perun просит разрешение.** Например, хочет выполнить команду в терминале или изменить файл вне проекта. Под сообщением две кнопки: «✅ Разрешить» и «❌ Отклонить». Ответ сразу уходит в Perun.
- **Perun закончил работу.** Придёт его итоговый ответ, а если что-то пошло не так, то текст ошибки. Отдельно бот сообщает, если работу прервали.

Если Perun ждёт от вас выбор варианта или ввод текста, бот предупредит об этом, но ответить нужно будет в программе, через которую запущен Perun.

## Как выглядят сообщения

```
🔐 Perun просит разрешение
📁 erp-dev

[1C Безопасность]: Разрешить вызов инструмента 'bash'?
│ Выполнение команд терминала (bash) требует подтверждения пользователя.

[ ✅ Разрешить ]  [ ❌ Отклонить ]
```

```
✅ Perun закончил работу
📁 erp-dev

│ Добавил движение по регистру ВзаиморасчетыСКлиентами, тесты прошли.
```

После нажатия кнопки сообщение обновится: в нём останется ваше решение, а кнопки исчезнут. Если долго не отвечать, запрос отменится сам (по умолчанию через 4,5 минуты) и Perun не будет выполнять действие.

## Установка

Понадобится [Node.js](https://nodejs.org/) версии 22.18 или новее.

1. **Создайте бота.** Напишите [@BotFather](https://t.me/BotFather) команду `/newbot` и сохраните токен, который он пришлёт.
2. **Скачайте зависимости.** В папке с ботом выполните:
   ```bash
   npm install
   ```
3. **Заполните настройки.** Скопируйте `.env.example` в `.env` и укажите:
   - `TELEGRAM_BOT_TOKEN`: токен от BotFather;
   - `PERUN_WEBHOOK_SECRET`: любой длинный пароль от 16 символов. Его же нужно будет указать в программе, которая запускает Perun. Сгенерировать пароль можно командой `openssl rand -hex 32`.
4. **Узнайте свой chat_id.** Запустите бота командой `npm start`, найдите его в Telegram и отправьте `/start`. Бот ответит числом, это и есть ваш chat_id. Впишите его в `TELEGRAM_CHAT_ID` в файле `.env`.
5. **Перезапустите бота** (`Ctrl+C`, затем `npm start`). На `/start` бот теперь ответит «Уведомления Perun приходят в этот чат».

## Настройки

| Параметр | Что это | По умолчанию |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен бота от BotFather | обязателен |
| `TELEGRAM_CHAT_ID` | Чат, куда приходят уведомления | узнаётся через `/start` |
| `PERUN_WEBHOOK_SECRET` | Пароль, по которому бот узнаёт «свой» Perun | обязателен |
| `HOST` | Адрес, на котором бот принимает события | `127.0.0.1` (только этот компьютер) |
| `PORT` | Порт для событий | `8787` |
| `CONFIRM_TIMEOUT_MS` | Сколько ждать ответа на запрос разрешения, в миллисекундах | `270000` (4,5 минуты) |

Кнопки работают только в чате из `TELEGRAM_CHAT_ID`, поэтому посторонние не смогут ничего разрешить за вас.

## Проверка без Perun

Когда бот запущен, выполните в другом терминале (подставьте свой пароль):

```bash
curl -X POST "http://127.0.0.1:8787/perun/events?session=test" \
  -H "Authorization: Bearer ВАШ_ПАРОЛЬ" \
  -d '{"type":"agent_settled","aborted":false}'
```

В Telegram должно прийти «✅ Perun закончил работу».

---

## Для разработчика клиента Perun

Что нужно доработать в самом Perun, чтобы он слал события боту без отдельного моста, описано в [docs/perun-integration.md](docs/perun-integration.md).

У бота один эндпоинт: `POST /perun/events`. Он принимает **сырые события** из stdout Perun в `--mode rpc` (по одному JSON-объекту на запрос).

- Авторизация: заголовок `Authorization: Bearer <PERUN_WEBHOOK_SECRET>`.
- Необязательный параметр `?session=<имя>` попадает в уведомление (📁). Удобно, если запущено несколько Perun.
- Пересылать достаточно событий `extension_ui_request`, `agent_end` и `agent_settled`. Остальные бот примет и вернёт `{"status":"ignored"}`.

| Событие | Что делает бот | Ответ эндпоинта |
|---|---|---|
| `extension_ui_request` с `method: "confirm"` | Присылает кнопки и **держит запрос**, пока пользователь не ответит или не истечёт таймаут | Готовый `extension_ui_response`: `{"type":"extension_ui_response","id":"…","confirmed":true\|false}` или `{"…","cancelled":true}` |
| `extension_ui_request` с `select`, `input`, `editor` | Предупреждает, что Perun ждёт ввода | `{"status":"notified"}` |
| `agent_end` | Запоминает итоговый ответ агента | `{"status":"accepted"}` |
| `agent_settled` | Присылает «Perun закончил работу» с итогом | `{"status":"notified"}` |

Если в ответе есть `"type":"extension_ui_response"`, запишите его в stdin Perun одной строкой. Если HTTP-клиент оборвёт соединение, бот снимет кнопки и пометит запрос как отменённый. При ошибке Telegram эндпоинт вернёт `502`, и тогда на запрос нужно ответить локально.

> Если увеличиваете `CONFIRM_TIMEOUT_MS` больше 5 минут, увеличьте и таймаут ожидания ответа в HTTP-клиенте. У `fetch` в Node.js и у `aiohttp` по умолчанию это 5 минут.

Минимальный мост на Node.js:

```ts
import { spawn } from "node:child_process";

const BOT_URL = "http://127.0.0.1:8787/perun/events?session=erp-dev";
const FORWARDED = new Set(["extension_ui_request", "agent_end", "agent_settled"]);

const perun = spawn("perun", ["--mode", "rpc"], { stdio: ["pipe", "pipe", "inherit"] });
let buffer = "";

perun.stdout.setEncoding("utf8").on("data", (chunk: string) => {
	buffer += chunk;
	for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
		const line = buffer.slice(0, end).replace(/\r$/, "");
		buffer = buffer.slice(end + 1);
		void forward(line);
	}
});

async function forward(line: string): Promise<void> {
	const event: { type?: string } = JSON.parse(line);
	if (event.type === undefined || !FORWARDED.has(event.type)) return;
	const response = await fetch(BOT_URL, {
		method: "POST",
		headers: { Authorization: `Bearer ${process.env.PERUN_WEBHOOK_SECRET}`, "Content-Type": "application/json" },
		body: line,
	});
	const reply: { type?: string } = await response.json();
	if (reply.type === "extension_ui_response") perun.stdin.write(`${JSON.stringify(reply)}\n`);
}
```

Строки stdout делите только по `\n`, а не через `readline`: Perun может прислать символы `U+2028`/`U+2029` внутри JSON (см. `RPC_DOCS.md` в репозитории Perun).

## Для разработки

```bash
npm run check   # проверка типов, линтер и тесты
```
