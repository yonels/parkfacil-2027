function normalizeString(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function buildObjectGraph(definitions) {
  const byId = new Map();
  const parentById = new Map();

  definitions.forEach((definition) => {
    if (byId.has(definition.id)) {
      throw new Error(`Duplicate object id: ${definition.id}`);
    }

    byId.set(definition.id, {
      ...definition,
      children: [],
      relations: {
        parentId: definition.parent || null,
        childIds: [],
      },
    });
    parentById.set(definition.id, definition.parent || null);
  });

  byId.forEach((objectNode) => {
    if (!objectNode.parent) return;
    const parentNode = byId.get(objectNode.parent);
    if (!parentNode) return;

    parentNode.children.push(objectNode.id);
    parentNode.relations.childIds.push(objectNode.id);
  });

  const roots = [];
  byId.forEach((objectNode) => {
    if (!objectNode.visible) return;
    const hasValidParent = objectNode.parent && byId.has(objectNode.parent);
    if (!hasValidParent) roots.push(objectNode.id);
  });

  const rows = [];
  function visit(id, depth) {
    const objectNode = byId.get(id);
    if (!objectNode || !objectNode.visible) return;
    rows.push({ id, depth, node: objectNode });
    objectNode.children.forEach((childId) => visit(childId, depth + 1));
  }

  roots.forEach((rootId) => visit(rootId, 0));

  const defaultExpandedIds = definitions.filter((item) => item.expanded).map((item) => item.id);

  return {
    byId,
    parentById,
    roots,
    rows,
    defaultExpandedIds,
  };
}

export function getAncestorChain(nodeId, parentById) {
  const chain = [];
  let current = parentById.get(nodeId);
  while (current) {
    chain.push(current);
    current = parentById.get(current);
  }
  return chain;
}

export function buildBreadcrumb(nodeId, graph) {
  const list = [];
  let current = nodeId;
  while (current) {
    const objectNode = graph.byId.get(current);
    if (!objectNode) break;
    list.push(objectNode.label);
    current = graph.parentById.get(current);
  }
  return list.reverse();
}

export function searchObjects(query, graph, limit = 14) {
  const term = normalizeString(query.trim());
  if (!term) return [];

  const matches = [];
  graph.byId.forEach((objectNode) => {
    if (!objectNode.visible || !objectNode.searchable) return;

    const pool = [
      objectNode.label,
      objectNode.description,
      objectNode.type,
      objectNode.status,
      objectNode.metadata?.secondary,
      ...Object.keys(objectNode.properties || {}),
      ...Object.values(objectNode.properties || {}),
      ...(objectNode.metadata?.searchableTags || []),
    ]
      .map((entry) => normalizeString(entry))
      .join(" ");

    if (!pool.includes(term)) return;

    matches.push({
      id: objectNode.id,
      label: objectNode.label,
      type: objectNode.type,
      hint: objectNode.description || objectNode.type,
    });
  });

  return matches.slice(0, limit);
}

export function classifyNode(objectNode) {
  const categoryFromMetadata = objectNode?.metadata?.category;
  if (categoryFromMetadata) return categoryFromMetadata;

  if (objectNode?.type === "empresa") return "EMPRESA";
  if (objectNode?.type === "estacionamiento") return "ESTACIONAMIENTO";
  if (objectNode?.type === "activacion") return "ACCION";
  return "OBJETO";
}
