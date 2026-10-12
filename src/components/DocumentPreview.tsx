import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Minus, Plus } from "lucide-react";
import { openPages, type PageImage, type PageSource } from "../lib/extract/pageImage";
import {
  clampPage,
  clampZoom,
  fitSize,
  PAGE_CACHE,
  parsePage,
  pinchZoom,
  RecentCache,
  scrollAfterZoom,
  stepZoom,
  THUMB_EDGE,
  VIEW_EDGE,
  wheelZoom,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../lib/extract/previewState";
import { Button, IconButton } from "./ui";

/**
 * Vorschau eines Vertrags in der Prüfmaske: blättern, zoomen, verschieben, Seiten-Übersicht.
 * Jede Seite wird erst gerendert, wenn sie angezeigt wird (die Übersicht erst beim Aufklappen), und bleibt im Browser.
 * An den KI-Dienst geht hiervon nichts: das entscheidet allein die Auslesung.
 */
export function DocumentPreview({
  file,
  kind,
  page,
  onPage,
  onPageCount,
}: {
  file: Blob | null;
  kind: "pdf" | "docx" | "bild" | null;
  /** Angezeigte Seite, ab 1 (von außen steuerbar, z. B. per Klick auf die Textstelle eines Felds) */
  page: number;
  onPage: (page: number) => void;
  onPageCount: (count: number) => void;
}) {
  const [source, setSource] = useState<PageSource | null>(null);
  const [state, setState] = useState<"laden" | "bereit" | "ohne">("laden");
  const [image, setImage] = useState<PageImage | null>(null);
  const [rendering, setRendering] = useState(false);
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [pageInput, setPageInput] = useState(String(page));
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [dragging, setDragging] = useState(false);
  const view = useRef<HTMLDivElement>(null);
  const cache = useRef(new RecentCache<PageImage>(PAGE_CACHE));
  /** Punkt im Fenster, der beim nächsten Zoom unter dem Zeiger bleiben soll, und die Bildgröße davor */
  const anchor = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; zoom: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const pageCount = source?.pageCount ?? 1;

  // Dokument öffnen (noch keine Seite rendern) und beim Schließen wieder freigeben
  useEffect(() => {
    let alive = true;
    let opened: PageSource | null = null;
    cache.current.clear();
    setSource(null);
    setImage(null);
    setThumbs({});
    setZoom(ZOOM_MIN);
    if (!file || !kind) {
      setState(file ? "ohne" : "laden");
      return;
    }
    setState("laden");
    void openPages(file, kind).then((s) => {
      if (!alive) return s?.close();
      opened = s;
      setSource(s);
      setState(s ? "bereit" : "ohne");
      if (s) onPageCount(s.pageCount);
    });
    return () => {
      alive = false;
      opened?.close();
    };
    // onPageCount ist ein Setter des Aufrufers; neu öffnen nur bei anderer Datei
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, kind]);

  // Angezeigte Seite rendern: erst jetzt, und nur diese
  useEffect(() => {
    if (!source) return;
    const n = clampPage(page, source.pageCount);
    setPageInput(String(n));
    setZoom(ZOOM_MIN);
    const cached = cache.current.get(n);
    if (cached) return setImage(cached);
    let alive = true;
    setRendering(true);
    void source
      .render(n, VIEW_EDGE)
      .then((img) => {
        cache.current.set(n, img);
        if (alive) setImage(img);
      })
      .catch(() => alive && setImage(null))
      .finally(() => alive && setRendering(false));
    return () => {
      alive = false;
    };
  }, [source, page]);

  // Übersicht: kleine Bilder nacheinander, erst wenn sie aufgeklappt ist
  useEffect(() => {
    if (!source || !thumbsOpen) return;
    let alive = true;
    void (async () => {
      for (let n = 1; n <= source.pageCount && alive; n++) {
        if (thumbs[n]) continue;
        const img = await source.render(n, THUMB_EDGE).catch(() => null);
        if (alive && img) setThumbs((old) => ({ ...old, [n]: img.dataUrl }));
      }
    })();
    return () => {
      alive = false;
    };
    // thumbs absichtlich nicht: sonst startet die Schleife nach jedem Bild neu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, thumbsOpen]);

  // Größe des Fensters verfolgen (Einpassen)
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [state]);

  const fit = image ? fitSize(image, box) : { width: 0, height: 0 };
  const shown = { width: Math.round(fit.width * zoom), height: Math.round(fit.height * zoom) };

  /** Zoom ändern und den Punkt unter `at` (Standard: Fenstermitte) festhalten. */
  const zoomTo = useCallback(
    (next: number | ((z: number) => number), at?: { x: number; y: number }) => {
      const el = view.current;
      setZoom((old) => {
        const value = clampZoom(typeof next === "function" ? next(old) : next);
        if (el && value !== old) anchor.current = { x: at?.x ?? el.clientWidth / 2, y: at?.y ?? el.clientHeight / 2, width: fit.width * old, height: fit.height * old };
        return value;
      });
    },
    [fit.width, fit.height],
  );

  // nach dem Zoomen die Scrollposition so setzen, dass der Ankerpunkt stehen bleibt
  useLayoutEffect(() => {
    const el = view.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    el.scrollLeft = scrollAfterZoom(el.scrollLeft, a.x, a.width, shown.width);
    el.scrollTop = scrollAfterZoom(el.scrollTop, a.y, a.height, shown.height);
  }, [shown.width, shown.height]);

  // Mausrad mit Strg/Cmd zoomt (nicht passiv, damit die Seite dabei nicht selbst zoomt)
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo((z) => wheelZoom(z, e.deltaY), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo, state]);

  const go = (n: number) => onPage(clampPage(n, pageCount));

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "PageUp") go(page - 1);
    else if (e.key === "ArrowRight" || e.key === "PageDown") go(page + 1);
    else if (e.key === "+" || e.key === "=") zoomTo((z) => stepZoom(z, 1));
    else if (e.key === "-") zoomTo((z) => stepZoom(z, -1));
    else if (e.key === "0") zoomTo(ZOOM_MIN);
    else return;
    e.preventDefault();
  }

  // Ziehen verschiebt die vergrößerte Seite; zwei Finger zoomen
  function onPointerDown(e: ReactPointerEvent) {
    const el = view.current;
    if (!el) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      drag.current = null;
      setDragging(false);
    } else if (zoom > ZOOM_MIN && e.button === 0) {
      drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    const el = view.current;
    if (!el || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const r = el.getBoundingClientRect();
      zoomTo(pinchZoom(gesture.current.zoom, gesture.current.distance, Math.hypot(a.x - b.x, a.y - b.y)), { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top });
    } else if (drag.current) {
      el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
      el.scrollTop = drag.current.top - (e.clientY - drag.current.y);
    }
  }

  function onPointerEnd(e: ReactPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setDragging(false);
    }
  }

  if (state === "ohne") {
    return <p className="review-nopage muted">{kind === "docx" ? "Für DOCX gibt es keine Vorschau." : "Für diese Datei ist keine Vorschau möglich."}</p>;
  }

  const percent = Math.round(zoom * 100);
  return (
    <div className="doc-preview">
      <div className="doc-toolbar" role="toolbar" aria-label="Vorschau bedienen">
        <span className="doc-tools">
          <IconButton label="Vorherige Seite" size="sm" onClick={() => go(page - 1)} disabled={page <= 1}>
            <ChevronLeft size={16} />
          </IconButton>
          <label className="doc-pageno">
            <span>Seite</span>
            <input
              className="input"
              inputMode="numeric"
              aria-label={`Seite (1 bis ${pageCount})`}
              value={pageInput}
              onChange={(e) => {
                setPageInput(e.target.value);
                const n = parsePage(e.target.value, pageCount);
                if (n) onPage(n);
              }}
              onBlur={() => setPageInput(String(page))}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              disabled={pageCount <= 1}
            />
            <span>von {pageCount}</span>
          </label>
          <IconButton label="Nächste Seite" size="sm" onClick={() => go(page + 1)} disabled={page >= pageCount}>
            <ChevronRight size={16} />
          </IconButton>
        </span>
        <span className="doc-tools">
          <IconButton label="Verkleinern" size="sm" onClick={() => zoomTo((z) => stepZoom(z, -1))} disabled={zoom <= ZOOM_MIN}>
            <Minus size={15} />
          </IconButton>
          <span className="doc-zoom" aria-live="polite">
            {percent} %
          </span>
          <IconButton label="Vergrößern" size="sm" onClick={() => zoomTo((z) => stepZoom(z, 1))} disabled={zoom >= ZOOM_MAX}>
            <Plus size={15} />
          </IconButton>
          <Button size="sm" variant="ghost" onClick={() => zoomTo(ZOOM_MIN)} disabled={zoom <= ZOOM_MIN}>
            Einpassen
          </Button>
          {pageCount > 1 && (
            <Button size="sm" variant="ghost" icon={<LayoutGrid size={14} />} aria-expanded={thumbsOpen} aria-controls="doc-thumbs" onClick={() => setThumbsOpen((o) => !o)}>
              Seiten
            </Button>
          )}
        </span>
      </div>

      {thumbsOpen && pageCount > 1 && (
        <div className="doc-thumbs" id="doc-thumbs" role="group" aria-label="Seiten-Übersicht">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className="doc-thumb" aria-current={n === page ? "page" : undefined} aria-label={`Seite ${n} anzeigen`} onClick={() => onPage(n)}>
              {thumbs[n] ? <img src={thumbs[n]} alt="" draggable={false} /> : <span className="doc-thumb-wait" aria-hidden />}
              <span className="doc-thumb-no">{n}</span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={view}
        className="doc-view"
        tabIndex={0}
        role="img"
        aria-label={`Seite ${page} von ${pageCount} des Dokuments, ${percent} %. Pfeiltasten blättern, Plus und Minus zoomen.`}
        data-zoomed={zoom > ZOOM_MIN || undefined}
        data-dragging={dragging || undefined}
        aria-busy={rendering || state === "laden"}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={() => zoomTo((z) => (z > ZOOM_MIN ? ZOOM_MIN : 2))}
      >
        {image && shown.width > 0 ? (
          <img className="doc-page" src={image.dataUrl} width={shown.width} height={shown.height} alt="" draggable={false} data-stale={rendering || undefined} />
        ) : (
          <span className="doc-wait muted">{state === "laden" || rendering ? "Seite wird geladen …" : "Diese Seite lässt sich nicht anzeigen."}</span>
        )}
      </div>
    </div>
  );
}
