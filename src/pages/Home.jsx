import React, { useMemo, useState, useEffect } from "react";
import Fuse from "fuse.js";
import { useNavigate } from "react-router-dom";
import TreeNode from "../components/TreeNode";
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

// --- helpers ---------------------------------------------------------------
function flattenDataForSearch(data) {
  const items = [];
  data.forEach((chapter) => {
    items.push({ ...chapter, type: "chapter" });
    if (chapter.parts) {
      Object.values(chapter.parts).forEach((part) => {
        items.push({ ...part, type: "part", parentId: chapter.id });
        if (part.provisions) {
          part.provisions.forEach((prov) => {
            items.push({ ...prov, type: "provision", parentId: part.id });
          });
        }
      });
    }
  });
  return items;
}

function allProvisionIds(toc) {
  const ids = [];
  toc.forEach((chapter) => {
    if (chapter.parts) {
      Object.values(chapter.parts).forEach((part) => {
        if (part.provisions) {
          part.provisions.forEach((p) => ids.push(p.id));
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
  const mkLevelMap = () => new Map(); // id -> Set(ids)
  const maps = {
    low: { nsw: mkLevelMap(), vic: mkLevelMap() },
    medium: { nsw: mkLevelMap(), vic: mkLevelMap() },
    high: { nsw: mkLevelMap(), vic: mkLevelMap() },
  };
  const ensureInMap = (map, id) => { if (!map.has(id)) map.set(id, new Set()); };

  (pairs || []).forEach((p) => {
    const level = bucketToLevel(p.similarity);
    if (!level) return;
    const a = p.id_1, b = p.id_2;
    const aIsNSW = a.endsWith("_NSW");
    const bIsNSW = b.endsWith("_NSW");
    const aIsVIC = a.endsWith("_Victoria");
    const bIsVIC = b.endsWith("_Victoria");

    if (aIsNSW && bIsVIC) { ensureInMap(maps[level].nsw, a); maps[level].nsw.get(a).add(b); }
    else if (aIsVIC && bIsNSW) { ensureInMap(maps[level].nsw, b); maps[level].nsw.get(b).add(a); }

    if (aIsVIC && bIsNSW) { ensureInMap(maps[level].vic, a); maps[level].vic.get(a).add(b); }
    else if (aIsNSW && bIsVIC) { ensureInMap(maps[level].vic, b); maps[level].vic.get(b).add(a); }
  });

  const allNSW = allProvisionIds(tocNSW);
  const allVIC = allProvisionIds(tocVIC);
  ["low", "medium", "high"].forEach((lvl) => {
    const nswMap = maps[lvl].nsw;
    const vicMap = maps[lvl].vic;
    allNSW.forEach((id) => ensureInMap(nswMap, id));
    allVIC.forEach((id) => ensureInMap(vicMap, id));
  });

  const toArray = (m) => Array.from(m.entries()).map(([id, set]) => ({ id, similar: Array.from(set) }));
  return {
    low:   { nsw: toArray(maps.low.nsw),   vic: toArray(maps.low.vic) },
    medium:{ nsw: toArray(maps.medium.nsw),vic: toArray(maps.medium.vic) },
    high:  { nsw: toArray(maps.high.nsw),  vic: toArray(maps.high.vic) },
  };
}

// --- component -------------------------------------------------------------
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
        getJSON("/toc/nsw", ac.signal),
        getJSON("/toc/vic", ac.signal),
        getJSON("/whs_pairs", ac.signal),
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


  // Build thresholds from merged pairs once data is present
  const thresholds = useMemo(() => {
    if (!mergedPairs || !tocNSW || !tocVIC) return null;
    return buildThresholdsFromMergedPairs(mergedPairs, tocNSW, tocVIC);
  }, [mergedPairs, tocNSW, tocVIC]);

  const fuseNSW = useMemo(() => {
    if (!tocNSW) return null;
    return new Fuse(flattenDataForSearch(tocNSW), {
      keys: ["id", "title"],
      threshold: 0.2,
      ignoreLocation: true,
    });
  }, [tocNSW]);

  const fuseVIC = useMemo(() => {
    if (!tocVIC) return null;
    return new Fuse(flattenDataForSearch(tocVIC), {
      keys: ["id", "title"],
      threshold: 0.2,
      ignoreLocation: true,
    });
  }, [tocVIC]);

  const searchResultsNSW = useMemo(() => {
    if (!searchTerm || !fuseNSW) return null;
    return fuseNSW.search(searchTerm).map((res) => res.item.id);
  }, [searchTerm, fuseNSW]);

  const searchResultsVIC = useMemo(() => {
    if (!searchTerm || !fuseVIC) return null;
    return fuseVIC.search(searchTerm).map((res) => res.item.id);
  }, [searchTerm, fuseVIC]);

  const handleProvisionClick = (jurisdiction, id) => {
    navigate(`/compare/${jurisdiction}/${id}`);
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
            <h2 className="text-xl font-semibold mb-2">NSW WHS Regulation</h2>
            {tocNSW.map((chapter) => (
              <TreeNode
                key={chapter.id}
                node={chapter}
                searchTerm={searchTerm}
                searchResults={searchResultsNSW}
                onProvisionClick={(id) => handleProvisionClick("nsw", id)}
                thresholds={thresholds}
                jurisdiction="nsw"
              />
            ))}
          </div>

          <div className="w-1/2 flex-none pl-4 break-words">
            <h2 className="text-xl font-semibold mb-2">Victoria WHS Regulation</h2>
            {tocVIC.map((chapter) => (
              <TreeNode
                key={chapter.id}
                node={chapter}
                searchTerm={searchTerm}
                searchResults={searchResultsVIC}
                onProvisionClick={(id) => handleProvisionClick("vic", id)}
                thresholds={thresholds}
                jurisdiction="vic"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}