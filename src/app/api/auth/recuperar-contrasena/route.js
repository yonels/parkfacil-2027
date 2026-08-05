import { NextResponse } from "next/server";

import { enviarCorreoMicrosoft } from "@/lib/mailService";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

const RESPUESTA_GENERICA =
  "Si la cuenta está habilitada para recuperar su contraseña, recibirá un enlace en su correo.";

const ROLES_CLIENTE_PERMITIDOS = new Set([
  "company_admin",
  "operator",
]);

const MODO_DIAGNOSTICO =
  process.env.NODE_ENV !== "production";

function diagnostico(etiqueta, valor = "") {
  if (!MODO_DIAGNOSTICO) {
    return;
  }

  console.log(
    `[RECUPERAR CONTRASEÑA] ${etiqueta}`,
    valor
  );
}

function normalizarEmail(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase();
}

function escaparHtml(valor) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function obtenerPortal(request) {
  const forwardedHost =
    request.headers.get("x-forwarded-host");

  const host = String(
    forwardedHost ||
      request.headers.get("host") ||
      ""
  )
    .split(":")[0]
    .trim()
    .toLowerCase();

  diagnostico("Host detectado:", host);

  if (host === "root.parkfacilapp.cl") {
    return "root";
  }

  if (host === "cliente.parkfacilapp.cl") {
    return "cliente";
  }

  if (
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    const portalPrueba = String(
      request.headers.get(
        "x-parkfacil-portal"
      ) || ""
    )
      .trim()
      .toLowerCase();

    diagnostico(
      "Portal enviado para prueba local:",
      portalPrueba
    );

    return portalPrueba === "root"
      ? "root"
      : "cliente";
  }

  return null;
}

function construirRedirectTo(portal) {
  if (portal === "root") {
    return "https://root.parkfacilapp.cl/nueva-contrasena";
  }

  if (portal === "cliente") {
    return "https://cliente.parkfacilapp.cl/nueva-contrasena";
  }

  return null;
}

function usuarioAuthHabilitado(usuario) {
  if (!usuario) {
    diagnostico(
      "Validación Auth:",
      "usuario no encontrado"
    );

    return false;
  }

  if (!usuario.email_confirmed_at) {
    diagnostico(
      "Validación Auth:",
      "correo no confirmado"
    );

    return false;
  }

  if (usuario.deleted_at) {
    diagnostico(
      "Validación Auth:",
      "usuario eliminado"
    );

    return false;
  }

  if (
    usuario.banned_until &&
    new Date(
      usuario.banned_until
    ).getTime() > Date.now()
  ) {
    diagnostico(
      "Validación Auth:",
      "usuario bloqueado"
    );

    return false;
  }

  diagnostico(
    "Validación Auth:",
    "usuario habilitado"
  );

  return true;
}

async function buscarUsuarioPorEmail(
  supabase,
  email
) {
  const porPagina = 200;
  let pagina = 1;

  while (pagina <= 20) {
    diagnostico(
      "Buscando usuario en página:",
      pagina
    );

    const {
      data,
      error,
    } = await supabase.auth.admin.listUsers({
      page: pagina,
      perPage: porPagina,
    });

    if (error) {
      throw error;
    }

    const usuarios = Array.isArray(
      data?.users
    )
      ? data.users
      : [];

    const encontrado = usuarios.find(
      (usuario) =>
        normalizarEmail(usuario.email) ===
        email
    );

    if (encontrado) {
      diagnostico(
        "Usuario encontrado:",
        encontrado.email
      );

      return encontrado;
    }

    if (usuarios.length < porPagina) {
      diagnostico(
        "Usuario encontrado:",
        "no"
      );

      return null;
    }

    pagina += 1;
  }

  diagnostico(
    "Usuario encontrado:",
    "no"
  );

  return null;
}

function validarRoot(usuario) {
  if (!usuarioAuthHabilitado(usuario)) {
    return false;
  }

  const rol =
    usuario.app_metadata?.role || null;

  diagnostico(
    "Rol Root detectado:",
    rol
  );

  const permitido =
    rol === "platform_admin";

  diagnostico(
    "Resultado validación Root:",
    permitido
  );

  return permitido;
}

async function validarCliente(
  supabase,
  usuario
) {
  if (!usuarioAuthHabilitado(usuario)) {
    return false;
  }

  const {
    data: membresia,
    error: errorMembresia,
  } = await supabase
    .from("company_members")
    .select(
      "company_id, role, status, pos_only"
    )
    .eq("user_id", usuario.id)
    .eq("status", "active")
    .maybeSingle();

  if (errorMembresia) {
    diagnostico(
      "Error al consultar membresía:",
      errorMembresia.message
    );

    return false;
  }

  if (!membresia) {
    diagnostico(
      "Validación Cliente:",
      "sin membresía activa"
    );

    return false;
  }

  diagnostico(
    "Rol de membresía:",
    membresia.role
  );

  if (
    !ROLES_CLIENTE_PERMITIDOS.has(
      membresia.role
    )
  ) {
    diagnostico(
      "Validación Cliente:",
      "rol no permitido"
    );

    return false;
  }

  const {
    data: empresa,
    error: errorEmpresa,
  } = await supabase
    .from("companies")
    .select(
      "id, status, relationship_type"
    )
    .eq("id", membresia.company_id)
    .eq("status", "active")
    .eq(
      "relationship_type",
      "client"
    )
    .maybeSingle();

  if (errorEmpresa) {
    diagnostico(
      "Error al consultar empresa:",
      errorEmpresa.message
    );

    return false;
  }

  if (!empresa) {
    diagnostico(
      "Validación Cliente:",
      "empresa no activa o no es cliente"
    );

    return false;
  }

  diagnostico(
    "Empresa habilitada:",
    empresa.id
  );

  const hoy = new Date()
    .toISOString()
    .slice(0, 10);

  const {
    data: contratos,
    error: errorContratos,
  } = await supabase
    .from("company_contracts")
    .select(
      "id, status, starts_on, ends_on"
    )
    .eq("company_id", empresa.id)
    .eq("status", "active")
    .lte("starts_on", hoy)
    .gte("ends_on", hoy)
    .limit(1);

  if (errorContratos) {
    diagnostico(
      "Error al consultar contratos:",
      errorContratos.message
    );

    return false;
  }

  const contratoVigente =
    Array.isArray(contratos) &&
    contratos.length > 0;

  diagnostico(
    "Contrato activo y vigente:",
    contratoVigente
  );

  return contratoVigente;
}

function respuestaGenerica() {
  return NextResponse.json(
    {
      ok: true,
      mensaje: RESPUESTA_GENERICA,
    },
    {
      status: 200,
    }
  );
}

export async function POST(request) {
  diagnostico(
    "================================"
  );

  diagnostico(
    "Inicio de solicitud:",
    new Date().toISOString()
  );

  try {
    const portal = obtenerPortal(request);

    diagnostico(
      "Portal identificado:",
      portal
    );

    const redirectTo =
      construirRedirectTo(portal);

    diagnostico(
      "URL de retorno:",
      redirectTo
    );

    if (!portal || !redirectTo) {
      diagnostico(
        "Solicitud descartada:",
        "portal no permitido"
      );

      return respuestaGenerica();
    }

    const body = await request
      .json()
      .catch(() => ({}));

    const email = normalizarEmail(
      body?.email
    );

    diagnostico(
      "Correo solicitado:",
      email || "vacío"
    );

    if (
      !email ||
      email.length > 254
    ) {
      diagnostico(
        "Solicitud descartada:",
        "correo inválido"
      );

      return respuestaGenerica();
    }

    const supabase =
      getSupabaseAdminClient();

    const usuario =
      await buscarUsuarioPorEmail(
        supabase,
        email
      );

    const elegible =
      portal === "root"
        ? validarRoot(usuario)
        : await validarCliente(
            supabase,
            usuario
          );

    diagnostico(
      "Resultado de elegibilidad:",
      elegible
    );

    if (!elegible) {
      diagnostico(
        "Correo no enviado:",
        "cuenta no elegible"
      );

      return respuestaGenerica();
    }

    diagnostico(
      "Generando enlace de recuperación para:",
      email
    );

    const {
      data,
      error: errorGeneracion,
    } =
      await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo,
        },
      });

    if (errorGeneracion) {
      console.error(
        "[RECUPERAR CONTRASEÑA] Error de generación:",
        errorGeneracion
      );

      return respuestaGenerica();
    }

    const enlaceRecuperacion =
      data?.properties?.action_link;

    if (!enlaceRecuperacion) {
      console.error(
        "[RECUPERAR CONTRASEÑA] Supabase no generó el enlace."
      );

      return respuestaGenerica();
    }

    const enlaceSeguro = escaparHtml(
      enlaceRecuperacion
    );

    await enviarCorreoMicrosoft({
      para: email,
      asunto:
        "Recuperación de contraseña | ParkFacil",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#172033;line-height:1.6">
          <h1 style="color:#041E42;font-size:28px;">
            Recuperar contraseña
          </h1>

          <p>
            Recibimos una solicitud para crear una nueva contraseña
            para su cuenta ParkFacil.
          </p>

          <p style="margin:30px 0;">
            <a
              href="${enlaceSeguro}"
              style="display:inline-block;background:#3150D8;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:bold;"
            >
              Crear nueva contraseña
            </a>
          </p>

          <p>
            Si usted no realizó esta solicitud, ignore este mensaje.
          </p>

          <p style="font-size:13px;color:#64748b;">
            Por seguridad, este enlace es personal y tiene una
            vigencia limitada.
          </p>
        </div>
      `,
      texto:
        `Recupere su contraseña utilizando este enlace: ` +
        enlaceRecuperacion,
    });

    diagnostico(
      "Resultado del envío:",
      "Correo enviado mediante Microsoft 365"
    );

    return respuestaGenerica();
  } catch (error) {
    console.error(
      "[RECUPERAR CONTRASEÑA] Error interno:",
      error
    );

    return respuestaGenerica();
  } finally {
    diagnostico(
      "Fin de solicitud"
    );

    diagnostico(
      "================================"
    );
  }
}