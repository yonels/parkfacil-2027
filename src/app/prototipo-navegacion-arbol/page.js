"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Folder,
  FolderCog,
  Search,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { createParkFacilObjectModel, ICON_REGISTRY } from "./objectModel";
import {
  buildBreadcrumb,
  buildObjectGraph,
  classifyNode,
  getAncestorChain,
  searchObjects,
} from "./treeBuilder";

const STORAGE_KEY = "parkfacil-object-explorer-prototype-v6";

const STATUS_STYLES = {
  activa: "bg-emerald-500",
  activo: "bg-emerald-500",
  operativa: "bg-emerald-500",
  operativo: "bg-emerald-500",
  ok: "bg-emerald-500",
  online: "bg-emerald-500",
  abierta: "bg-emerald-500",
  alerta: "bg-amber-500",
  pendiente: "bg-amber-500",
  programado: "bg-slate-400",
  offline: "bg-rose-500",
  demo: "bg-slate-400",
  info: "bg-slate-400",
};

const SECTION_LABELS = {
  identity: "IDENTIDAD",
  location: "UBICACION",
  assignment: "ASIGNACION",
  commercial: "PLAN COMERCIAL",
  operational: "ESTADO OPERACIONAL",
};

const FOLDER_COLOR = "#F2B233";
const OBJECT_ICON_COLOR = "#475569";

function isContainerNode(node) {
  return node?.metadata?.category === "CONTENEDOR";
}

function getDisplayIcon(node) {
  if (isContainerNode(node)) return Folder;
  return ICON_REGISTRY[node?.icon] || FolderCog;
}

function getIconColor(node) {
  return isContainerNode(node) ? FOLDER_COLOR : OBJECT_ICON_COLOR;
}

function ActionButtons({ actions, selectedAction, onSelectAction }) {
  if (!actions?.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => onSelectAction(action)}
          className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
            selectedAction === action
              ? "border-[#0A64DA] bg-[#EAF2FF] text-[#0A64DA]"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          {action}
        </button>
      ))}
    </div>
  );
}

function CompactFieldGrid({ entries }) {
  return (
    <div className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
      {entries.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-2 border-b border-slate-100 py-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
          <span className="min-w-0 truncate text-sm font-semibold text-[#0B1A34]">{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

function SectionBlock({ title, sectionKey, collapsedSections, onToggle, children }) {
  const isCollapsed = Boolean(collapsedSections[sectionKey]);
  return (
    <section className="border-b border-slate-200 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">{title}</span>
        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
      </button>
      {isCollapsed ? null : <div className="mt-2">{children}</div>}
    </section>
  );
}

export default function PrototipoNavegacionArbolPage() {
  const definitions = useMemo(() => createParkFacilObjectModel(), []);
  const graph = useMemo(() => buildObjectGraph(definitions), [definitions]);

  const defaultSelectedNodeId = graph.byId.has("turno-manana")
    ? "turno-manana"
    : graph.roots[0] || "";
  const defaultExpandedNodeIds = graph.defaultExpandedIds;

  const [viewMode, setViewMode] = useState("new");
  const [search, setSearch] = useState("");
  const [navClicks, setNavClicks] = useState(0);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(defaultSelectedNodeId);
  const [expandedNodes, setExpandedNodes] = useState(() => new Set(defaultExpandedNodeIds));
  const [activeDemoActionByNode, setActiveDemoActionByNode] = useState({});
  const [collapsedSections, setCollapsedSections] = useState({});
  const explorerLayoutRef = useRef(null);
  const detailScrollRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      selectedNodeId,
      treeCollapsed,
      expandedNodes: [...expandedNodes],
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [selectedNodeId, treeCollapsed, expandedNodes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const element = explorerLayoutRef.current;
    if (!element) return;

    const updateHeight = () => {
      const top = element.getBoundingClientRect().top;
      const available = Math.floor(window.innerHeight - top - 12);
      const compactViewport = window.innerHeight <= 700;
      const dynamicBottomPadding = compactViewport ? "4.5rem" : "1.5rem";

      element.style.height = `${Math.max(520, available)}px`;

      if (detailScrollRef.current) {
        detailScrollRef.current.style.paddingBottom = dynamicBottomPadding;
        detailScrollRef.current.style.scrollPaddingBottom = dynamicBottomPadding;
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  const selectedNode = graph.byId.get(selectedNodeId) || graph.byId.get(graph.roots[0]);

  const visibleRows = useMemo(() => {
    if (treeCollapsed) {
      return graph.rows.filter((row) => row.depth === 0);
    }

    return graph.rows.filter((row) => {
      let currentParent = graph.parentById.get(row.id);
      while (currentParent) {
        if (!expandedNodes.has(currentParent)) return false;
        currentParent = graph.parentById.get(currentParent);
      }
      return true;
    });
  }, [graph, expandedNodes, treeCollapsed]);

  const searchResults = useMemo(() => searchObjects(search, graph), [search, graph]);

  function addNavClick() {
    setNavClicks((value) => value + 1);
  }

  function toggleNode(id) {
    setExpandedNodes((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    addNavClick();
  }

  function expandParents(nodeId) {
    const chain = getAncestorChain(nodeId, graph.parentById);
    setExpandedNodes((current) => new Set([...current, ...chain]));
  }

  function selectNode(nodeId) {
    const sourceNode = graph.byId.get(nodeId);
    if (!sourceNode) return;

    const resolvedNodeId = sourceNode.metadata?.targetObjectId && graph.byId.has(sourceNode.metadata.targetObjectId)
      ? sourceNode.metadata.targetObjectId
      : nodeId;

    expandParents(resolvedNodeId);
    setSelectedNodeId(resolvedNodeId);
    addNavClick();
  }

  function onSearchKeyDown(event) {
    if (event.key !== "Enter" || !searchResults.length) return;
    selectNode(searchResults[0].id);
  }

  const breadcrumb = useMemo(() => buildBreadcrumb(selectedNode?.id, graph), [selectedNode, graph]);

  function statusDot(status) {
    return STATUS_STYLES[String(status || "").toLowerCase()] || "bg-slate-400";
  }

  function renderNodePanel() {
    if (!selectedNode) return null;

    const NodeIcon = getDisplayIcon(selectedNode);
    const nodeIconColor = getIconColor(selectedNode);
    const selectedAction = activeDemoActionByNode[selectedNode.id];
    const relationships = selectedNode.relationships || [];
    const properties = selectedNode.properties || {};
    const propertySections = Object.entries(properties).filter(([, values]) => values && typeof values === "object" && !Array.isArray(values));
    const fallbackFields = Object.entries(properties).filter(([, values]) => !values || typeof values !== "object" || Array.isArray(values));
    const relationParent = selectedNode.parent ? graph.byId.get(selectedNode.parent) : null;
    const relationChildren = selectedNode.children.map((childId) => graph.byId.get(childId)).filter(Boolean);
    const sectionPrefix = selectedNode.id;

    const toggleSection = (sectionName) => {
      const key = `${sectionPrefix}:${sectionName}`;
      setCollapsedSections((current) => ({ ...current, [key]: !current[key] }));
    };

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="z-20 shrink-0 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{classifyNode(selectedNode)}</p>
              <h2 className="mt-1 flex items-center gap-2 text-xl font-black text-[#0B1A34]">
                <NodeIcon className="h-4 w-4" style={{ color: nodeIconColor }} />
                <span>{selectedNode.label}</span>
              </h2>
              <p className="mt-1 text-xs text-slate-600">{selectedNode.description || selectedNode.type}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700">Tipo: {selectedNode.type}</span>
              <span className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700">
                Estado: <span className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${statusDot(selectedNode.status)}`} />{selectedNode.status}</span>
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#0A64DA]">
            {breadcrumb.map((item, index) => (
              <div key={`${item}-${index}`} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = graph.rows.find((row) => row.node.label === item);
                    if (target) selectNode(target.id);
                  }}
                  className="rounded px-1.5 py-0.5 font-semibold hover:underline"
                >
                  {item}
                </button>
                {index < breadcrumb.length - 1 ? <span className="text-slate-400">/</span> : null}
              </div>
            ))}
          </div>

          <ActionButtons
            actions={selectedNode.actions}
            selectedAction={selectedAction}
            onSelectAction={(action) => setActiveDemoActionByNode((current) => ({ ...current, [selectedNode.id]: action }))}
          />
        </header>

        <div ref={detailScrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {propertySections.map(([sectionName, values]) => {
            const sectionEntries = Object.entries(values || {});
            if (!sectionEntries.length) return null;
            const sectionId = `${sectionPrefix}:${sectionName}`;
            return (
              <SectionBlock
                key={sectionName}
                title={SECTION_LABELS[sectionName] || sectionName.toUpperCase()}
                sectionKey={sectionId}
                collapsedSections={collapsedSections}
                onToggle={() => toggleSection(sectionName)}
              >
                <CompactFieldGrid entries={sectionEntries} />
              </SectionBlock>
            );
          })}

          {fallbackFields.length ? (
            <SectionBlock
              title="DETALLES"
              sectionKey={`${sectionPrefix}:detalles`}
              collapsedSections={collapsedSections}
              onToggle={() => toggleSection("detalles")}
            >
              <CompactFieldGrid entries={fallbackFields} />
            </SectionBlock>
          ) : null}

          <SectionBlock
            title="RELACIONES"
            sectionKey={`${sectionPrefix}:relaciones`}
            collapsedSections={collapsedSections}
            onToggle={() => toggleSection("relaciones")}
          >
            {relationships.length ? (
              <div className="flex flex-wrap gap-2">
                {relationships.map((item) => {
                  const target = graph.byId.get(item.targetObjectId);
                  if (!target) return null;
                  return (
                    <button
                      key={`${item.type}-${item.targetObjectId}`}
                      type="button"
                      onClick={() => selectNode(item.targetObjectId)}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-[#0A64DA] hover:text-[#0A64DA]"
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Sin relaciones configuradas.</p>
            )}
          </SectionBlock>

          <SectionBlock
            title="HISTORIAL"
            sectionKey={`${sectionPrefix}:historial`}
            collapsedSections={collapsedSections}
            onToggle={() => toggleSection("historial")}
          >
            <CompactFieldGrid
              entries={[
                ["Ultima modificacion", selectedNode.metadata?.updatedAt || "N/A"],
                ["Pertenece a", relationParent ? relationParent.label : "(raiz)"],
                ["Hijos", relationChildren.length ? relationChildren.map((item) => item.label).join(", ") : "Sin hijos"],
              ]}
            />
          </SectionBlock>

          <SectionBlock
            title="OBSERVACIONES"
            sectionKey={`${sectionPrefix}:observaciones`}
            collapsedSections={collapsedSections}
            onToggle={() => toggleSection("observaciones")}
          >
            <p className="text-xs text-slate-600">Panel construido desde Object Model sin duplicar objetos. La seleccion actual mantiene el contexto del arbol.</p>
          </SectionBlock>
        </div>
      </div>
    );
  }

  return (
    <AppShell title="Prototipo navegacion arbol" description="Object Explorer experimental">
      <div ref={explorerLayoutRef} className="h-[calc(100dvh-210px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Prototipo aislado</p>
              <h1 className="text-sm font-black text-[#0B1A34]">Object Explorer | Iteracion 9 | Sistema unificado de iconografia y color</h1>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("new")}
                className={`rounded-md border px-2.5 py-1 font-bold transition ${
                  viewMode === "new" ? "border-[#0A64DA] bg-[#EAF2FF] text-[#0A64DA]" : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                Explorer
              </button>
              <button
                type="button"
                onClick={() => setViewMode("current")}
                className={`rounded-md border px-2.5 py-1 font-bold transition ${
                  viewMode === "current" ? "border-[#0A64DA] bg-[#EAF2FF] text-[#0A64DA]" : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                Referencia
              </button>
              <span className="rounded-md border border-slate-200 bg-white px-2 py-1 font-bold text-slate-700">Clics: {navClicks}</span>
            </div>
          </div>
        </header>

        {viewMode === "current" ? (
          <div className="p-5">
            <h2 className="text-lg font-black text-[#0B1A34]">Referencia actual</h2>
            <p className="mt-2 text-sm text-slate-600">La interfaz visual se mantiene; la arquitectura interna ahora es completamente declarativa por Object Model.</p>
          </div>
        ) : (
          <div className="flex h-[calc(100%-53px)] min-h-0 overflow-hidden">
            <aside className="h-full w-[320px] shrink-0 overflow-hidden border-r border-slate-200 bg-white">
              <div className="border-b border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-[#0B1A34]">Object Explorer</p>
                  <button
                    type="button"
                    onClick={() => setTreeCollapsed((value) => !value)}
                    className="rounded-md border border-slate-200 bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100"
                    title={treeCollapsed ? "Expandir" : "Colapsar"}
                  >
                    {treeCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                  </button>
                </div>

                {!treeCollapsed ? (
                  <label className="mt-3 block">
                    <span className="sr-only">Buscar</span>
                    <span className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-500">
                      <Search className="h-4 w-4" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={onSearchKeyDown}
                        placeholder="Buscar objetos"
                        className="w-full bg-transparent text-sm text-[#0B1A34] outline-none placeholder:text-slate-400"
                      />
                    </span>
                  </label>
                ) : null}

                {!treeCollapsed && searchResults.length ? (
                  <div className="mt-2 max-h-44 overflow-auto rounded-md border border-slate-200 bg-white p-1">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => selectNode(result.id)}
                        className="mb-1 block w-full rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-[#EAF2FF]"
                      >
                        <strong>{result.label}</strong>
                        <p className="text-[11px] text-slate-500">{result.hint}</p>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="h-[calc(100%-122px)] overflow-y-auto p-2">
                {visibleRows.map(({ id, depth, node }) => {
                  const hasChildren = node.children.length > 0;
                  const isExpanded = expandedNodes.has(id);
                  const isSelected = selectedNodeId === id;
                  const Icon = getDisplayIcon(node);
                  const iconColor = getIconColor(node);

                  return (
                    <div key={id} className="mb-0.5" style={{ paddingLeft: `${depth * 12}px` }}>
                      <div
                        className={`flex min-h-7.5 items-center gap-1 rounded px-1 py-1 text-xs transition ${
                          isSelected ? "bg-[#D9E9FF] text-[#0A64DA]" : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={() => toggleNode(id)}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-200"
                          >
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>
                        ) : (
                          <span className="w-[14px]" />
                        )}

                        <button
                          type="button"
                          onClick={() => selectNode(id)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="mr-0.5 h-4 border-l border-slate-200" />
                            <Icon className="h-4 w-4 shrink-0" style={{ color: iconColor }} />
                            <span className="block min-w-0 truncate leading-4">{node.label}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDot(node.status)}`} />
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>

            <section className="h-full min-w-0 flex-1 overflow-hidden bg-white">
              {renderNodePanel()}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
