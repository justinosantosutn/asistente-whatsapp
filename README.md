# Asistente Personal por WhatsApp

Bot que recibe mensajes de WhatsApp (texto, audio o imagen), entiende su contenido con IA gratuita (Groq), y:
- crea eventos en tu base de Notion **"Repaso de Actividades"** y en tu **Google Calendar**, o
- registra gastos en tu base de Notion **"Gastos Personales"**.

## Cómo está armado

```
src/
  config.ts                 # variables de entorno
  server.ts                 # servidor Express + webhook de WhatsApp
  whatsapp/                 # cliente de la Graph API (enviar texto, descargar media)
  ai/groq.ts                # transcripción de audio, descripción de imágenes, extracción de intención
  integrations/notion.ts    # crear filas en las dos bases de Notion
  integrations/googleCalendar.ts  # crear eventos en Google Calendar
  router/messageHandler.ts  # orquesta todo el flujo
scripts/                    # scripts de prueba de cada integración por separado
deploy/                     # Dockerfile, docker-compose, Caddyfile para producción
```

El plan completo de diseño está en el archivo de plan de esta sesión; este README se enfoca en **cómo obtener cada credencial y poner todo a andar**, en orden.

---

## Paso 0 — Instalar dependencias

```bash
npm install
cp .env.example .env
```

Vas a ir completando `.env` a medida que avances por los pasos siguientes.

---

## Paso 1 — Groq (IA gratuita)

1. Entrá a https://console.groq.com y creá una cuenta gratis (no pide tarjeta).
2. Andá a **API Keys** → **Create API Key**.
3. Copiá la key y pegala en `.env` como `GROQ_API_KEY`.

Probalo con:
```bash
npm run test:groq
```
Deberías ver en la consola el JSON de intención detectado para 3 mensajes de ejemplo.

---

## Paso 2 — Notion

1. Andá a https://www.notion.so/my-integrations → **New integration**.
2. Ponele un nombre (ej. "Asistente WhatsApp"), asociala a tu workspace, tipo "Internal".
3. Copiá el **Internal Integration Token** y pegalo en `.env` como `NOTION_TOKEN`.
4. Abrí tu base **"Repaso de Actividades"** en Notion → botón `···` (arriba a la derecha) → **Connections** → conectá la integración que creaste.
5. Hacé lo mismo con la base **"Gastos Personales"**.
6. Conseguí el ID de cada base: abrí la base en el navegador, la URL tiene la forma
   `https://www.notion.so/<workspace>/<ID_DE_32_CARACTERES>?v=...` — copiá esos 32 caracteres (podés agregarles guiones o no, funciona igual).
   - Pegalo como `NOTION_ACTIVITIES_DATABASE_ID` (para "Repaso de Actividades").
   - Pegalo como `NOTION_EXPENSES_DATABASE_ID` (para "Gastos Personales").

Probalo con:
```bash
npm run test:notion
```
Deberías ver aparecer una fila `[PRUEBA]` en cada una de las dos bases en Notion. Podés borrarlas después.

---

## Paso 3 — Google Calendar

1. Andá a https://console.cloud.google.com/ y creá un proyecto nuevo (gratis).
2. **APIs & Services → Library** → buscá "Google Calendar API" → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - Tipo de usuario: **External**.
   - Completá nombre de la app y tu email.
   - En "Test users" agregá tu propia cuenta de Gmail (mientras la app esté en modo prueba, solo esas cuentas pueden autenticarse — es suficiente para uso personal).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Tipo de aplicación: **Web application**.
   - En "Authorized redirect URIs" agregá: `http://localhost:3000/oauth2callback`
5. Copiá el **Client ID** y **Client Secret** a `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
6. Corré el script de autorización (una sola vez, local):
   ```bash
   npm run oauth:google
   ```
   Te va a dar una URL: abrila, iniciá sesión con tu cuenta de Gmail, autorizá, y pegá el código que te pida el script en la terminal. Va a imprimir la línea `GOOGLE_REFRESH_TOKEN=...` — agregala a `.env`.

Probalo con:
```bash
npm run test:calendar
```
Deberías ver un evento `[PRUEBA]` aparecer en tu Google Calendar de mañana.

---

## Paso 4 — Probar el flujo completo en local (sin WhatsApp todavía)

Con Groq, Notion y Calendar configurados, ya podés levantar el servidor:
```bash
npm run dev
```
Esto solo confirma que arranca sin errores (`http://localhost:3000/health` debería devolver `{"ok":true}`). Todavía no recibe mensajes reales porque falta conectar WhatsApp — eso es el último paso, a propósito.

---

## Paso 5 — Desplegar en Oracle Cloud Free Tier (antes de conectar WhatsApp)

Por qué Oracle Cloud: es la única nube con capa **siempre gratis** (no un trial de 30 días, no se "duerme" como Render free) — importante porque Meta necesita poder golpear tu webhook en cualquier momento.

1. Creá una cuenta en https://www.oracle.com/cloud/free/ (pide tarjeta para verificación de identidad, pero el tier Always Free no cobra si te quedás dentro de los límites gratuitos).
2. Creá una instancia de cómputo:
   - Shape: **VM.Standard.A1.Flex** (ARM, Always Free) — 1-4 OCPUs / hasta 24GB RAM gratis.
   - Imagen: Ubuntu 22.04 o superior.
   - Guardá la clave SSH que te genera para poder conectarte.
3. En la lista de reglas de seguridad de la VM (Security List / Network Security Group), abrí los puertos **80** y **443** (HTTP/HTTPS) además del 22 (SSH).
4. Conectate por SSH e instalá Docker:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
   sudo usermod -aG docker $USER
   ```
   (cerrá sesión y volvé a entrar para que el grupo tome efecto)
5. Conseguí un subdominio gratis apuntando a la IP pública de tu VM: andá a https://www.duckdns.org, iniciá sesión, creá un subdominio (ej. `mi-asistente.duckdns.org`) y configuralo con la IP pública de la instancia.
6. Cloná/subí el proyecto a la VM (por ejemplo con `git clone` si lo subís a un repo propio, o `scp`).
7. Completá `.env` en la VM con todas las variables ya probadas en los pasos anteriores, más:
   ```
   DOMAIN=mi-asistente.duckdns.org
   ```
8. Levantá todo:
   ```bash
   cd deploy
   docker compose up -d --build
   ```
   Caddy va a obtener un certificado HTTPS automático de Let's Encrypt para tu subdominio. En unos segundos, `https://mi-asistente.duckdns.org/health` debería responder `{"ok":true}` desde cualquier lugar de internet.

**Alternativa más simple (con trade-off):** si no querés lidiar con una VM, podés desplegar en Render (plan free) apuntando el `Dockerfile` de `deploy/`. Es más rápido de configurar, pero el servicio "se duerme" tras ~15 min de inactividad y puede tardar en responder al primer mensaje o incluso hacer que Meta marque el webhook como fallido — para uso personal ocasional puede alcanzar, pero Oracle Cloud es la opción robusta.

---

## Paso 6 — WhatsApp Cloud API (al final, como pediste)

1. Andá a https://developers.facebook.com/ → creá una cuenta de desarrollador si no tenés → **My Apps → Create App** → tipo "Business".
2. Dentro de la app, agregá el producto **WhatsApp**.
3. En la sección de WhatsApp → **API Setup** vas a ver un **número de prueba gratuito** ya asignado (podés enviarte mensajes desde tu WhatsApp personal a ese número para probar, sin usar tu propio número como bot).
4. Copiá:
   - **Temporary access token** (o generá uno permanente con un System User, ver abajo) → `WHATSAPP_ACCESS_TOKEN`.
   - **Phone number ID** (no es el número, es un ID interno) → `WHATSAPP_PHONE_NUMBER_ID`.
5. En **Configuration → Webhook**:
   - Callback URL: `https://mi-asistente.duckdns.org/webhook`
   - Verify token: el mismo valor que pusiste en `.env` como `WHATSAPP_VERIFY_TOKEN` (inventalo antes, cualquier string).
   - Click **Verify and Save** (tu servidor ya debe estar corriendo en la VM para que esto funcione).
   - Suscribite al campo **messages**.
6. En **API Setup**, agregá tu propio número de WhatsApp como "recipient" de prueba (Meta pide agregar destinatarios de prueba mientras la app no está verificada para producción).
7. Reiniciá el contenedor si cambiaste `.env`:
   ```bash
   docker compose restart bot
   ```

**Token permanente (opcional, recomendado para no tener que renovar cada 24hs):**
El token temporal expira en 24hs. Para uno de larga duración: **Business Settings → System Users → Create System User** → asignale la app de WhatsApp con permiso `whatsapp_business_messaging` → **Generate Token** con expiración "Never".

### Probar de punta a punta
Desde tu WhatsApp personal, escribile al número de prueba:
- Texto: `"recordame el parcial de gestión el viernes a las 14"` → debería responder confirmando y creando el evento en Notion + Google Calendar.
- Un audio diciendo lo mismo → debería transcribirlo y hacer lo mismo.
- Una foto de un ticket con el texto `"gasté esto"` como caption → debería registrar el gasto en "Gastos Personales".

Para ver logs si algo falla:
```bash
docker compose logs -f bot
```
