import React, { useEffect, useMemo, useState } from "react";
import Fuse from "fuse.js";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/NavBar";

const FLAT_JSONL_URL = "../../server-files/road/processed/road_michigan_flat.jsonl";

// Parse JSONL text into an array of objects
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

// Build a nested tree (acts → chapters → provisions) from flat rows using parent_uid
function buildTree(rows) {
  const byUid = new Map();
  rows.forEach((r) => byUid.set(r.uid, { ...r, children: [] }));
  const roots = [];

  rows.forEach((r) => {
    const node = byUid.get(r.uid);
    if (r.parent_uid && byUid.has(r.parent_uid)) {
      byUid.get(r.parent_uid).children.push(node);
    } else if (r.level === "act") {
      roots.push(node);
    }
  });

  // sort chapters/provisions by id (numeric-friendly where possible)
  const sortById = (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: "base" });
  const dfsSort = (n) => {
    n.children.sort(sortById);
    n.children.forEach(dfsSort);
  };
  roots.forEach(dfsSort);

  return roots;
}

// Flatten provisions (for search)
function flattenProvisions(tree) {
  const out = [];
  const walk = (n, ctx = {}) => {
    if (n.level === "provision") {
      out.push({
        id: n.id || "",
        title: n.title || "",
        text: n.text || "",
        chapterId: ctx.chapterId || "",
        actId: ctx.actId || "",
      });
    }
    const nextCtx = {
      actId: n.level === "act" ? n.id : ctx.actId,
      chapterId: n.level === "chapter" ? n.id : ctx.chapterId,
    };
    n.children.forEach((c) => walk(c, nextCtx));
  };
  tree.forEach((r) => walk(r));
  return out;
}

export default function MichiganIndex() {
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState("");
  const [tree, setTree] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setBootError("");
        const rows = await fetchJsonl(FLAT_JSONL_URL, ac.signal);
        const t = buildTree(rows);
        setTree(t);
      } catch (e) {
        if (e.name !== "AbortError") setBootError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  const allProvisions = useMemo(() => flattenProvisions(tree), [tree]);

  const fuse = useMemo(() => {
    if (!allProvisions.length) return null;
    return new Fuse(allProvisions, {
      keys: [
        { name: "id", weight: 0.65 },
        { name: "title", weight: 0.35 },
      ],
      threshold: 0.25,
      ignoreLocation: true,
    });
  }, [allProvisions]);

  const searchResults = useMemo(() => {
    if (!searchTerm || !fuse) return null;
    return fuse.search(searchTerm).map((r) => r.item);
  }, [searchTerm, fuse]);

  const handleProvisionClick = (provId) => {
    navigate(`/road/mic/${encodeURIComponent(provId)}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 w-full">
        <Navbar />
        <div className="p-8">Loading Michigan Vehicle Code…</div>
      </div>
    );
  }
  if (bootError) {
    return (
      <div className="min-h-screen bg-gray-50 w-full">
        <Navbar />
        <div className="p-8 text-red-600">Failed to load: {bootError}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 w-full">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Michigan Vehicle Code</h1>

        <input
          type="text"
          placeholder="Search provisions by ID or title…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-6 px-4 py-2 border rounded w-full"
        />

        {/* If searching, show a flat list of provision hits */}
        {searchResults ? (
          <div className="space-y-1">
            {searchResults.slice(0, 400).map((p) => (
              <div
                key={`hit-${p.id}`}
                className="p-2 rounded hover:bg-gray-100 cursor-pointer"
                onClick={() => handleProvisionClick(p.id)}
                title={`${p.id} — ${p.title}`}
              >
                <span className="font-mono text-sm text-gray-700 mr-2">{p.id}</span>
                <span className="text-gray-900">{p.title}</span>
              </div>
            ))}
            {searchResults.length === 0 && (
              <div className="text-sm text-gray-500">No results.</div>
            )}
          </div>
        ) : (
          // Full tree (Acts → Chapters → Provisions)
          <div className="space-y-6">
            {tree.map((act) => (
              <div key={act.uid} className="bg-white rounded-lg shadow-sm border">
                <div className="px-4 py-3 border-b">
                  <div className="text-xs text-gray-500">{String(act.id).trim()}</div>
                  <div className="font-semibold">{act.title}</div>
                </div>
                <div className="p-4 space-y-6">
                  {act.children.map((ch) => (
                    <div key={ch.uid}>
                      <div className="font-semibold text-blue-700 mb-2">
                        {ch.id}: {ch.title}
                      </div>
                      <div className="space-y-1">
                        {ch.children.map((p) => (
                          <div
                            key={p.uid}
                            className="p-2 rounded hover:bg-gray-100 cursor-pointer"
                            onClick={() => handleProvisionClick(p.id)}
                            title={`${p.id} — ${p.title}`}
                          >
                            <span className="font-mono text-sm text-gray-700 mr-2">
                              {p.id}
                            </span>
                            <span className="text-gray-900">{p.title}</span>
                          </div>
                        ))}
                        {ch.children.length === 0 && (
                          <div className="text-sm text-gray-500">No provisions in this chapter.</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}