import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/NavBar";

const FLAT_JSONL_URL   = "../../server-files/road/processed/road_michigan_flat.jsonl";
const MIC_NSW_TOP5_URL = "../../server-files/road/processed/mic_top5.json";      // [{ id, doc:"mic", top5:[{id,score},...] }, ...]
const MIC_VIC_TOP5_URL = "../../server-files/road/processed/mic_vic_top5.json";  // optional, same shape

async function fetchJsonl(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const text = await res.text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
async function fetchJson(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export default function MichiganProvision() {
  const { micId } = useParams(); // /road/mic/:micId
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState("");

  const [prov, setProv] = useState(null);
  const [nswTop5, setNswTop5] = useState(null);
  const [vicTop5, setVicTop5] = useState(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setBootError("");

        // 1) Load provision from JSONL
        const rows = await fetchJsonl(FLAT_JSONL_URL, ac.signal);
        const theProv = rows.find(
          (r) => r.level === "provision" && String(r.id) === String(micId)
        );
        setProv(theProv || null);

        // 2) Load MIC→NSW top5 (required)
        let nswRows = [];
        try {
          nswRows = await fetchJson(MIC_NSW_TOP5_URL, ac.signal);
        } catch (_) { /* optional error */ }
        const nswEntry = Array.isArray(nswRows)
          ? nswRows.find((row) => row.doc === "mic" && String(row.id) === String(micId))
          : null;
        setNswTop5(nswEntry?.top5 || []);

        // 3) Load MIC→VIC top5 (optional)
        let vicRows = [];
        try {
          vicRows = await fetchJson(MIC_VIC_TOP5_URL, ac.signal);
        } catch (_) { /* optional file may not exist */ }
        const vicEntry = Array.isArray(vicRows)
          ? vicRows.find((row) => row.doc === "mic" && String(row.id) === String(micId))
          : null;
        setVicTop5(vicEntry?.top5 || []);
      } catch (e) {
        if (e.name !== "AbortError") setBootError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [micId]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-4">
          <Link to="/road/mic" className="text-sm text-blue-700 hover:underline">
            ← Back to Michigan index
          </Link>
        </div>

        {loading && <div>Loading…</div>}
        {bootError && <div className="text-red-600">Failed to load: {bootError}</div>}

        {!loading && !bootError && (
          <>
            <h1 className="text-2xl font-bold mb-2">
              {prov?.id || micId} {prov?.title ? `— ${prov.title}` : ""}
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Provision body */}
              <div className="md:col-span-2 bg-white rounded-lg shadow-sm border p-4">
                {prov?.text ? (
                  <pre className="whitespace-pre-wrap text-sm text-gray-900">
                    {prov.text}
                  </pre>
                ) : (
                  <div className="text-sm text-gray-500">
                    (No provision text found in JSONL.)
                  </div>
                )}
              </div>

              {/* Top-5 matches */}
              <div className="md:col-span-1 space-y-6">
                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <div className="font-semibold mb-2">Top 5 matches in NSW</div>
                  {nswTop5 && nswTop5.length > 0 ? (
                    <ol className="space-y-1 list-decimal list-inside">
                      {nswTop5.map((m, i) => (
                        <li key={`nsw-${m.id}-${i}`} className="flex items-center justify-between">
                          <Link
                            to={`/road/nsw/${encodeURIComponent(m.id)}`}
                            className="text-blue-700 hover:underline font-mono text-xs"
                            title={m.id}
                          >
                            {m.id}
                          </Link>
                          <span className="text-xs text-gray-500 ml-2">
                            {m.score.toFixed(3)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-sm text-gray-500">(No NSW top-5 available)</div>
                  )}
                </div>

                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <div className="font-semibold mb-2">Top 5 matches in VIC</div>
                  {vicTop5 && vicTop5.length > 0 ? (
                    <ol className="space-y-1 list-decimal list-inside">
                      {vicTop5.map((m, i) => (
                        <li key={`vic-${m.id}-${i}`} className="flex items-center justify-between">
                          <Link
                            to={`/road/vic/${encodeURIComponent(m.id)}`}
                            className="text-blue-700 hover:underline font-mono text-xs"
                            title={m.id}
                          >
                            {m.id}
                          </Link>
                          <span className="text-xs text-gray-500 ml-2">
                            {m.score.toFixed(3)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-sm text-gray-500">(No VIC top-5 available)</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
