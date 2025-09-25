import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { marked } from "marked";
import Navbar from "../components/NavBar";

// ---- API base --------------------------------------------------------------
const API_BASE = "https://docdiff.mooo.com"

// Safe fetch helper (ignore AbortError from StrictMode double-invoke)
const getJSON = async (path, signal) => {
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}: ${txt}`);
    }
    return res.json();
  } catch (e) {
    if (e?.name === "AbortError" || /aborted/i.test(String(e?.message))) {
      return new Promise(() => {}); // silently ignore
    }
    throw e;
  }
};

// ---------- helpers to build thresholds from mergedPairs --------------------
function bucketToLevel(sim) {
  const key = Number(sim).toFixed(1);
  if (key === "0.7") return "low";
  if (key === "0.8") return "medium";
  if (key === "0.9") return "high";
  return null;
}

function allProvisionIdsRoad(toc) {
  const ids = [];
  (toc || []).forEach((part) => {
    if (part.provisions) {
      part.provisions.forEach((p) => ids.push(p.id));
    }
    if (part.divisions) {
      Object.values(part.divisions).forEach((division) => {
        if (division.provisions) {
          division.provisions.forEach((p) => ids.push(p.id));
        }
      });
    }
  });
  return ids;
}

function buildThresholdsFromMergedPairs(pairs, tocNSW, tocVIC) {
  const mkLevelMap = () => new Map(); // id -> Set(similarIds)
  const maps = {
    low: { nsw: mkLevelMap(), vic: mkLevelMap() },
    medium: { nsw: mkLevelMap(), vic: mkLevelMap() },
    high: { nsw: mkLevelMap(), vic: mkLevelMap() },
  };
  const ensure = (m, id) => { if (!m.has(id)) m.set(id, new Set()); };

  (pairs || []).forEach((p) => {
    const level = bucketToLevel(p.similarity);
    if (!level) return;

    const a = p.id_1, b = p.id_2;
    const aNSW = a.endsWith("_NSW");
    const bNSW = b.endsWith("_NSW");
    const aVIC = a.endsWith("_Victoria");
    const bVIC = b.endsWith("_Victoria");

    // NSW perspective: NSW id -> similar VIC ids
    if (aNSW && bVIC) { ensure(maps[level].nsw, a); maps[level].nsw.get(a).add(b); }
    else if (aVIC && bNSW) { ensure(maps[level].nsw, b); maps[level].nsw.get(b).add(a); }

    // VIC perspective: VIC id -> similar NSW ids
    if (aVIC && bNSW) { ensure(maps[level].vic, a); maps[level].vic.get(a).add(b); }
    else if (aNSW && bVIC) { ensure(maps[level].vic, b); maps[level].vic.get(b).add(a); }
  });

  // ensure all ids exist with [] for consistent UI
  const allNSW = allProvisionIdsRoad(tocNSW);
  const allVIC = allProvisionIdsRoad(tocVIC);
  ["low", "medium", "high"].forEach((lvl) => {
    allNSW.forEach((id) => ensure(maps[lvl].nsw, id));
    allVIC.forEach((id) => ensure(maps[lvl].vic, id));
  });

  const toArray = (m) => Array.from(m.entries()).map(([id, set]) => ({
    id,
    similar: Array.from(set),
  }));

  return {
    low:    { nsw: toArray(maps.low.nsw),    vic: toArray(maps.low.vic) },
    medium: { nsw: toArray(maps.medium.nsw), vic: toArray(maps.medium.vic) },
    high:   { nsw: toArray(maps.high.nsw),   vic: toArray(maps.high.vic) },
  };
}

// ----------------------------------------------------------------------------

export default function ProvisionComparison() {
  const { jurisdiction, id } = useParams();
  const [level, setLevel] = useState("high");
  const [pairs, setPairs] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState(null);
  const [activeTab, setActiveTab] = useState("default");

  // remote data
  const [tocNSW, setTocNSW] = useState(null);
  const [tocVIC, setTocVIC] = useState(null);
  const [mergedPairs, setMergedPairs] = useState(null);

  // provision text cache: { [id]: html }
  const [textById, setTextById] = useState({});

  const [loadingBoot, setLoadingBoot] = useState(true);
  const [bootError, setBootError] = useState("");

  // bootstrap fetch: TOCs + pairs
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoadingBoot(true);
        setBootError("");
        const [nsw, vic, pairs] = await Promise.all([
          getJSON("/road_toc/nsw", ac.signal),
          getJSON("/road_toc/vic", ac.signal),
          getJSON("/road_pairs", ac.signal),
        ]);
        setTocNSW(nsw);
        setTocVIC(vic);
        setMergedPairs(pairs);
      } catch (e) {
        if (e?.name !== "AbortError" && !/aborted/i.test(String(e?.message))) {
          setBootError(e.message || String(e));
        }
      } finally {
        setLoadingBoot(false);
      }
    })();
    return () => ac.abort();
  }, []);

  // thresholds from API data
  const thresholds = useMemo(() => {
    if (!mergedPairs || !tocNSW || !tocVIC) return null;
    return buildThresholdsFromMergedPairs(mergedPairs, tocNSW, tocVIC);
  }, [mergedPairs, tocNSW, tocVIC]);

  // pick level and pairs for current id
  useEffect(() => {
    if (!thresholds) return;
    const levels = ["high", "medium", "low"];
    for (const lvl of levels) {
      const data = thresholds[lvl][jurisdiction];
      const found = data.find((item) => item.id === id);
      if (found && found.similar.length > 0) {
        setLevel(lvl);
        setPairs(found.similar);
        return;
      }
    }
    setPairs([]);
  }, [jurisdiction, id, thresholds]);

  useEffect(() => {
    if (!thresholds) return;
    const data = thresholds[level][jurisdiction];
    const found = data.find((item) => item.id === id);
    setPairs(found ? found.similar : []);
  }, [level, jurisdiction, id, thresholds]);

  // nested TOC helpers
  const toc = jurisdiction === "nsw" ? tocNSW : tocVIC;
  const pairedToc = jurisdiction === "nsw" ? tocVIC : tocNSW;

  const findProvision = (tocData, pid) => {
    if (!tocData) return null;
    for (const part of tocData) {
      if (part.provisions) {
        const prov = part.provisions.find((p) => p.id === pid);
        if (prov) return prov;
      }
      if (part.divisions) {
        for (const division of Object.values(part.divisions)) {
          if (division.provisions) {
            const prov = division.provisions.find((p) => p.id === pid);
            if (prov) return prov;
          }
        }
      }
    }
    return null;
  };

  // fetch & cache a provision's HTML
  const ensureText = async (provId, signal) => {
    if (!provId || textById[provId]) return;
    const src = await getJSON(`/road_text/${encodeURIComponent(provId)}`, signal);
    let text = src?.text || "";
    text = text.replace(/(###)(\S)/g, "$1 $2");      // spacing after ###
    text = text.replace(/\n([a-h]\))/g, "\n- ($1");  // simple list fix
    const html = marked.parse(text);
    setTextById((prev) => ({ ...prev, [provId]: html }));
  };

  // load current-left text
  useEffect(() => {
    const ac = new AbortController();
    ensureText(id, ac.signal);
    return () => ac.abort();
  }, [id]);

  // when opening modal, load both sides
  useEffect(() => {
    if (!modalOpen || !selectedPair) return;
    const ac = new AbortController();
    ensureText(selectedPair.left, ac.signal);
    ensureText(selectedPair.right, ac.signal);
    return () => ac.abort();
  }, [modalOpen, selectedPair]);

  const openModal = (clickedId) => {
    setSelectedPair({ left: id, right: clickedId });
    setActiveTab("default");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedPair(null);
  };

  if (loadingBoot) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="p-8">Loading data…</div>
      </div>
    );
  }
  if (bootError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="p-8 text-red-600">Failed to load: {bootError}</div>
      </div>
    );
  }
  if (!tocNSW || !tocVIC || !thresholds) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="p-8">Preparing…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Navbar />
      <div className="w-[2000px] h-0 invisible"></div>
      <div className="w-full max-w-[95vw] mx-auto p-8 overflow-x-hidden">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex justify-between items-center px-6 py-4">
            <div className="space-x-4">
              {["low", "medium", "high"].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setLevel(lvl)}
                  className={`px-4 py-2 rounded ${
                    level === lvl ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"
                  }`}
                >
                  {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex justify-center">
            <div className="w-[90vw] max-w-[1400px] flex gap-6 p-6">
              {/* Left Column */}
              <div
                className="w-1/2 min-w-[45%] border rounded bg-white shadow p-6 overflow-y-auto h-[calc(100vh-150px)] break-words prose text-left"
                dangerouslySetInnerHTML={{ __html: textById[id] || "<p>Loading…</p>" }}
              />

              {/* Right Column */}
              <div className="w-1/2 min-w-[45%] border rounded bg-white shadow p-6 overflow-y-auto h-[calc(100vh-150px)] break-words">
                <h2 className="text-xl font-semibold mb-4">Paired Provisions ({level})</h2>
                {pairs.length > 0 ? (
                  <div className="space-y-4 text-left">
                    {pairs.map((pid) => {
                      const p = findProvision(pairedToc, pid);
                      return p ? (
                        <div
                          key={p.id}
                          className="border-b py-2 hover:bg-gray-50 cursor-pointer"
                          onClick={() => openModal(p.id)}
                        >
                          <h3 className="font-bold">{p.id}</h3>
                          <p>{p.title}</p>
                        </div>
                      ) : null;
                    })}
                  </div>
                ) : (
                  <div className="text-gray-500 italic">No pairs found</div>
                )}
              </div>
            </div>
          </div>

          {/* Modal */}
          {modalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl w-[90vw] h-[90vh] max-w-7xl p-6 relative flex flex-col">
                <button
                  onClick={closeModal}
                  className="absolute top-4 right-4 text-gray-500 hover:text-black text-2xl"
                >
                  ×
                </button>

                {/* Tab header */}
                <div className="flex space-x-4 border-b pb-2 mb-4">
                  <button
                    className={`h-10 px-4 font-medium rounded transition ${
                      activeTab === "default"
                        ? "text-blue-600 border-b-2 border-blue-600"
                        : "text-gray-600"
                    }`}
                    onClick={() => setActiveTab("default")}
                  >
                    DEFAULT
                  </button>
                </div>

                <h2 className="text-2xl font-bold mb-4">
                  Comparison: {selectedPair.left} vs {selectedPair.right}
                </h2>

                <div className="flex-1 overflow-auto">
                  <div className="grid gap-6 grid-cols-2 h-full">
                    {/* Left Provision */}
                    <div
                      className="border p-4 rounded bg-gray-50 prose text-left"
                      dangerouslySetInnerHTML={{
                        __html: textById[selectedPair.left] || "<p>Loading…</p>",
                      }}
                    />
                    {/* Right Provision */}
                    <div
                      className="border p-4 rounded bg-gray-50 prose text-left"
                      dangerouslySetInnerHTML={{
                        __html: textById[selectedPair.right] || "<p>Loading…</p>",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
