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
# BNC NotificationPush - Proyecto Node

Este repositorio contiene una implementación de ejemplo del receptor BNC NotificationPush y la especificación en `docs/BNC-NotificationPush.md`.

Requisitos
- Node.js 18+ instalado
- Una base de datos MySQL accesible (configurar `DATABASE_URL` en `.env`)

Instalación

```bash
npm install
npx prisma generate
```

Configuración

- Copia `.env.example` a `.env` y ajusta `DATABASE_URL`, `API_KEY` y `JWT_SECRET` según tu entorno.
- Si necesitas aplicar el esquema a la base de datos local:

```bash
npx prisma db push
```

Uso

- Iniciar servidor (producción):

```bash
npm run serve
```

- Modo desarrollo (con reinicio automático):

```bash
npm run dev
```

Endpoints principales

- `GET /` — Página de estado rápida (muestra versión, hora y uptime).
- `GET /ping` — Responde 200 OK.
- `GET /health` — Devuelve estado de la conexión a la base de datos.
- `POST /notifications` — Endpoint que recibe las notificaciones. Requiere `x-api-key` o `Authorization: Bearer <token>`.

Comportamiento clave

- El endpoint `POST /notifications` responde `200` inmediatamente (acknowledgement). La validación y el almacenamiento se realizan asíncronamente.
- Si la base de datos no está disponible la API responde `503` en lugar de `200`.
- Las validaciones posteriores pueden generar un registro en la tabla de logs `notification_error_logs` y almacenar la notificación con `processed=false` si hay errores de validación.
- Regla de duplicados: el servicio evita insertar duplicados comparando `OriginBankReference` (últimos 6 dígitos), `TxDate` y `Amount`. Si se detecta duplicado, no se inserta una nueva notificación y se crea una entrada de error en `notification_error_logs`.

Ejemplos de payloads

P2P (ejemplo):

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

DEP (ejemplo):

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

TRF (ejemplo):

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

Ejemplo `curl` básico:

```bash
curl -X POST http://localhost:3000/notifications \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key_here" \
  -d '{"PaymentType":"DEP","Amount":"2500.50","OriginBankReference":"dep-ref-001","DebtorAccount":"01234567890123456789"}'
```

Notas finales

- Ajusta los campos y encabezados según tu integración. Para pruebas locales asegúrate de setear `DATABASE_URL` en `.env` y ejecutar `npx prisma db push` si usas la base de datos local.
- Para consultas directas a la base de datos revisa las tablas `notifications` y `notification_error_logs`.
