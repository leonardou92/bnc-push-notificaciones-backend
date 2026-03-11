# BNC NotificationPush - Proyecto Node

Este proyecto contiene el contexto de la especificación BNC NotificationPush en formato Markdown para que la IA u otros procesos puedan leerlo.

Cómo usar:

1. Instalar dependencias (opcional, no hay dependencias externas):

```bash
npm install
```

2. Ejecutar:

```bash
npm start
```

El script `src/index.js` imprimirá el contenido del markdown `docs/BNC-NotificationPush.md`.

Servidor de ejemplo (Express)

1. Instalar dependencias:

```bash
npm install
```

2. Crear un archivo `.env` basado en `.env.example` y completar `API_KEY` o `JWT_SECRET`.

3. Ejecutar el servidor:

```bash
npm run serve
```

El servidor expone:

- `GET /ping` — Responde `200` para validar el endpoint (ping).
- `POST /notifications` — Acepta notificaciones; verifica autenticación (x-api-key o Bearer JWT), responde `200` inmediatamente y valida en segundo plano.

Nota: Para desarrollo rápido puedes usar `npm run dev` si instalaste `nodemon`.

### Códigos de estado HTTP

El servidor puede devolver los siguientes códigos HTTP en `POST /notifications`:

- **200 OK**: Acknowledgement inmediato de recepción (la validación completa se realiza en segundo plano).
- **400 Bad Request**: Faltan campos obligatorios o formato inválido en campos básicos (ej. `TxHour`, `TxDate`, `Amount`). El cuerpo de la respuesta incluye un objeto con `error` y detalles.
- **401 Unauthorized**: Autenticación fallida (API Key inválida o JWT inválido).
- **500 Internal Server Error**: Error inesperado en el servidor.

- **503 Service Unavailable**: La base de datos no está disponible o no se pudo conectar. En este caso el servicio responderá con `503` y un cuerpo JSON explicando que la conexión a la base de datos no está disponible.

Nota: Según la especificación, el receptor debe confirmar la recepción del evento con `200` lo antes posible; por eso el servidor realiza validaciones básicas antes de confirmar y deja validaciones más estrictas para procesamiento asíncrono después del `200`.

## Ejemplos de payloads y comandos para recibir tipos de transacción

A continuación hay ejemplos de objetos JSON que el endpoint `POST /notifications` puede recibir, y ejemplos `curl` para probarlos.

1) P2P

Payload (P2P):

```json
{
	"PaymentType": "P2P",
	"OriginBankReference": "ref123",
	"DestinyBankReference": "bnc-ref-456",
	"OriginBankCode": "0001",
	"TxHour": "1530",
	"CurrencyCode": "0928",
	"Amount": "100.00",
	"TxDate": "20250311",
	"CommerceID": "J-12345678-9",
	"CommercePhone": "00584141230000",
	"ClientPhone": "00584141234567",
	"Concept": "Pago movil"
}
```

Ejemplo `curl` con `x-api-key`:

```bash
curl -X POST http://localhost:3000/notifications \
	-H "Content-Type: application/json" \
	-H "x-api-key: your_api_key_here" \
	-d '{"PaymentType":"P2P","Amount":"100.00","OriginBankReference":"ref123","ClientPhone":"00584141234567"}'
```

Ejemplo `curl` con JWT:

```bash
curl -X POST http://localhost:3000/notifications \
	-H "Content-Type: application/json" \
	-H "Authorization: Bearer YOUR_JWT_TOKEN" \
	-d '{"PaymentType":"P2P","Amount":"100.00","OriginBankReference":"ref123","ClientPhone":"00584141234567"}'
```

2) DEP (Depósito)

Payload (DEP):

```json
{
	"PaymentType": "DEP",
	"OriginBankReference": "dep-ref-001",
	"DestinyBankReference": "bnc-ref-789",
	"OriginBankCode": "0002",
	"TxHour": "0905",
	"CurrencyCode": "0928",
	"Amount": "2500.50",
	"TxDate": "20250311",
	"CommerceID": "J-98765432-1",
	"CommercePhone": "00584141230001",
	"DebtorAccount": "01234567890123456789",
	"DebtorID": "V012345678"
}
```

Ejemplo `curl`:

```bash
curl -X POST http://localhost:3000/notifications \
	-H "Content-Type: application/json" \
	-H "x-api-key: your_api_key_here" \
	-d '{"PaymentType":"DEP","Amount":"2500.50","OriginBankReference":"dep-ref-001","DebtorAccount":"01234567890123456789"}'
```

3) TRF (Transferencia)

Payload (TRF):

```json
{
	"PaymentType": "TRF",
	"OriginBankReference": "trf-ref-002",
	"DestinyBankReference": "bnc-ref-101",
	"OriginBankCode": "0003",
	"TxHour": "1145",
	"CurrencyCode": "0928",
	"Amount": "500.00",
	"TxDate": "20250311",
	"CommerceID": "J-55555555-5",
	"CommercePhone": "00584141230002",
	"DebtorAccount": "09876543210987654321",
	"DebtorID": "J000152369",
	"CreditorAccount": "12345098761234509876"
}
```

Ejemplo `curl`:

```bash
curl -X POST http://localhost:3000/notifications \
	-H "Content-Type: application/json" \
	-H "x-api-key: your_api_key_here" \
	-d '{"PaymentType":"TRF","Amount":"500.00","OriginBankReference":"trf-ref-002","DebtorAccount":"09876543210987654321","CreditorAccount":"12345098761234509876"}'
```

Nota: Ajusta los campos según tu sistema receptor y recuerda responder `200` inmediatamente; las validaciones y lógica interna deben ejecutarse después de la confirmación inicial.
