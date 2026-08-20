/******************************************************************
 * Bootstrap del usuario Root (platform_admin) en Supabase LOCAL.
 *
 * Uso:
 *   npm run bootstrap:root
 *
 * Variables de entorno:
 *   NEXT_PUBLIC_SUPABASE_URL     (requerida)
 *   SUPABASE_SERVICE_ROLE_KEY    (requerida)
 *   ROOT_BOOTSTRAP_EMAIL         (requerida) correo del Root local
 *   ROOT_BOOTSTRAP_PASSWORD      (opcional) si no se define, se
 *                                 genera una contraseña temporal y
 *                                 se imprime UNA sola vez en consola.
 *   ALLOW_REMOTE_ROOT_BOOTSTRAP  (opcional, "true") permite ejecutar
 *                                 contra un Supabase no local. NUNCA
 *                                 usar contra producción.
 *
 * Es idempotente: si el correo ya existe, no se modifica ni se
 * duplica. No crea ninguna fila en company_members (platform_admin
 * tiene alcance global).
 ******************************************************************/

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import {
  crearOReutilizarRoot,
  validarConfiguracionBootstrap,
  verificarEntornoPermitido,
} from "../src/lib/rootBootstrapCore.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ROOT_BOOTSTRAP_EMAIL;
const permitirRemoto = String(process.env.ALLOW_REMOTE_ROOT_BOOTSTRAP || "").toLowerCase() === "true";

try {
  validarConfiguracionBootstrap({ url, serviceRoleKey, email });
  verificarEntornoPermitido({ url, permitirRemoto });
} catch (error) {
  console.error(`[BOOTSTRAP ROOT] ${error.message}`);
  process.exit(1);
}

const passwordGenerada = !process.env.ROOT_BOOTSTRAP_PASSWORD;
const password = process.env.ROOT_BOOTSTRAP_PASSWORD || `Pf-${randomBytes(12).toString("base64url")}!9`;

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  const resultado = await crearOReutilizarRoot({ supabase, email, password });

  if (resultado.yaExistia) {
    console.log(
      `[BOOTSTRAP ROOT] El usuario ya existe (userId=${resultado.userId}, role=${resultado.role || "sin rol"}). ` +
        `No se modificó ni se duplicó.`
    );
  } else {
    console.log(`[BOOTSTRAP ROOT] Usuario Root creado (userId=${resultado.userId}, role=${resultado.role}).`);
    console.log(`[BOOTSTRAP ROOT] Correo: ${email}`);

    if (passwordGenerada) {
      console.log(
        `[BOOTSTRAP ROOT] Contraseña temporal generada (guárdala ahora, no se volverá a mostrar): ${resultado.temporaryPassword}`
      );
    } else {
      console.log(`[BOOTSTRAP ROOT] Contraseña tomada de ROOT_BOOTSTRAP_PASSWORD.`);
    }

    console.log(`[BOOTSTRAP ROOT] must_change_password=true — se recomienda cambiarla en el primer inicio de sesión.`);
  }
} catch (error) {
  console.error(`[BOOTSTRAP ROOT] Error al crear el usuario: ${error.message}`);
  process.exit(1);
}
