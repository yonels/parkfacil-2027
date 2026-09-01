// Núcleo puro de KPIs de fiscalización para la Administración On Street
// (§20 del brief). Sin "server-only" ni imports "@/..." para poder
// testearlo en directo con node --test. onStreetAdminInspectionsRepository.js
// es el envoltorio real (Supabase, aislamiento por empresa) que lo invoca.
export function computeInspectionKpis(rows) {
  const distinctPlates = new Set(rows.map((r) => r.license_plate_normalized));
  const plateCounts = new Map();
  for (const r of rows) plateCounts.set(r.license_plate_normalized, (plateCounts.get(r.license_plate_normalized) || 0) + 1);
  return {
    total: rows.length,
    overstay: rows.filter((r) => r.inspection_type === "OVERSTAY").length,
    noSession: rows.filter((r) => r.inspection_type === "NO_SESSION").length,
    other: rows.filter((r) => r.inspection_type === "OTHER").length,
    distinctPlates: distinctPlates.size,
    reincidences: [...plateCounts.values()].filter((count) => count > 1).length,
    smsSent: rows.filter((r) => r.sms_status === "SENT").length,
    smsFailed: rows.filter((r) => r.sms_status === "FAILED").length,
  };
}

export function emptyInspectionKpis() {
  return { total: 0, overstay: 0, noSession: 0, other: 0, distinctPlates: 0, reincidences: 0, smsSent: 0, smsFailed: 0 };
}
