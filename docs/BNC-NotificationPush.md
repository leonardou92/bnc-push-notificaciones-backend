# BNC NotificationPush V2.0

## Evolución de la Aplicación: Principales Mejoras

La nueva versión de nuestra aplicación incorpora mejoras estratégicas que elevan la experiencia del usuario y consolidan la arquitectura del sistema:

- Se ha modernizado el sistema de notificaciones, permitiendo el envio de notificaciones más precisos y oportunos, lo que facilita una interacción eficiente en tiempo real.

- El proceso de registro de clientes ha sido optimizado, adoptando un enfoque dinámico que se ajusta con mayor flexibilidad a los requerimientos específicos y tiempos de integración de cada cliente.

- Se ha implementado un esquema de alta disponibilidad, diseñado para garantizar la continuidad operativa, la tolerancia ante fallos y la escalabilidad del servicio, asegurando así una plataforma robusta, confiable y preparada para entornos exigentes.

## Gestión de Notificaciones: Reglas de Recepción y Respuesta

Durante el proceso de recepción de una notificación, el sistema se encuentra en un estado transitorio, diseñado exclusivamente para el manejo seguro y consistente del evento entrante. En esta fase:

- No se debe ejecutar lógica adicional.

- No se deben desencadenar acciones complementarias.

- No se debe acceder a recursos externos ni modificar el estado de la aplicación.

Intentar realizar operaciones fuera de este contexto puede generar retraso en las colas de notificaciones, errores inesperados o inconsistencias en el flujo de datos, comprometiendo la estabilidad del sistema.

## Clausula de Disponibilidad, Recepción y Control del Servicio de Notificaciones

Para garantizar la correcta operación del sistema de notificaciones, el cliente deberá cumplir con los siguientes compromisos técnicos y operativos:

### 1. Responsabilidad del Cliente

La seguridad, estabilidad y disponibilidad del servicio a construir es responsabilidad exclusiva del cliente.

- El servicio debe estar diseñado para recibir notificaciones de pago con los datos estructurados y definidos por BNC.

- El servicio debe estar disponible las 24 horas del día, los 7 días de la semana, sin interrupciones, para asegurar la continuidad de la plataforma.

### 2. Confirmación de Recepción

Cada notificación será enviada reiteradamente hasta que se obtenga una respuesta exitosa por parte del servicio del cliente.

- El cliente debe responder de forma inmediata con un código HTTP 200 OK, confirmando la recepción exitosa del evento.

- Cualquier lógica interna, validación de datos o procesamiento adicional debe ejecutarse después de haber confirmado la recepción.

Bajo ningún concepto estas validaciones deben interferir con la respuesta inicial al sistema.

### 3. Reintentos y Control Operativo

En caso de que ocurra un error durante la notificación (por ejemplo, servicio no disponible, respuesta inválida, error de autenticación), el sistema continuará reintentando el envío hasta obtener una respuesta válida.

Queda a criterio exclusivo del BNC evaluar la estabilidad del servicio del cliente. En caso de respuestas reiteradas de error, el banco se reserva el derecho de desactivar temporal o permanentemente el servicio, con el fin de proteger la integridad de la plataforma.

## Excepciones Críticas

En los casos en que la notificación no pueda ser autenticada correctamente, el sistema podrá rechazarla en este caso el cliente podrá devolver un string con los posibles errores de autenticación. Esto incluye:

- Credenciales inválidas

- Token expirado

- Encabezado de autorización ausente o mal formado

En tales situaciones, se devolverá un código HTTP 401 Unauthorized, acompañado de un string descriptivo que indique la causa del rechazo.

## Obligación Técnica de Validación

**Una vez recibida la notificación y habiendo respondido con un HTTP 200, es obligatorio que el sistema receptor realice una validación rigurosa de las referencias y campos involucrados antes de ejecutar cualquier lógica interna, como el procesamiento de datos, actualización de registros, invocación de servicios o aplicación de reglas de negocio. Esta validación es indispensable para evitar el procesamiento duplicado de notificaciones, lo cual podría derivar en errores críticos como pagos repetidos a clientes.**

Esto cobra aún más relevancia considerando que, en algunos casos, las notificaciones pueden ser reenviadas, ya sea por reintentos automáticos o condiciones de red, por lo que el sistema receptor debe estar preparado para manejar estos escenarios de forma segura y consistente.

### Objetivos de la Validación:

- Evitar errores derivados de referencias inexistentes, campos malformados o datos inconsistentes.

- Prevenir el procesamiento duplicado, ya sea por notificaciones reenviadas o por operaciones simultáneas, lo cual puede generar pagos repetidos o registros inconsistentes.

- Validar la forma y los valores de los atributos, asegurando que cumplan con las reglas definidas y mantengan coherencia entre entidades

## Tipos de Autenticación

### 1. API Key

Este método de autenticación requiere que el cliente proporcione:

- Una URL de Webhook donde se recibirán las notificaciones.

- Una clave de autenticación (API Key) que se incluirá en el encabezado de la solicitud con el siguiente formato (clave, valor):

```
x-api-key: <valor_de_la_clave>
```

El valor de la clave será una cadena de texto proporcionada previamente por el sistema.

### 2. JSON Web Token (JWT)

Este esquema de autenticación se basa en el uso de tokens y requiere dos rutas por parte del cliente:

#### Ruta de Autenticación

El cliente debe proporcionar una URL de autenticación junto con credenciales de acceso (usuario y contraseña).

Ejemplo de payload:

```json
{
  "Login": "example",
  "Password": "123456"
}
```

Al realizar una solicitud a esta ruta:

- Si las credenciales son válidas, el sistema responderá con un token en texto plano.

```
"AJABNABAVÑUBGWEIPQJFPQWFH"
```

- Si las credenciales son inválidas, se debe retornar código HTTP 400 junto con un mensaje descriptivo para efectos de log y resolucion de problemas.

#### Ruta de Notificación

Una vez obtenido el token, se utilizará para enviar notificaciones a una segunda URL proporcionada por el cliente. En este caso, la solicitud debe incluir el siguiente encabezado:

```
Authorization: Bearer <token_obtenido>
```

## Requisito de habilitación de ping en el endpoint de notificaciones para la certificación del endpoint proporcionado por el cliente

### 1. Contexto del sistema

El sistema de notificaciones PUSH requiere que cada cliente proporciona un Webhook donde serán entregadas las notificaciones.
Durante el proceso de registro, la validación de este endpoint se realiza de manera automática, sin intervención manual.

### 2. Validación inicial mediante ping

Una vez que el cliente registra su URL, el sistema ejecuta un ping automático hacia el endpoint.

Este ping confirma que:

- El servidor está disponible y accesible desde nuestra infraestructura.

- La ruta configurada es correcta y responde adecuadamente.

### 3. Requisito para certificación

Para garantizar la correcta integración y certificación del servicio, es obligatorio que el endpoint proporcionado:

- Permita recibir y responder al ping inicial.

- Devuelva un código de estado HTTP válido (ejemplo: 200 OK).

- No bloquee la conexión por firewalls, reglas de seguridad o configuraciones de red, en caso de manejar una lista blanca de IP el cliente debera solicitar la IP y agregarla antes de comenzar las pruebas.

**Nota para el cliente:**
Si su servidor no tiene habilitado el ping, deberá ajustar la configuración de red o seguridad para permitirlo solo mientras se realiza el proceso de certificacón, una vez certificado el cliente puede desabilitar el ping si asi lo desea.

## Ejemplo de Objetos de Notificaciónes

### P2P

```json
{
  "PaymentType": "P2P",
  "OriginBankReference": "string",
  "DestinyBankReference": "string",
  "OriginBankCode": "string",
  "Hour": "string",
  "CurrencyCode": "string",
  "Amount": "string",
  "Date": "string",
  "CommerceID": "string",
  "CommercePhone": "string",
  "ClientPhone": "string",
  "Concept": "string"
}
```

### DEP y TRF

```json
{
  "PaymentType": "DEP",
  "OriginBankReference": "string",
  "DestinyBankReference": "string",
  "OriginBankCode": "string",
  "Hour": "string",
  "CurrencyCode": "string",
  "Amount": "string",
  "Date": "string",
  "CommerceID": "string",
  "CommercePhone": "string",
  "DebtorAccount": "string",
  "DebtorID": "string",
  "CreditorAccount": "string"
}
```

## Datos incluidos en la notificacion de Pago

| Dominio | Campo | Tipo | Descripcion |
|---|---|---|---|
| General | PaymentType | String | Tipo de pago, puede tomar los siguientes valores: P2P, TRF, DEP |
| General | OriginBankReference | String | Numero de referencia, código generado y entregado por el banco ordenante para identificar de forma única el registro en la plataforma. |
| General | DestinyBankReference | String | Numero de referencia generado en BNC. |
| General | OriginBankCode | String | Código de 4 dígitos que identifica a la entidad financiera ordenante de la transacción. |
| General | TxHour | String | Hora militar de la transacción en formato HHMM (2359) |
| General | CurrencyCode | String | Contiene la representación de la moneda usada en la transacción (Ej: 0928) |
| General | Amount | String | Monto de la transacción en formato 15+2 con separador decimal "." (Ej: 999999999999999.99) |
| General | TxDate | String | Fecha de la transacción en el formato yyyyMMdd. (Ej: 20230530) |
| General | CommerceID | String | Es el RIF del comercio receptor asociado a la transacción. |
| P2P | ClientPhone | String | Número de teléfono del ordenante de la transacción, bajo el formato de numero internacional (Ej: 00584141234567) |
| P2P | Concept | String | Campo que identifica el motivo o naturaleza de la transacción. |
| P2P | CommercePhone | String | Número de teléfono del receptor de la transacción, bajo el formato de numero internacional (Ej: 00584141234567) |
| TRF-DEP | DebtorAccount | String | Número de cuenta ordenante. Cuentas completes de 20 dígitos. |
| TRF-DEP | DebtorID | String | Numero de cedula/rif del ordenante. (Ej: V012345678/J000152369) |
| TRF-DEP | CreditorAccount | String | Número de cuenta beneficiario. Cuentas completes de 20 dígitos. |

## Proceso de Certificación de Notificaciones

Para llevar a cabo el proceso de certificación de notificaciones, es necesario, indispensable y obligatorio que el cliente disponga de dos entornos claramente definidos y operativos, además de entregar las URLs correspondientes para cada uno:

### Ambiente de Desarrollo (Development Environment)

- Debe estar completamente habilitado para la implementación, prueba y ajuste de la lógica de notificaciones.

- Tiene que simular condiciones reales, incluyendo la integración con los sistemas emisores y receptores.

- Su propósito principal es validar el funcionamiento técnico y funcional en un entorno controlado, sin afectar procesos en producción.

- Importante: Todas las validaciones, simulaciones y ajustes deben ejecutarse exclusivamente en este entorno. Bajo ningún concepto se realizarán pruebas en el entorno de producción.

### Ambiente de Producción (Production Environment)

- Representa el sistema en operación real, donde se ejecutan los procesos definitivos.

- Debe estar completamente habilitado, con todos los componentes de notificación integrados y funcionando según los parámetros establecidos en la documentación técnica.

- Su función es recibir las notificaciones finales, ya certificadas, y entregarlas a los usuarios o sistemas destino.

## Requisitos de Entrega

Para iniciar el proceso de certificación, el cliente debe proporcionar:

- URL del entorno de desarrollo

- URL del entorno de producción

La entrega de estas URLs es un requisito excluyente. Sin ellas, no será posible avanzar ni completar el proceso de certificación.
