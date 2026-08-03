import EstacionamientoDetalleAdmin from "@/components/estacionamientos/EstacionamientoDetalleAdmin";
import { getCompanyPageData } from "@/lib/companiesServer";
import { getParkingPageData } from "@/lib/estacionamientosServer";
import { getStructurePageData } from "@/lib/parkingStructureServer";

const legacyIdentifiers = {
  "p-001": "PC-001",
  "p-002": "PN-002",
  "p-003": "PS-003",
};

export default async function EstacionamientoDetallePage({ params }) {
  const { id } = await params;
  const parking = await getParkingPageData(legacyIdentifiers[id] || id);
  const [structure, company] = parking
    ? await Promise.all([getStructurePageData(parking), getCompanyPageData(parking.companyId)])
    : [null, null];

  return <EstacionamientoDetalleAdmin parking={parking} structure={structure} company={company} />;
}
