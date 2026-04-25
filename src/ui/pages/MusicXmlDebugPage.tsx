import React from "react";
import { useSearchParams } from "react-router-dom";
import { musicAPI, API_BASE } from "../../api/client";
import { INSTRUMENTS, type Instrument } from "../data/instruments";
import { PageHeader } from "../shared/PageHeader";
import { resolveAudioUrl } from "./musicPreview.utils";
import { filterMusicXmlByPartName, parseMusicXml } from "./musicXml.utils";

type MusicRow = {
  id: number;
  title?: string | null;
  artist?: string | null;
  klangioMxmlPath?: string | null;
};

export function MusicXmlDebugPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [musicRows, setMusicRows] = React.useState<MusicRow[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [instrument, setInstrument] = React.useState<Instrument>("guitar");
  const [loading, setLoading] = React.useState(true);
  const [rendering, setRendering] = React.useState(false);
  const [error, setError] = React.useState("");
  const [warning, setWarning] = React.useState("");
  const [debugMeta, setDebugMeta] = React.useState<any | null>(null);
  const [matchedPartIds, setMatchedPartIds] = React.useState<string[]>([]);
  const [renderMode, setRenderMode] = React.useState("not-rendered");
  const [notationZoom, setNotationZoom] = React.useState(1.0);
  const scoreRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const idParam = Number.parseInt(searchParams.get("id") ?? "", 10);
    const instParam = String(searchParams.get("instrument") ?? "").trim().toLowerCase();
    if (Number.isFinite(idParam) && idParam > 0) setSelectedId(idParam);
    if (INSTRUMENTS.includes(instParam as Instrument)) setInstrument(instParam as Instrument);
  }, [searchParams]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const rows = await musicAPI.list();
        if (cancelled) return;
        const list = (Array.isArray(rows) ? rows : []).filter((row: any) => row?.klangioMxmlPath) as MusicRow[];
        setMusicRows(list);

        if (selectedId == null && list.length > 0) {
          const nextId = Number(list[0]?.id ?? 0);
          if (Number.isFinite(nextId) && nextId > 0) {
            setSelectedId(nextId);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load music list");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  React.useEffect(() => {
    if (selectedId == null) return;
    const currentId = searchParams.get("id");
    const currentInstrument = searchParams.get("instrument");
    if (currentId === String(selectedId) && currentInstrument === instrument) return;

    const next = new URLSearchParams(searchParams);
    next.set("id", String(selectedId));
    next.set("instrument", instrument);
    setSearchParams(next, { replace: true });
  }, [selectedId, instrument, searchParams, setSearchParams]);

  React.useEffect(() => {
    if (selectedId == null || !scoreRef.current) return;

    let cancelled = false;
    const container = scoreRef.current;

    void (async () => {
      setRendering(true);
      setError("");
      setWarning("");
      setRenderMode("not-rendered");
      try {
        const meta = await musicAPI.get(selectedId, { instrument, source: "klang_json" });
        if (cancelled) return;
        setDebugMeta(meta);

        const xmlUrl = resolveAudioUrl(API_BASE, (meta as any)?.klangioMxmlPath);
        if (!xmlUrl) {
          throw new Error("No MusicXML file is available for this piece");
        }

        const xmlResp = await fetch(xmlUrl, { credentials: "include" });
        if (!xmlResp.ok) {
          throw new Error(`MusicXML fetch failed: HTTP ${xmlResp.status}`);
        }
        const xmlText = await xmlResp.text();
        if (cancelled) return;

        const xmlDocument = parseMusicXml(xmlText);
        const filtered = filterMusicXmlByPartName(xmlDocument, (meta as any)?.partName);
        setMatchedPartIds(filtered.matchedPartIds);

        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (cancelled) return;

        const renderDocument = async (doc: Document, mode: string) => {
          container.innerHTML = "";
          const osmd = new OpenSheetMusicDisplay(container, {
            autoResize: true,
            backend: "svg",
            drawingParameters: "default",
            drawTitle: true,
            drawComposer: true,
            drawPartNames: true,
            newSystemFromXML: true,
            pageFormat: "Endless",
          });
          try {
            if ("Zoom" in osmd) osmd.Zoom = notationZoom;
            if ("zoom" in osmd) osmd.zoom = notationZoom;
          } catch {
            // ignore zoom setter errors
          }
          await osmd.load(doc);
          if (cancelled) return;
          osmd.render();
          setRenderMode(mode);
        };

        try {
          await renderDocument(
            filtered.xmlDocument,
            filtered.usedFilteredDocument ? "filtered part render" : "full score render"
          );
        } catch (filteredError: any) {
          if (!filtered.usedFilteredDocument) {
            throw filteredError;
          }

          await renderDocument(xmlDocument, "full score fallback");
          if (cancelled) return;
          setWarning(
            `Filtered MusicXML failed to render for part "${String((meta as any)?.partName ?? "n/a")}". Showing the full saved score instead. ` +
              `Filter error: ${filteredError?.message ?? "unknown render error"}`
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          container.innerHTML = "";
          setError(e?.message ?? "Failed to render MusicXML");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [selectedId, instrument, notationZoom]);

  return (
    <div>
      <PageHeader
        title="MusicXML Debug"
        subtitle="Render saved Klang MusicXML directly to compare score fidelity against the current preview lane."
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select
              className="select"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(Number.parseInt(e.target.value, 10))}
              style={{ minWidth: 280 }}
            >
              {musicRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title || `Music #${row.id}`}
                </option>
              ))}
            </select>
            <select className="select" value={instrument} onChange={(e) => setInstrument(e.target.value as Instrument)}>
              {INSTRUMENTS.map((inst) => (
                <option key={inst} value={inst}>
                  {inst}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {loading ? <div className="pageSubtitle">Loading MusicXML debug page...</div> : null}
      {error ? (
        <div className="pageSubtitle" style={{ color: "rgba(255,120,120,.95)" }}>
          {error}
        </div>
      ) : null}
      {warning ? (
        <div className="pageSubtitle" style={{ color: "rgba(255,210,120,.95)" }}>
          {warning}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px minmax(0, 1fr)",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div className="card" style={{ maxWidth: "none" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Debug Info</div>
          <div className="pageSubtitle">Requested instrument: {instrument}</div>
          <div className="pageSubtitle">Resolved part: {String(debugMeta?.partName ?? "n/a")}</div>
          <div className="pageSubtitle">Matched MusicXML part ids: {matchedPartIds.length > 0 ? matchedPartIds.join(", ") : "full score fallback"}</div>
          <div className="pageSubtitle">Render mode: {renderMode}</div>
          <div className="pageSubtitle">Source used for metadata: {String(debugMeta?.sourceUsed ?? "n/a")}</div>
          <div className="pageSubtitle">Available parts:</div>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "rgba(216,221,231,.82)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {JSON.stringify(debugMeta?.availableParts ?? [], null, 2)}
          </pre>
          <div className="pageSubtitle" style={{ marginTop: 10 }}>
            MusicXML path:
          </div>
          <div style={{ color: "rgba(216,221,231,.82)", fontSize: 12, lineHeight: 1.5, wordBreak: "break-all" }}>
            {String(debugMeta?.klangioMxmlPath ?? "n/a")}
          </div>
        </div>

        <div className="card" style={{ maxWidth: "none", background: "#f7f6f2", color: "#1b1d24" }}>
          <div style={{ fontWeight: 900, marginBottom: 10, color: "#1b1d24" }}>
            Rendered MusicXML
          </div>
          <div style={{ color: "#5f6472", fontSize: 13, marginBottom: 12 }}>
            This page renders Klang&apos;s saved MusicXML directly. When a matching part name exists, the debug page filters the XML to that part before rendering.
          </div>
          {rendering ? <div style={{ color: "#5f6472", marginBottom: 12 }}>Rendering score...</div> : null}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <label className="pill" style={{ color: "#1b1d24", display: "flex", alignItems: "center", gap: 10 }}>
              <span>Zoom</span>
              <input
                type="range"
                min={0.5}
                max={1.6}
                step={0.05}
                value={notationZoom}
                onChange={(e) => setNotationZoom(Number(e.target.value))}
                style={{ width: 160 }}
                aria-label="MusicXML zoom"
              />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{notationZoom.toFixed(2)}x</span>
            </label>
          </div>
          <div
            style={{
              overflow: "auto",
              borderRadius: 14,
              border: "1px solid rgba(27,29,36,.12)",
              background: "#fff",
              padding: 16,
              minHeight: 480,
            }}
          >
            <div ref={scoreRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
