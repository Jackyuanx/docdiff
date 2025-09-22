import React, { useState, useMemo, useEffect } from "react";
import Fuse from "fuse.js";
import { useNavigate } from "react-router-dom";
import TreeNodeRoad from "../components/TreeNodeRoad";
import Navbar from "../components/NavBar";

// ---- API base --------------------------------------------------------------
const API_BASE = "https://docdiff.mooo.com";

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

// -------- helpers ------------------------------------------------------------

function flattenData(data) {
  const items = [];
  (data || []).forEach((part) => {
    items.push({ ...part, type: "part" });
    if (part.divisions) {
      Object.values(part.divisions).forEach((division) => {
        items.push({ ...division, type: "division", parentId: part.id });
        if (division.provisions) {
          division.provisions.forEach((prov) => {
            items.push({ ...prov, type: "provision", parentId: division.id });
          });
        }
      });
    }
  });
  return items;
}

function allProvisionIdsRoad(toc) {
  const ids = [];
  (toc || []).forEach((part) => {
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

function bucketToLevel(sim) {
  const key = Number(sim).toFixed(1);
  if (key === "0.7") return "low";
  if (key === "0.8") return "medium";
  if (key === "0.9") return "high";
  return null;
}

function buildThresholdsFromMergedPairs(pairs, tocNSW, tocVIC) {
  const mkLevelMap = () => new Map();
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

  // Ensure every provision exists with [] so TreeNodeRoad can render consistently
  const allNSW = allProvisionIdsRoad(tocNSW);
  const allVIC = allProvisionIdsRoad(tocVIC);
  ["low", "medium", "high"].forEach((lvl) => {
    const nswMap = maps[lvl].nsw;
    const vicMap = maps[lvl].vic;
    allNSW.forEach((id) => ensure(nswMap, id));
    allVIC.forEach((id) => ensure(vicMap, id));
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

// -------- component ----------------------------------------------------------

export default function Home() {
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  // remote data
  const [tocNSW, setTocNSW] = useState(null);
  const [tocVIC, setTocVIC] = useState(null);
  const [mergedPairs, setMergedPairs] = useState(null);

  const [loadingBoot, setLoadingBoot] = useState(true);
  const [bootError, setBootError] = useState("");

  // bootstrap fetch
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

  const fuseNSW = useMemo(() => {
    if (!tocNSW) return null;
    return new Fuse(flattenData(tocNSW), {
      keys: ["id", "title"],
      threshold: 0.2,
      ignoreLocation: true,
    });
  }, [tocNSW]);

  const fuseVIC = useMemo(() => {
    if (!tocVIC) return null;
    return new Fuse(flattenData(tocVIC), {
      keys: ["id", "title"],
      threshold: 0.2,
      ignoreLocation: true,
    });
  }, [tocVIC]);

  const searchResultsNSW = useMemo(() => {
    if (!searchTerm || !fuseNSW) return null;
    return fuseNSW.search(searchTerm).map((r) => r.item.id);
  }, [searchTerm, fuseNSW]);

  const searchResultsVIC = useMemo(() => {
    if (!searchTerm || !fuseVIC) return null;
    return fuseVIC.search(searchTerm).map((r) => r.item.id);
  }, [searchTerm, fuseVIC]);

  const handleProvisionClick = (jurisdiction, id) => {
    navigate(`/road/${jurisdiction}/${id}`);
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
      <div className="w-full max-w-[95vw] mx-auto p-8">
        <input
          type="text"
          placeholder="Search by ID or title..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-6 px-4 py-2 border rounded w-full"
        />

        {/* fixed 50/50 columns */}
        <div className="flex w-full gap-8">
          <div className="w-1/2 flex-none border-r pr-4 break-words">
            <h2 className="text-xl font-semibold mb-2">NSW Road Regulation</h2>
            {tocNSW.map((part) => (
              <TreeNodeRoad
                key={part.id}
                node={part}
                searchTerm={searchTerm}
                searchResults={searchResultsNSW}
                onProvisionClick={(id) => handleProvisionClick("nsw", id)}
                thresholds={thresholds}
                jurisdiction="nswRoad"
              />
            ))}
          </div>

          <div className="w-1/2 flex-none pl-4 break-words">
            <h2 className="text-xl font-semibold mb-2">Victoria Road Regulation</h2>
            {tocVIC.map((part) => (
              <TreeNodeRoad
                key={part.id}
                node={part}
                searchTerm={searchTerm}
                searchResults={searchResultsVIC}
                onProvisionClick={(id) => handleProvisionClick("vic", id)}
                thresholds={thresholds}
                jurisdiction="vicRoad"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
