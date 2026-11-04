import ConveniosClient from "@/components/convenios/ConveniosClient";
import ConveniosSinDatos from "@/components/convenios/ConveniosSinDatos";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { canSeeDemoConvenios } from "@/lib/conveniosAccess.mjs";

export const metadata = {
  title: "Convenios y Beneficios | ParkFacil",
  description: "Convenios, descuentos y beneficios de la empresa.",
};

export default async function ConveniosPage() {
  const context = await getCurrentServerContext().catch(() => null);
  return canSeeDemoConvenios(context) ? <ConveniosClient /> : <ConveniosSinDatos />;
}
