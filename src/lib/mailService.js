/******************************************************************
 * PARKFACIL CRM
 *---------------------------------------------------------------
 * MÓDULO    : CORREO
 * SERVICIO  : MICROSOFT GRAPH
 * ARCHIVO   : src/lib/mailService.js
 *---------------------------------------------------------------
 * DESCRIPCIÓN:
 * Obtiene un token de aplicación desde Microsoft Entra y envía
 * correos corporativos mediante Microsoft Graph.
 ******************************************************************/

 const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
 const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
 
 /**
  * Comprueba que las variables necesarias estén configuradas.
  */
export function obtenerConfiguracionMicrosoft() {
   const tenantId = process.env.MICROSOFT_TENANT_ID;
   const clientId = process.env.MICROSOFT_CLIENT_ID;
   const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
   const senderEmail = process.env.MICROSOFT_SENDER_EMAIL;
 
   const variablesFaltantes = [];
 
   if (!tenantId) {
     variablesFaltantes.push("MICROSOFT_TENANT_ID");
   }
 
   if (!clientId) {
     variablesFaltantes.push("MICROSOFT_CLIENT_ID");
   }
 
   if (!clientSecret) {
     variablesFaltantes.push("MICROSOFT_CLIENT_SECRET");
   }
 
   if (!senderEmail) {
     variablesFaltantes.push("MICROSOFT_SENDER_EMAIL");
   }
 
   if (variablesFaltantes.length > 0) {
     throw new Error(
       `Faltan variables de Microsoft Graph: ${variablesFaltantes.join(
         ", "
       )}`
     );
   }
 
   return {
     tenantId,
     clientId,
     clientSecret,
     senderEmail,
   };
 }
 
 /**
  * Convierte un valor individual o una lista en destinatarios Graph.
  */
 function construirDestinatarios(valor) {
   const valores = Array.isArray(valor)
     ? valor
     : typeof valor === "string"
       ? valor.split(",")
       : [];
 
   return valores
     .map((correo) => String(correo).trim())
     .filter(Boolean)
     .map((correo) => ({
       emailAddress: {
         address: correo,
       },
     }));
 }
 
 /**
  * Obtiene un token OAuth 2.0 para Microsoft Graph.
  */
export async function obtenerTokenMicrosoftGraph() {
   const {
     tenantId,
     clientId,
     clientSecret,
   } = obtenerConfiguracionMicrosoft();
 
   const tokenUrl =
     `https://login.microsoftonline.com/` +
     `${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
 
   const cuerpo = new URLSearchParams({
     client_id: clientId,
     client_secret: clientSecret,
     scope: GRAPH_SCOPE,
     grant_type: "client_credentials",
   });
 
   const respuesta = await fetch(tokenUrl, {
     method: "POST",
     headers: {
       "Content-Type": "application/x-www-form-urlencoded",
     },
     body: cuerpo.toString(),
     cache: "no-store",
   });
 
   const resultado = await respuesta.json();
 
   if (!respuesta.ok || !resultado.access_token) {
     const detalle =
       resultado?.error_description ||
       resultado?.error ||
       "Microsoft no entregó un token de acceso.";
 
     throw new Error(
       `No fue posible autenticar Microsoft Graph: ${detalle}`
     );
   }
 
   return resultado.access_token;
 }
 
 /**
  * Envía un correo utilizando el buzón corporativo configurado.
  *
  * @param {Object} datos
  * @param {string|string[]} datos.para
  * @param {string|string[]} [datos.cc]
  * @param {string|string[]} [datos.bcc]
  * @param {string} datos.asunto
  * @param {string} datos.html
  * @param {string} [datos.texto]
  * @param {boolean} [datos.guardarEnviados]
  */
 export async function enviarCorreoMicrosoft({
   para,
   cc = [],
   bcc = [],
   asunto,
   html,
   texto = "",
   guardarEnviados = true,
 }) {
   const destinatarios = construirDestinatarios(para);
 
   if (destinatarios.length === 0) {
     throw new Error(
       "Debe indicar al menos un destinatario válido."
     );
   }
 
   if (!asunto || !String(asunto).trim()) {
     throw new Error("El asunto del correo es obligatorio.");
   }
 
   if (!html && !texto) {
     throw new Error(
       "El correo debe contener contenido HTML o texto."
     );
   }
 
   const { senderEmail } =
     obtenerConfiguracionMicrosoft();
 
   const accessToken =
     await obtenerTokenMicrosoftGraph();
 
   const cuerpoCorreo = html || texto;
 
   const endpoint =
     `${GRAPH_BASE_URL}/users/` +
     `${encodeURIComponent(senderEmail)}/sendMail`;
 
   const respuesta = await fetch(endpoint, {
     method: "POST",
     headers: {
       Authorization: `Bearer ${accessToken}`,
       "Content-Type": "application/json",
     },
     body: JSON.stringify({
       message: {
         subject: String(asunto).trim(),
         body: {
           contentType: html ? "HTML" : "Text",
           content: cuerpoCorreo,
         },
         toRecipients: destinatarios,
         ccRecipients: construirDestinatarios(cc),
         bccRecipients: construirDestinatarios(bcc),
       },
       saveToSentItems: guardarEnviados,
     }),
     cache: "no-store",
   });
 
   if (!respuesta.ok) {
     const textoError = await respuesta.text();
 
     let detalle = textoError;
 
     try {
       const errorGraph = JSON.parse(textoError);
 
       detalle =
         errorGraph?.error?.message ||
         errorGraph?.error?.code ||
         textoError;
     } catch {
       // Mantiene el texto original cuando no es JSON.
     }
 
     throw new Error(
       `Microsoft Graph rechazó el envío: ${detalle}`
     );
   }
 
   return {
     ok: true,
     remitente: senderEmail,
     destinatarios: destinatarios.map(
       (destinatario) =>
         destinatario.emailAddress.address
     ),
   };
 }

export async function obtenerMensajeMicrosoftGraph(
  messageId
) {
  const idSeguro = String(messageId || "").trim();

  if (!idSeguro) {
    throw new Error("El identificador del mensaje es obligatorio.");
  }

  const { senderEmail } = obtenerConfiguracionMicrosoft();
  const accessToken = await obtenerTokenMicrosoftGraph();

  const endpoint =
    `${GRAPH_BASE_URL}/users/` +
    `${encodeURIComponent(senderEmail)}/messages/` +
    `${encodeURIComponent(idSeguro)}?` +
    `$select=id,subject,body,bodyPreview,from,receivedDateTime,conversationId,internetMessageId`;

  const respuesta = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const resultado = await respuesta.json();

  if (!respuesta.ok || !resultado?.id) {
    const detalle =
      resultado?.error?.message ||
      resultado?.error?.code ||
      "Microsoft Graph no entregó el mensaje solicitado.";

    throw new Error(detalle);
  }

  return resultado;
}