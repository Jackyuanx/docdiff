import React, { useEffect, useMemo, useRef, useState } from "react";


export default function Climate() {
  const [ncrParas, setNcrParas] = useState([]);       // [{doc_id, para_id, text}, ...]
  const [sinParas, setSinParas] = useState([]);
  const [ncrCounts, setNcrCounts] = useState([]);     // aligned to ncrParas index
  const [sinCounts, setSinCounts] = useState([]);     // aligned to sinParas index

  const [selected, setSelected] = useState({ side: null, para_id: null });
  const [matches, setMatches] = useState([]);         // pairs from /pairs
  const [matchedParagraphs, setMatchedParagraphs] = useState([]); // array of text
  const [selectedPair, setSelectedPair] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const ncrRefs = useRef([]);
  const sinRefs = useRef([]);

  // quick lookups: para_id -> text
  const ncrTextById = useMemo(() => {
    const m = new Map();
    ncrParas.forEach(p => m.set(p.para_id, p.text));
    return m;
  }, [ncrParas]);

  const sinTextById = useMemo(() => {
    const m = new Map();
    sinParas.forEach(p => m.set(p.para_id, p.text));
    return m;
  }, [sinParas]);

  // load paragraphs and counts (only 4 calls total)
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [ncrRes, sinRes] = await Promise.all([
          fetch(`/api/paragraphs/ncr`),
          fetch(`/api/paragraphs/singapore`)
        ]);
        if (!ncrRes.ok || !sinRes.ok) throw new Error("Failed to fetch paragraphs");

        const [ncr, sin] = await Promise.all([ncrRes.json(), sinRes.json()]);
        setNcrParas(ncr || []);
        setSinParas(sin || []);

        // fetch counts (2 calls)
        const [ncrCntRes, sinCntRes] = await Promise.all([
          fetch(`/api/pair_counts/ncr`),
          fetch(`/api/pair_counts/singapore`)
        ]);
        if (!ncrCntRes.ok || !sinCntRes.ok) throw new Error("Failed to fetch counts");
        const [ncrCntMap, sinCntMap] = await Promise.all([ncrCntRes.json(), sinCntRes.json()]);

        // convert dict (para_id->count) into arrays aligned by paragraph order
        const ncrArr = ncr.map(p => ncrCntMap[p.para_id] || 0);
        const sinArr = sin.map(p => sinCntMap[p.para_id] || 0);
        setNcrCounts(ncrArr);
        setSinCounts(sinArr);
      } catch (e) {
        console.error(e);
        setError(e.message || "Load failed");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // helpers
  const filteredNcr = ncrParas.filter(p => (p.text || "").toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredSin = sinParas.filter(p => (p.text || "").toLowerCase().includes(searchTerm.toLowerCase()));

  const scrollToParagraph = (side, index) => {
    const refArray = side === "ncr" ? ncrRefs.current : sinRefs.current;
    if (refArray[index]) refArray[index].scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const isHighlighted = (side, text) => {
    if (selected.side && selected.side === side) {
      const arr = side === "ncr" ? ncrParas : sinParas;
      const idx = arr.findIndex(p => p.text === text);
      if (idx !== -1 && selected.para_id === arr[idx].para_id) return true;
    }
    // highlight if in matches
    const arr = side === "ncr" ? ncrParas : sinParas;
    const idx = arr.findIndex(p => p.text === text);
    if (idx === -1) return false;
    const paraId = arr[idx].para_id;
    return side === "ncr"
      ? matches.some(m => m.text_b === paraId)
      : matches.some(m => m.text_a === paraId);
  };

  // click: 1 call to /pairs, and build the matched texts from lookups
  const handleClick = async (side, paraObj) => {
    try {
      const docName = side === "ncr" ? "ncr" : "singapore"; // IMPORTANT FIX
      setSelected({ side, para_id: paraObj.para_id });

      const res = await fetch(`/api/pairs?doc=${docName}&para_id=${paraObj.para_id}&size=1000`);
      if (!res.ok) throw new Error("Failed to fetch pairs");
      const data = await res.json();
      setMatches(data);

      // Build the matched text list from the opposite doc
      if (side === "ncr") {
        setMatchedParagraphs(data.map(p => sinTextById.get(p.text_a) || `(missing #${p.text_a})`));
      } else {
        setMatchedParagraphs(data.map(p => ncrTextById.get(p.text_b) || `(missing #${p.text_b})`));
      }
    } catch (e) {
      console.error(e);
      setMatches([]);
      setMatchedParagraphs([]);
    }
  };

  const handlePairClick = (paraText) => {
    if (!selected.side) return;
    // find the pair for this shown "other side" text
    let pair = null;
    if (selected.side === "ncr") {
      pair = matches.find(m => (sinTextById.get(m.text_a) || "") === paraText);
    } else {
      pair = matches.find(m => (ncrTextById.get(m.text_b) || "") === paraText);
    }
    if (pair) setSelectedPair({
      text_b: ncrTextById.get(pair.text_b),
      text_a: sinTextById.get(pair.text_a),
      similarity: pair.similarity,
      d_4: pair.d_4
    });
  };

  const closeModal = () => setSelectedPair(null);

  // UI states
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">Loading climate reports…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[95vw] mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6 text-center">Climate Reports Comparison</h1>

        {/* Search */}
        <div className="flex justify-center mb-6">
          <input
            type="text"
            placeholder="Search paragraphs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-1/2 px-4 py-2 border rounded shadow-sm bg-white text-black focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex gap-4">
          {/* Left Minimap (NCR) */}
          {searchTerm === "" && (
            <div className="relative w-4 h-[80vh]">
              {ncrParas.map((p, i) => {
                const pct = ncrParas.length > 1 ? (i / (ncrParas.length - 1)) * 100 : 0;
                return (
                  <div
                    key={p.para_id}
                    onClick={() => scrollToParagraph("ncr", i)}
                    style={{ top: `${pct}%` }}
                    className={`absolute left-0 w-full h-[6px] cursor-pointer ${
                      isHighlighted("ncr", p.text)
                        ? "bg-blue-600"
                        : (ncrCounts[i] || 0) > 0
                        ? "bg-blue-300"
                        : "bg-gray-300"
                    }`}
                  />
                );
              })}
            </div>
          )}

          {/* Left Column NCR */}
          <div className={`border rounded bg-white shadow p-6 h-[80vh] overflow-y-auto transition-all duration-300 flex-1 ${
            selected.side ? "w-[30%]" : "w-[50%]"
          }`}>
            <h2 className="text-xl font-semibold mb-4">UAE Report</h2>
            {ncrParas
              .filter(p => (p.text || "").toLowerCase().includes(searchTerm.toLowerCase()))
              .map((p) => {
                const i = ncrParas.findIndex(x => x.para_id === p.para_id);
                return (
                  <div
                    key={p.para_id}
                    ref={(el) => (ncrRefs.current[i] = el)}
                    className={`mb-4 cursor-pointer px-2 py-1 rounded transition flex justify-between items-start text-left ${
                      isHighlighted("ncr", p.text) ? "bg-blue-100" : "hover:bg-blue-50"
                    }`}
                    onClick={() => handleClick("ncr", p)}
                  >
                    <span className="flex-1">{p.text}</span>
                    <span className={`ml-2 text-xs font-bold px-2 py-1 rounded-full ${
                      (ncrCounts[i] || 0) > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-500"
                    }`}>
                      {ncrCounts[i] || 0}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Right Column Singapore */}
          <div className={`border rounded bg-white shadow p-6 h-[80vh] overflow-y-auto transition-all duration-300 flex-1 ${
            selected.side ? "w-[30%]" : "w-[50%]"
          }`}>
            <h2 className="text-xl font-semibold mb-4">Singapore Report</h2>
            {sinParas
              .filter(p => (p.text || "").toLowerCase().includes(searchTerm.toLowerCase()))
              .map((p) => {
                const i = sinParas.findIndex(x => x.para_id === p.para_id);
                return (
                  <div
                    key={p.para_id}
                    ref={(el) => (sinRefs.current[i] = el)}
                    className={`mb-4 cursor-pointer px-2 py-1 rounded transition flex justify-between items-start text-left ${
                      isHighlighted("sin", p.text) ? "bg-green-100" : "hover:bg-green-50"
                    }`}
                    onClick={() => handleClick("sin", p)}
                  >
                    <span className="flex-1">{p.text}</span>
                    <span className={`ml-2 text-xs font-bold px-2 py-1 rounded-full ${
                      (sinCounts[i] || 0) > 0 ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"
                    }`}>
                      {sinCounts[i] || 0}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Right Minimap (SIN) */}
          {searchTerm === "" && (
            <div className="relative w-4 h-[80vh]">
              {sinParas.map((p, i) => {
                const pct = sinParas.length > 1 ? (i / (sinParas.length - 1)) * 100 : 0;
                return (
                  <div
                    key={p.para_id}
                    onClick={() => scrollToParagraph("sin", i)}
                    style={{ top: `${pct}%` }}
                    className={`absolute left-0 w-full h-[8px] cursor-pointer ${
                      isHighlighted("sin", p.text)
                        ? "bg-green-600"
                        : (sinCounts[i] || 0) > 0
                        ? "bg-green-300"
                        : "bg-gray-300"
                    }`}
                  />
                );
              })}
            </div>
          )}

          {/* Third Column: Matched paragraphs */}
          {selected.side && (
            <div className="border rounded bg-white shadow p-6 h-[80vh] overflow-y-auto w-[30%]">
              <h2 className="text-xl font-semibold mb-4">Matched Paragraphs</h2>
              {matchedParagraphs.length === 0 ? (
                <p className="text-gray-500 italic text-left">No paired paragraphs.</p>
              ) : (
                matchedParagraphs.map((para, idx) => (
                  <div
                    key={idx}
                    className={`mb-4 px-2 py-1 rounded cursor-pointer transition text-black text-left ${
                      selected.side === "ncr" ? "bg-green-50 hover:bg-green-100" : "bg-blue-50 hover:bg-blue-100"
                    }`}
                    onClick={() => handlePairClick(para)}
                  >
                    {para}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {selectedPair && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-5xl w-full">
            <h2 className="text-xl font-semibold mb-4 text-center">Paragraph Comparison</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="border p-4 rounded bg-blue-50">
                <h3 className="font-semibold mb-2">UAE</h3>
                <p className="text-left">{selectedPair.text_b}</p>
              </div>
              <div className="border p-4 rounded bg-green-50">
                <h3 className="font-semibold mb-2">Singapore</h3>
                <p className="text-left">{selectedPair.text_a}</p>
              </div>
              <div className="border p-4 rounded">
                <h3 className="font-semibold mb-2">Comparison</h3>
                <p className="text-left">
                  {typeof selectedPair.similarity === "number"
                    ? `Similarity: ${selectedPair.similarity.toFixed(3)}`
                    : "No comparison available."}
                </p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setSelectedPair(null)} className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-400">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}