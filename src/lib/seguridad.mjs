export function getSecurityModules() {
  return [
    {
      title: "Controles de acceso",
      description: "Gestión de credenciales, roles y permisos asociados a la operación.",
      state: "Diseño base",
      icon: "ShieldCheck",
    },
    {
      title: "Organizaciones",
      description: "Vista institucional de estructuras, áreas y responsables.",
      state: "En revisión",
      icon: "Building2",
    },
    {
      title: "Auditoría",
      description: "Registro de eventos y seguimiento de cambios en la plataforma.",
      state: "Planeado",
      icon: "FileSearch",
    },
  ];
}

export function getOrganizationProfiles() {
  return [
    {
      name: "Operación Central",
      scope: "Sede principal",
      status: "Activo",
      coverage: "98%",
    },
    {
      name: "Administración",
      scope: "Back office",
      status: "En revisión",
      coverage: "84%",
    },
    {
      name: "Seguridad y Respuesta",
      scope: "Monitoreo y incidentes",
      status: "Planeado",
      coverage: "72%",
    },
  ];
}
