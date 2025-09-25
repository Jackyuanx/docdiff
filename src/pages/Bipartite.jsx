import React, { useMemo } from "react";
import { ResponsiveContainer, Tooltip, Sankey } from "recharts";
import tocNSW from "../backend/NSW_toc.json";
import tocVIC from "../backend/VIC_toc.json";
import pairsNSW from "../backend/nsw-vic-0.7.json";
import pairsVIC from "../backend/vic-nsw-0.7.json";
import { groupIdsByPart } from "../utils/grouping";

// --- helpers (same semantics as EmbeddingMatrix) ---
function extractProvisionMeta(toc) {
  const meta = {};
  toc.forEach((chapter) => {
    const chapterId = chapter.id || "";
    if (!chapter.parts) return;
    Object.values(chapter.parts).forEach((part) => {
      const partId = part.id || "";
      const partTitle = part.title || partId;
      (part.provisions || []).forEach((prov) => {
        const pid = prov.id;
        meta[pid] = { chapterId, partId, partTitle };
      });
    });
  });
  return meta;
}

function groupIdsByChapter(ids, metaMap) {
  const byChapter = new Map();
  ids.forEach((id) => {
    const m = metaMap[id] || {};
    const chapterId = m.chapterId || "(Unknown Chapter)";
    if (!byChapter.has(chapterId)) {
      byChapter.set(chapterId, { key: chapterId, label: chapterId, items: [] });
    }
    byChapter.get(chapterId).items.push(id);
  });
  return Array.from(byChapter.values());
}

function buildMatchedProvisionSets() {
  const matchedNSW = new Set();
  const matchedVIC = new Set();
  const matchMap = {};
  for (const pair of pairsNSW) {
    if (pair.similar.length > 0) {
      matchedNSW.add(pair.id);
      matchMap[pair.id] = new Set(pair.similar);
      pair.similar.forEach((vic) => matchedVIC.add(vic));
    }
  }
  for (const pair of pairsVIC) {
    if (pair.similar.length > 0) {
      matchedVIC.add(pair.id);
      if (!matchMap[pair.id]) matchMap[pair.id] = new Set();
      pair.similar.forEach((nsw) => {
        matchedNSW.add(nsw);
        matchMap[nsw] = matchMap[nsw] || new Set();
        matchMap[nsw].add(pair.id);
      });
    }
  }
  return {
    nswList: Array.from(matchedNSW),
    vicList: Array.from(matchedVIC),
    matchMap,
  };
}
// --------------------------------------------------

const OutwardLabelNode = (props) => {
  const { x, y, width, height, index, payload } = props;
  const fill = payload?.fill || "#888";
  const cx = x;
  const cy = y;
  const w = width;
  const h = height;
  const side = payload?.side; // "NSW" or "VIC"
  const label = payload?.name || "";
  const isLeft = side === "NSW"; // NSW on the left layer
  const textX = isLeft ? cx - 8 : cx + w + 8;
  const anchor = isLeft ? "end" : "start";
  return (
    <g>
      <rect x={cx} y={cy} width={w} height={h} fill={fill} fillOpacity={0.85} />
      <text
        x={textX}
        y={cy + h / 2}
        textAnchor={anchor}
        dominantBaseline="middle"
        className="fill-black text-[12px]"
      >
        {label}
      </text>
    </g>
  );
};

export default function Bipartite() {
  const { nswList, vicList, matchMap } = buildMatchedProvisionSets();
  const metaNSW = extractProvisionMeta(tocNSW);
  const metaVIC = extractProvisionMeta(tocVIC);

  const nswGroupsRaw = useMemo(() => groupIdsByChapter(nswList, metaNSW), [nswList]);
  const vicGroupsRaw = useMemo(() => groupIdsByChapter(vicList, metaVIC), [vicList]);

  const { counts, maxCount, nswWeights, vicWeights } = useMemo(() => {
    const nswGroupMap = new Map(nswGroupsRaw.map((g) => [g.key, new Set(g.items)]));
    const vicGroupMap = new Map(vicGroupsRaw.map((g) => [g.key, new Set(g.items)]));
    const c = new Map();
    let m = 0;
    const nswWeights = new Map();
    const vicWeights = new Map();
    nswGroupsRaw.forEach((ng) => {
      vicGroupsRaw.forEach((vg) => {
        let cnt = 0;
        const nswSet = nswGroupMap.get(ng.key);
        const vicSet = vicGroupMap.get(vg.key);
        nswSet.forEach((nswId) => {
          const sims = matchMap[nswId];
          if (!sims) return;
          sims.forEach((vicId) => {
            if (vicSet.has(vicId)) cnt += 1;
          });
        });
        const key = `${ng.key}|||${vg.key}`;
        c.set(key, cnt);
        if (cnt > 0) {
          nswWeights.set(ng.key, (nswWeights.get(ng.key) || 0) + cnt);
          vicWeights.set(vg.key, (vicWeights.get(vg.key) || 0) + cnt);
        }
        if (cnt > m) m = cnt;
      });
    });
    return { counts: c, maxCount: m, nswWeights, vicWeights };
  }, [nswGroupsRaw, vicGroupsRaw, matchMap]);

  const parseChapterNum = (chapterId) => {
    if (!chapterId) return Number.POSITIVE_INFINITY;
    const m = String(chapterId).match(/(chapter|ch)\s*(\d+(?:\.\d+)?)/i);
    if (m && m[2]) return parseFloat(m[2]);
    const m2 = String(chapterId).match(/(\d+(?:\.\d+)?)/);
    return m2 ? parseFloat(m2[1]) : Number.POSITIVE_INFINITY;
  };

  const nswGroups = useMemo(() => {
    const arr = [...nswGroupsRaw];
    return arr.sort((a, b) => {
      const ca = parseChapterNum(a.key);
      const cb = parseChapterNum(b.key);
      if (ca !== cb) return ca - cb;
      return String(a.key).localeCompare(String(b.key));
    });
  }, [nswGroupsRaw]);
  const vicGroups = useMemo(() => {
    const arr = [...vicGroupsRaw];
    return arr.sort((a, b) => {
      const ca = parseChapterNum(a.key);
      const cb = parseChapterNum(b.key);
      if (ca !== cb) return ca - cb;
      return String(a.key).localeCompare(String(b.key));
    });
  }, [vicGroupsRaw]);

  // Build Sankey nodes (NSW first, then VIC) and links
  const { nodes, links } = useMemo(() => {
    const nswNodes = nswGroups.map((g, idx) => ({
      id: g.key,
      name: g.key, // chapter only
      side: "NSW",
      fill: "#b91c1c",
      order: idx,
    }));
    const vicNodes = vicGroups.map((g, idx) => ({
      id: g.key,
      name: g.key, // chapter only
      side: "VIC",
      fill: "#2563eb",
      order: idx,
    }));

    const nodes = [...nswNodes, ...vicNodes];
    const indexOf = new Map(nodes.map((n, i) => [n.id, i]));

    // Build links with positive counts; optionally keep top-K for readability
    const allLinks = [];
    counts.forEach((val, k) => {
      if (val <= 0) return;
      const [nswKey, vicKey] = k.split("|||");
      const s = indexOf.get(nswKey);
      const t = indexOf.get(vicKey);
      if (s == null || t == null) return;
      allLinks.push({ source: s, target: t, value: val });
    });

    // Optional pruning: keep top 500 links
    allLinks.sort((a, b) => b.value - a.value);
    const links = allLinks.slice(0, 500);

    return { nodes, links };
  }, [nswGroups, vicGroups, counts]);

  // Heuristic chart height: base + per-node
  const height = Math.max(480, 24 * Math.max(nodes.length, 10));

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Provision Match Sankey (NSW → VIC)</h2>
      <div className="border bg-white p-2 h-[80vh] min-h-[520px] overflow-x-auto">
        <div style={{ width: 1800, height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={{ nodes, links }}
            nodePadding={16}
            nodeWidth={14}
            iterations={64}
            linkCurvature={0.5}
            margin={{ top: 20, right: 500, bottom: 20, left: 500 }}
            nodeSort={null}
            node={<OutwardLabelNode />}
          >
            <Tooltip formatter={(v, _n, p) => [v, `${p?.payload?.source?.name} → ${p?.payload?.target?.name}`]} />
          </Sankey>
        </ResponsiveContainer>
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-2">
        Links show match counts (top 500). Colors: NSW nodes red, VIC nodes blue.
      </div>
    </div>
  );
}
