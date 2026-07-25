import { promises as fs } from "fs";
import path from "path";

const documentos = [
  {
    slug: "master-project-document",
    title: "Master Project Document",
    description: "Resumen del proyecto y estado de la fundación.",
    file: "docs/MasterProjectDocument.md",
  },
  {
    slug: "requirements",
    title: "Requirements",
    description: "Requisitos y restricciones de la etapa 00.",
    file: "docs/Requirements.md",
  },
  {
    slug: "architecture-decision-log",
    title: "Architecture Decision Log",
    description: "Decisiones de arquitectura iniciales.",
    file: "docs/ArchitectureDecisionLog.md",
  },
  {
    slug: "changelog",
    title: "Changelog",
    description: "Historial de versiones del proyecto.",
    file: "CHANGELOG.md",
  },
  {
    slug: "stage-00-foundation",
    title: "Stage 00 - Foundation",
    description: "Informe de entrega de la etapa de fundación.",
    file: "docs/Stage00-Foundation.md",
  },
  {
    slug: "codex-document-template",
    title: "Documentos Codex",
    description: "Plantilla base para documentos Codex.",
    file: "docs/templates/CodexDocumentTemplate.md",
  },
  {
    slug: "stage-01-framework-base",
    title: "Stage 01 - Framework Base",
    description: "Informe de implementación del framework base visual.",
    file: "docs/Stage01-Framework-Base.md",
  },
  {
    slug: "stage-03-estacionamientos",
    title: "Stage 03 - Estacionamientos",
    description: "Base visual y estructural del módulo de estacionamientos.",
    file: "docs/Stage03-Estacionamientos.md",
  },
  {
    slug: "stage-04-dispositivos",
    title: "Stage 04 - Dispositivos",
    description: "Base visual y estructural del módulo de dispositivos.",
    file: "docs/Stage04-Dispositivos.md",
  },
  {
    slug: "stage-05-empresas",
    title: "Stage 05 - Empresas",
    description: "Base visual y estructural del módulo de empresas.",
    file: "docs/Stage05-Empresas.md",
  },
  {
    slug: "stage-06-usuarios",
    title: "Stage 06 - Usuarios",
    description: "Base visual y estructural del módulo de usuarios y perfiles.",
    file: "docs/Stage06-Usuarios.md",
  },
];

export function getDocumentos() {
  return documentos;
}

export async function getDocumento(slug) {
  const documento = documentos.find((doc) => doc.slug === slug);

  if (!documento) {
    return null;
  }

  const ruta = path.join(process.cwd(), documento.file);
  const contenido = await fs.readFile(ruta, "utf8");

  return {
    ...documento,
    contenido,
  };
}
