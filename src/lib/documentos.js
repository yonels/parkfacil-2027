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
    slug: "stage00-foundation",
    title: "Stage 00 - Foundation",
    description: "Informe de entrega de la etapa de fundación.",
    file: "docs/Stage00-Foundation.md",
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
