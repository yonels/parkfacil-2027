// Only the origin-restricted native channel can retain credentials. No browser storage.
let sequence = 0;
const clients = new WeakMap();
export function getPosCredentialClient(channel) {
  if (!channel || typeof channel.postMessage !== "function") return null;
  if (clients.has(channel)) return clients.get(channel);
  const pending = new Map();
  channel.onmessage = (event) => {
    let result;
    try { result = JSON.parse(event.data); } catch { return; }
    const request = pending.get(result.id);
    if (!request) return;
    pending.delete(result.id);
    clearTimeout(request.timer);
    if (result.ok) request.resolve(result.data);
    else request.reject(new Error("No fue posible acceder a los datos guardados en este POS."));
  };
  const client = (action, data = {}) => new Promise((resolve, reject) => {
    const id = `pos-${++sequence}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("El POS no respondió al guardar los datos de acceso."));
    }, 4000);
    pending.set(id, { resolve, reject, timer });
    try { channel.postMessage(JSON.stringify({ ...data, action, id })); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error("Los datos de acceso no pudieron guardarse en este POS.")); }
  });
  clients.set(channel, client);
  return client;
}
