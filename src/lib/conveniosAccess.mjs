// Convenios (SOL-2026-11-04-006): los datos de src/data/convenios.mjs son una demostración escrita
// en el código, sin empresa real asociada. Solo Root la ve; un cliente no tiene convenios propios.
export function canSeeDemoConvenios(context) {
  return context?.role === "platform_admin";
}
