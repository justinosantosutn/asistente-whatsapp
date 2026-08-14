// Script local de un solo uso: obtiene el refresh token de Google Calendar
// para guardarlo en .env como GOOGLE_REFRESH_TOKEN.
//
// Uso (dos pasos, sin input interactivo):
//   1. Completar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env.
//   2. npm run oauth:google            -> imprime la URL para autorizar.
//   3. Abrir esa URL, iniciar sesión con la cuenta de Gmail a usar, autorizar.
//   4. Copiar el valor de 'code' de la URL de redirección.
//   5. npm run oauth:google -- <code>  -> intercambia el código por el refresh token.

import "dotenv/config";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

function getClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/oauth2callback";

  if (!clientId || !clientSecret) {
    console.error("Falta GOOGLE_CLIENT_ID y/o GOOGLE_CLIENT_SECRET en .env");
    process.exit(1);
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function main() {
  const code = process.argv[2];
  const oauth2Client = getClient();

  if (!code) {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
    });

    console.log("\nAbrí esta URL en el navegador y autorizá el acceso:\n");
    console.log(authUrl);
    console.log("\nDespués de autorizar, vas a ser redirigido a una URL que empieza con");
    console.log("http://localhost:3000/oauth2callback?code=...");
    console.log("(la página va a mostrar error de conexión, es normal: copiá igual el valor de 'code' de la URL).");
    console.log("\nLuego corré: npm run oauth:google -- <ese_code>\n");
    return;
  }

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      "\nNo se recibió refresh_token. Esto pasa si ya autorizaste esta app antes." +
        " Revocá el acceso en https://myaccount.google.com/permissions y volvé a generar la URL."
    );
    process.exit(1);
  }

  console.log("\nListo. Agregá esta línea a tu .env:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
