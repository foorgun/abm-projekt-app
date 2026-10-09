import { useMemo, useRef, useState, type DragEvent } from "react";
import { Bot, ChevronDown, ChevronRight, File, FileImage, FileText, Folder, FolderOpen, Mail, Upload } from "lucide-react";
import { useToast } from "../../components/Toast";
import { Button, Checkbox, Dialog, EmptyState, Field, Input, Pill } from "../../components/ui";
import { fileKind } from "../../lib/files";
import { concretePath, displayPath } from "../../lib/folders";
import { ancestorPaths, buildFolderTree, findNode, type FolderNode } from "../../lib/folderTree";
import { formatBytes, formatDate } from "../../lib/format";
import { useData } from "../../lib/store";
import type { FolderTemplate, ProjectDocument } from "../../lib/types";

const KIND_ICON = { pdf: FileText, bild: FileImage, office: FileText, mail: Mail, datei: File };

interface PendingUpload {
  node: FolderNode;
  files: File[];
  date: string;
}

/**
 * Dokumente eines Projekts: Ordnerbaum aus der Vorlage (links) und Dateien des gewählten Ordners (rechts).
 * Upload per Drag-and-Drop auf einen Ordner, in die Ablagefläche oder per Button. Datumsordner fragen nach dem Datum.
 */
export function DocumentsTab({ projectId, templates, documents }: { projectId: string; templates: FolderTemplate[]; documents: ProjectDocument[] }) {
  const { mutate, today } = useData();
  const toast = useToast();
  const tree = useMemo(() => buildFolderTree(templates, documents), [templates, documents]);

  // Start: Ordner der zuletzt abgelegten Datei, sonst der erste Hauptordner
  const latest = useMemo(() => [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0], [documents]);
  const [selected, setSelected] = useState<string>(() => latest?.folderPath ?? tree[0]?.path ?? "");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(latest ? ancestorPaths(tree, latest.folderPath) : []));
  const [hideEmpty, setHideEmpty] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const node = findNode(tree, selected) ?? tree[0];
  const files = documents.filter((d) => d.folderPath === node?.path).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function toggle(path: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }

  function select(n: FolderNode) {
    setSelected(n.path);
    if (n.children.length) setExpanded((s) => new Set(s).add(n.path));
  }

  /** Startet den Upload; bei Datums-Sammelknoten erst nach dem Datum fragen. */
  function startUpload(target: FolderNode, list: File[]) {
    if (!list.length) return;
    if (target.dateTemplate) setPending({ node: target, files: list, date: today });
    else void upload(target.path, list);
  }

  async function upload(folderPath: string, list: File[]) {
    setBusy(true);
    let ok = 0;
    const errors: string[] = [];
    for (const f of list) {
      const res = await mutate((r) => r.uploadDocument({ projectId, folderPath, file: { name: f.name, size: f.size, type: f.type } }));
      if (res.ok) ok++;
      else errors.push(`${f.name}: ${res.error}`);
    }
    setBusy(false);
    if (ok) {
      setSelected(folderPath);
      setExpanded((s) => new Set([...s, ...ancestorPaths(buildFolderTree(templates, [...documents, { folderPath } as ProjectDocument]), folderPath)]));
      toast(`${ok} ${ok === 1 ? "Datei" : "Dateien"} in „${displayPath(folderPath).split(" › ").pop()}“ abgelegt`);
    }
    if (errors.length) toast(errors.join(" · "), "danger");
  }

  function onDragOver(e: DragEvent, path: string) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDropTarget(path);
  }

  function onDrop(e: DragEvent, target: FolderNode) {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    startUpload(target, Array.from(e.dataTransfer.files));
  }

  function renderNode(n: FolderNode, level: number) {
    if (hideEmpty && n.total === 0) return null;
    const open = expanded.has(n.path);
    const hasKids = n.children.length > 0;
    const Icon = open && hasKids ? FolderOpen : Folder;
    return (
      <li key={n.path} role="treeitem" aria-expanded={hasKids ? open : undefined} aria-selected={n.path === node?.path} aria-level={level + 1}>
        <div
          className="tree-row"
          data-selected={n.path === node?.path}
          data-empty={n.total === 0}
          data-drop={dropTarget === n.path}
          style={{ paddingLeft: `calc(${level} * 16px + 4px)` }}
          onDragOver={(e) => onDragOver(e, n.path)}
          onDragLeave={() => setDropTarget((t) => (t === n.path ? null : t))}
          onDrop={(e) => onDrop(e, n)}
        >
          <button type="button" className="tree-toggle" onClick={() => toggle(n.path)} tabIndex={-1} aria-hidden={!hasKids} disabled={!hasKids}>
            {hasKids ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}
          </button>
          <button
            type="button"
            className="tree-label"
            onClick={() => select(n)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" && hasKids && !open) toggle(n.path);
              if (e.key === "ArrowLeft" && open) toggle(n.path);
            }}
            title={n.description ?? undefined}
          >
            <Icon size={15} aria-hidden className="tree-icon" />
            <span className="tree-name">{n.label}</span>
            {n.dateTemplate && <span className="sr-only">(Datumsordner)</span>}
          </button>
          {n.total > 0 && (
            <span className="tree-count" title={n.own === n.total ? `${n.total} Dateien` : `${n.own} hier, ${n.total} mit Unterordnern`}>
              {n.total}
            </span>
          )}
        </div>
        {hasKids && open && (
          <ul role="group" className="tree">
            {n.children.map((c) => renderNode(c, level + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="docs">
      <section className="card docs-tree" aria-label="Ordner">
        <div className="docs-tree-head">
          <span className="docs-tree-title">Ordner</span>
          <div className="docs-tree-actions">
            <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set(allPaths(tree)))}>
              Alle auf
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>
              Zu
            </Button>
          </div>
        </div>
        <div className="docs-tree-filter">
          <Checkbox label="Leere Ordner ausblenden" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
        </div>
        <ul className="tree tree-root" role="tree" aria-label="Projektordner">
          {tree.map((n) => renderNode(n, 0))}
        </ul>
      </section>

      <section className="card docs-files" aria-label="Dateien">
        {node && (
          <>
            <header className="docs-files-head">
              <div className="docs-path">
                <span className="muted">{displayPath(node.path).split(" › ").slice(0, -1).join(" › ")}</span>
                <h3>{node.label}</h3>
              </div>
              <Button icon={<Upload size={15} />} onClick={() => fileInput.current?.click()} disabled={busy}>
                Datei hochladen
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  startUpload(node, Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </header>

            {node.dateTemplate ? (
              <div className="docs-date-info">
                <p>
                  Datumsordner: Beim Ablegen wird ein Unterordner mit Datum angelegt, z. B. <strong>{node.label.replace("…", formatDate(today))}</strong>.
                </p>
                {node.children.length > 0 && (
                  <ul className="docs-instances">
                    {node.children.map((c) => (
                      <li key={c.path}>
                        <button type="button" className="link-button" onClick={() => select(c)}>
                          <Folder size={14} aria-hidden /> {c.label}
                        </button>
                        <span className="muted">{c.total} Dateien</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : files.length ? (
              <ul className="file-list">
                {files.map((f) => {
                  const Icon = KIND_ICON[fileKind(f.name, f.mime)];
                  return (
                    <li key={f.id} className="file-row">
                      <Icon size={18} className="file-icon" aria-hidden />
                      <div className="file-main">
                        <span className="file-name" title="Vorschau und Download folgen mit Supabase Storage (Schritt 8)">
                          {f.name}
                        </span>
                        <span className="file-meta">
                          {formatDate(f.receivedOn)} · {formatBytes(f.sizeBytes)}
                          {f.uploadedBy ? ` · ${f.uploadedBy}` : ""}
                        </span>
                      </div>
                      {f.source === "agent" ? (
                        <Pill tone="info">
                          <Bot size={12} aria-hidden /> Agent
                        </Pill>
                      ) : (
                        <Pill>Upload</Pill>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div
              className="dropzone"
              data-drop={dropTarget === `zone:${node.path}`}
              onDragOver={(e) => onDragOver(e, `zone:${node.path}`)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => onDrop(e, node)}
            >
              {!files.length && !node.dateTemplate && <EmptyState icon={<Folder size={18} />} title="Ordner ist leer" />}
              <p>
                <Upload size={15} aria-hidden /> Dateien hierher ziehen oder auf einen Ordner links
              </p>
              <p className="muted">PDF, Office, Bilder, Mails. CAD-Dateien (.dwg, .pln) bleiben auf dem Fileserver.</p>
            </div>
          </>
        )}
      </section>

      {pending && (
        <Dialog
          title="Datum für den Ordner"
          onClose={() => setPending(null)}
          footer={
            <>
              <Button onClick={() => setPending(null)}>Abbrechen</Button>
              <Button
                variant="primary"
                disabled={!pending.date || busy}
                onClick={() => {
                  const target = concretePath(pending.node.path, pending.date);
                  const list = pending.files;
                  setPending(null);
                  void upload(target, list);
                }}
              >
                Ablegen
              </Button>
            </>
          }
        >
          <p>
            {pending.files.length} {pending.files.length === 1 ? "Datei" : "Dateien"} in <strong>{pending.node.label}</strong>
          </p>
          <Field label="Datum (z. B. erhalten am)" htmlFor="upload-date" hint={`Ordnername: ${pending.date ? pending.node.label.replace("…", formatDate(pending.date)) : "–"}`}>
            <Input id="upload-date" type="date" value={pending.date} max={today} onChange={(e) => setPending({ ...pending, date: e.target.value })} />
          </Field>
        </Dialog>
      )}
    </div>
  );
}

function allPaths(nodes: FolderNode[]): string[] {
  return nodes.flatMap((n) => [n.path, ...allPaths(n.children)]);
}
