// Setzt die Auth-Einstellungen von production und blendet graphql_public aus der Daten-API aus. Nur production.
// Aufruf: npm run auth:einrichten -- --ziel production
import { managementApi } from "./lib/management";
import { die, waehleZiel } from "./lib/server";
import { MIN_PASSWORD_LENGTH } from "../src/lib/password";

const ADRESSE = "https://abm-pilot.fcetin19.workers.dev";

const ziel = await waehleZiel("Auth-Einstellungen und Daten-API setzen", ["token"]);
if (ziel !== "production") die("Nur für production. In development bleiben die Einstellungen unverändert.");

const auth = await managementApi("/config/auth", {
  method: "PATCH",
  body: JSON.stringify({ disable_signup: true, external_email_enabled: true, password_min_length: MIN_PASSWORD_LENGTH, site_url: ADRESSE, uri_allow_list: `${ADRESSE}/**` }),
});
if (auth.status >= 300) die(`Auth-Einstellungen fehlgeschlagen (${auth.status}).`);
const api = await managementApi("/postgrest", { method: "PATCH", body: JSON.stringify({ db_schema: "public" }) });
if (api.status >= 300) die(`Daten-API fehlgeschlagen (${api.status}).`);

const a = (await managementApi("/config/auth")).body as Record<string, unknown>;
const p = (await managementApi("/postgrest")).body as Record<string, unknown>;
console.log(
  `Selbstregistrierung aus: ${a.disable_signup}\nE-Mail/Passwort an: ${a.external_email_enabled}\nMindestlänge: ${a.password_min_length}\nSite-URL: ${a.site_url}\nRedirects: ${a.uri_allow_list}\nSchemas der Daten-API: ${p.db_schema}`,
);
