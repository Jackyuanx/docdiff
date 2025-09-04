import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { marked } from "marked";
import Navbar from "../components/NavBar";

// ---- API base --------------------------------------------------------------
const API_BASE = "https://docdiff.mooo.com";
const getJSON = async (path, signal) => {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${txt}`);
  }
  return res.json();
};

// ---- constants -------------------------------------------------------------
const similarityForLevel = { low: 0.7, medium: 0.8, high: 0.9 };
const highlightTabs = ["default", "who", "when", "where", "how", "tone", "penalty"];

export default function ProvisionComparison() {
  const { jurisdiction, id } = useParams(); // "4_NSW" or "4_Victoria"

  // remote data
  const [tocNSW, setTocNSW] = useState(null);
  const [tocVIC, setTocVIC] = useState(null);
  const [mergedPairs, setMergedPairs] = useState(null);
  const [mergedColouring, setMergedColouring] = useState(null);
  const [comparisons, setComparisons] = useState(null);

  const [loadingBoot, setLoadingBoot] = useState(true);
  const [bootError, setBootError] = useState("");

  // UI state
  const [level, setLevel] = useState("high");
  const [pairs, setPairs] = useState([]); // array of counterpart IDs
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState(null); // { left, right }
  const [activeTab, setActiveTab] = useState("tone");
  const [highlightTab, setHighlightTab] = useState("default");
  const [loadingPairs, setLoadingPairs] = useState(true);

  // ---- bootstrap fetch (run once) -----------------------------------------
  useEffect(() => {
  const ac = new AbortController();
  (async () => {
    try {
      setLoadingBoot(true);
      setBootError("");

      const [nsw, vic, pairs, colours, comps] = await Promise.all([
        getJSON("/toc/nsw", ac.signal),
        getJSON("/toc/vic", ac.signal),
        getJSON("/whs_pairs", ac.signal),
        getJSON("/whs_color", ac.signal),
        getJSON("/comparisons", ac.signal),
      ]);

      setTocNSW(nsw);
      setTocVIC(vic);
      setMergedPairs(pairs);
      setMergedColouring(colours);
      setComparisons(comps);
    } catch (e) {
      // Ignore aborts from StrictMode cleanup
      if (e?.name !== "AbortError" && !/aborted/i.test(String(e?.message))) {
        setBootError(e.message || String(e));
      }
    } finally {
      setLoadingBoot(false);
    }
  })();
  return () => ac.abort();
}, []);

// Safe fetch helper: ignores AbortError (React StrictMode double-invoke)
const getJSON = async (path, signal) => {
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}: ${txt}`);
    }
    return res.json();
  } catch (e) {
    // If the effect was cleaned up, AbortController triggers this
    if (e?.name === "AbortError" || /aborted/i.test(String(e?.message))) {
      // Silently ignore; a second fetch will follow in dev StrictMode
      return new Promise(() => {}); // never resolves, but we don't await it after abort
    }
    throw e;
  }
};

  // Quick index: id -> colouring record
  const colouringById = useMemo(() => {
    const m = new Map();
    (mergedColouring || []).forEach((row) => m.set(row.id, row));
    return m;
  }, [mergedColouring]);

  const toc = jurisdiction === "nsw" ? tocNSW : tocVIC;
  const pairedToc = jurisdiction === "nsw" ? tocVIC : tocNSW;

  // Helper: find provision metadata in a TOC
  const findProvision = (tocData, pid) => {
    if (!tocData) return null;
    for (const chapter of tocData) {
      if (chapter.parts) {
        for (const part of Object.values(chapter.parts)) {
          if (part.provisions) {
            const prov = part.provisions.find((p) => p.id === pid);
            if (prov) return prov;
          }
        }
      }
    }
    return null;
  };

  const currentProv = useMemo(() => findProvision(toc, id), [toc, id]);

  // Bucket pairs by level from mergedPairs
  useEffect(() => {
    if (!mergedPairs) return;
    setLoadingPairs(true);
    try {
      const levels = ["high", "medium", "low"]; // prefer highest first
      let foundLevel = null;
      let foundPairs = [];

      for (const lvl of levels) {
        const sim = similarityForLevel[lvl];
        const matches = (mergedPairs || []).filter((p) => {
          if (p.similarity !== sim) return false;
          return p.id_1 === id || p.id_2 === id;
        });
        if (matches.length > 0) {
          foundLevel = lvl;
          foundPairs = matches.map((p) => (p.id_1 === id ? p.id_2 : p.id_1));
          break;
        }
      }

      if (foundLevel) {
        setLevel(foundLevel);
        setPairs(foundPairs);
      } else {
        setPairs([]);
      }
    } finally {
      setLoadingPairs(false);
    }
  }, [id, jurisdiction, mergedPairs]);

  // When user clicks a different level, recompute pairs at that similarity
  useEffect(() => {
    if (!mergedPairs) return;
    const sim = similarityForLevel[level];
    const matches = (mergedPairs || []).filter((p) => {
      if (p.similarity !== sim) return false;
      return p.id_1 === id || p.id_2 === id;
    });
    const counterpartIds = matches.map((p) => (p.id_1 === id ? p.id_2 : p.id_1));
    setPairs(counterpartIds);
  }, [level, id, mergedPairs]);

  const openModal = (clickedId) => {
    setSelectedPair({ left: id, right: clickedId });
    setActiveTab("tone");
    setHighlightTab("default");
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setSelectedPair(null);
  };

  // Comparison lookup
  const comparison = useMemo(() => {
    if (!selectedPair || !comparisons) return null;
    return (comparisons || []).find(
      (c) =>
        (c.NSW === selectedPair.left && c.Victoria === selectedPair.right) ||
        (c.NSW === selectedPair.right && c.Victoria === selectedPair.left)
    );
  }, [selectedPair, comparisons]);

  // --- Colouring text helpers (from mergedColouring) ---
  const getFullProvisionText = (provId) => {
    const rec = colouringById.get(provId);
    if (!rec) return "<p>No text found</p>";
    const base = rec.how || rec.who || rec.when || rec.where || rec.tone || rec.penalty || "";
    const clean = base.replace(/<span[^>]*>|<\/span>/g, "");
    return marked.parse(clean);
  };

  const getProvisionText = (provId, tab) => {
    const rec = colouringById.get(provId);
    if (!rec) return "<p>No text found</p>";
    if (tab === "default") {
      const base = rec.how || rec.who || rec.when || rec.where || rec.tone || rec.penalty || "";
      const clean = base.replace(/<span[^>]*>|<\/span>/g, "");
      return marked.parse(clean);
    }
    return marked.parse(rec[tab] || "");
  };

  const normalizeMarkdown = (text) => {
    if (!text) return "";
    const stars = (text.match(/\*\*/g) || []).length;
    if (stars % 2 !== 0) text += "**";
    return text;
  };

  // ---- loading / error guards --------------------------------------------
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

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Navbar />
      <div className="w-[2000px] h-0 invisible"></div>
      <div className="w-full max-w-[95vw] mx-auto p-8 overflow-x-hidden">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex justify-between items-center px-6 py-4 ">
            <div className="space-x-4">
              <button onClick={() => setLevel("low")}
                className={`px-4 py-2 rounded ${level === "low" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
                Low
              </button>
              <button onClick={() => setLevel("medium")}
                className={`px-4 py-2 rounded ${level === "medium" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
                Medium
              </button>
              <button onClick={() => setLevel("high")}
                className={`px-4 py-2 rounded ${level === "high" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
                High
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex justify-center">
            <div className="w-[90vw] max-w-[1400px] flex gap-6 p-6">
              {/* Left Column: current provision (clean) */}
              <div
                className="w-1/2 min-w-[45%] border rounded bg-white shadow p-6 overflow-y-auto h-[calc(100vh-150px)] break-words prose text-left"
                dangerouslySetInnerHTML={{ __html: getFullProvisionText(id) }}
              />

              {/* Right Column: pairs */}
              <div className="w-1/2 min-w-[45%] border rounded bg-white shadow p-6 overflow-y-auto h-[calc(100vh-150px)] break-words">
                <h2 className="text-xl font-semibold mb-4">Paired Provisions ({level})</h2>

                {loadingPairs ? (
                  <div className="text-gray-500">Loading pairs…</div>
                ) : pairs.length > 0 ? (
                  <div className="space-y-4 text-left">
                    {pairs.map((pid) => {
                      const p = findProvision(pairedToc, pid);
                      return p ? (
                        <div key={p.id} className="border-b py-2 hover:bg-gray-50 cursor-pointer"
                             onClick={() => openModal(p.id)}>
                          <h3 className="font-bold">{p.id}</h3>
                          <p>{p.title}</p>
                        </div>
                      ) : (
                        <div key={pid} className="border-b py-2 text-gray-500 italic"
                             onClick={() => openModal(pid)}>
                          {pid}
                        </div>
                      );
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
                <button onClick={closeModal} className="absolute top-4 right-4 text-gray-500 hover:text-black text-2xl">×</button>

                {/* Highlight Tabs */}
                <div className="flex space-x-4 border-b pb-2 mb-4">
                  {highlightTabs.map((tab) => {
                    const isActive = highlightTab === tab;
                    const colorMap = {
                      default: "#4B5563", who: "blue", when: "orange",
                      where: "fuchsia", how: "green", tone: "darkorange", penalty: "red",
                    };
                    const color = colorMap[tab] || "#4B5563";
                    return (
                      <button key={tab}
                        className="flex items-center justify-center h-10 px-4 font-medium rounded transition"
                        style={{ color: isActive ? color : "#4B5563", borderBottom: isActive ? `2px solid ${color}` : "none" }}
                        onClick={() => setHighlightTab(tab)}
                      >
                        {tab.toUpperCase()}
                      </button>
                    );
                  })}
                </div>

                <h2 className="text-2xl font-bold mb-4">
                  {highlightTab === "default"
                    ? `Viewing: ${selectedPair?.left} vs ${selectedPair?.right}`
                    : `Comparison: ${selectedPair?.left} vs ${selectedPair?.right}`}
                </h2>

                <div className="flex-1 overflow-auto">
                  <div className={`grid gap-6 ${highlightTab === "default" ? "grid-cols-2" : "grid-cols-3"} h-full`}>
                    {/* Left (current) */}
                    <div className="border p-4 rounded bg-gray-50 prose text-left"
                         dangerouslySetInnerHTML={{ __html: getProvisionText(selectedPair?.left, highlightTab) }} />
                    {/* Right (paired) */}
                    <div className="border p-4 rounded bg-gray-50 prose text-left"
                         dangerouslySetInnerHTML={{ __html: getProvisionText(selectedPair?.right, highlightTab) }} />
                    {/* Comparison column */}
                    {highlightTab !== "default" && (
                      <div className="border p-4 rounded bg-gray-50 overflow-auto whitespace-pre-line text-gray-700 text-left">
                        <div
                          dangerouslySetInnerHTML={{
                            __html: marked.parse(
                              normalizeMarkdown((comparison && comparison[highlightTab]) || "No comparison text available")
                            ),
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Highlight CSS */}
          <style>{`
            .who { background-color: blue; color: white; font-weight: bold; }
            .when { background-color: orange; color: white; font-weight: bold; }
            .how { background-color: green; color: white; font-weight: bold; }
            .where { background-color: fuchsia; color: white; font-weight: bold; }
            .tone { background-color: darkorange; color: white; font-weight: bold; }
            .penalty { background-color: red; color: white; font-weight: bold; }
          `}</style>
        </div>
      </div>
    </div>
  );
}
