import { unseal } from './contratacionProvision.mjs';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export async function deliverCredentials({ crm, id, key, send }) {
  const claimed = await crm.rpc('contratacion_delivery_claim', { p_id: id });
  if (claimed.error) return 'pendiente';
  if (!claimed.data.claimed) return claimed.data.state === 'sent' ? 'enviada' : 'pendiente';
  try {
    const accounts = unseal(claimed.data.credentials, key, id);
    const rows = accounts.map(a => `<tr><td>${escape(a.fullName)}</td><td>${escape(a.email)}</td><td>${escape(a.password)}</td></tr>`).join('');
    await send({
      para: claimed.data.email,
      asunto: 'Su cuenta ParkFacil ha sido creada',
      bcc: [],
      html: `<h1>Su cuenta ParkFacil ha sido creada</h1><p>Su cuenta de empresa en ParkFacil ha sido creada, junto con una cuenta de administrador y dos cuentas de operadores.</p><p>La cuenta y sus accesos permanecerán inactivos hasta que se complete el proceso contractual y se verifique el pago de la primera mensualidad o del contrato en su totalidad, según lo establecido en la cotización aceptada.</p><p>Una vez cumplidos estos requisitos, ParkFacil autorizará la activación y le enviará la confirmación correspondiente.</p><p>Administrador: https://cliente.parkfacilapp.cl/login. Operadores: acceso POS. Cambie las claves temporales al ingresar.</p><table><tr><th>Perfil</th><th>Usuario</th><th>Clave temporal</th></tr>${rows}</table><p>El estacionamiento está creado. Configure tarifa, horario y accesos antes de operar.</p>`,
    });
    const ack = await crm.rpc('contratacion_delivery_finish', { p_id: id, p_sent: true });
    if (ack.error) return 'pendiente';
    return 'enviada';
  } catch {
    await crm.rpc('contratacion_delivery_finish', { p_id: id, p_sent: false });
    return 'pendiente';
  }
}
