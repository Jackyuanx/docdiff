import React, { useState } from "react";
import tocNSW from "../backend/NSW_toc.json";
import tocVIC from "../backend/VIC_toc.json";
import pairsNSW from "../backend/nsw-vic-0.7.json";
import pairsVIC from "../backend/vic-nsw-0.7.json";
import comparisonResults from "../backend/comparisons.json";
import { groupIdsByPart } from "../utils/grouping.jsx";

function extractProvisionMeta(toc, suffix) {
  // Returns a map: provisionId -> { chapterId, chapterTitle, partId, partTitle }
  const meta = {};
  toc.forEach((chapter) => {
    const chapterId = chapter.id || "";
    const chapterTitle = chapter.title || chapterId;
    if (!chapter.parts) return;
    Object.values(chapter.parts).forEach((part) => {
      const partId = part.id || "";
      const partTitle = part.title || partId;
      (part.provisions || []).forEach((prov) => {
        const pid = prov.id; // e.g., "1_NSW" or "3_Victoria"
        meta[pid] = {
          chapterId,
          chapterTitle,
          partId,
          partTitle,
        };
      });
    });
  });
  return meta;
}

function buildMatchedProvisionSets() {
  const matchedNSW = new Set();
  const matchedVIC = new Set();
  const matchMap = {};

  for (const pair of pairsNSW) {
    if (pair.similar.length > 0) {
      matchedNSW.add(pair.id);
      matchMap[pair.id] = new Set(pair.similar);
      pair.similar.forEach(vic => matchedVIC.add(vic));
    }
  }

  for (const pair of pairsVIC) {
    if (pair.similar.length > 0) {
      matchedVIC.add(pair.id);
      if (!matchMap[pair.id]) matchMap[pair.id] = new Set();
      pair.similar.forEach(nsw => {
        matchedNSW.add(nsw);
        matchMap[nsw] = matchMap[nsw] || new Set();
        matchMap[nsw].add(pair.id);
      });
    }
  }

  return {
    nswList: Array.from(matchedNSW).sort(),
    vicList: Array.from(matchedVIC).sort(),
    matchMap,
  };
}

function getComparisonData(nswId, vicId) {
  return comparisonResults.find((item) => item.NSW === nswId && item.Victoria === vicId);
}

export default function EmbeddingMatrix() {
  const CELL_SIZE = 24;           // px, reduce each cell size
  const LEFT_COL_WIDTH = 420;     // px, wider left header area
  const VIC_HEADER_HEIGHT = 320;  // px, taller top header to avoid clipping
  const CHAPTER_GAP = 12; // px, visual gap between different chapters (rows & columns)

  const { nswList, vicList, matchMap } = buildMatchedProvisionSets();

  // Build metadata maps from TOCs
  const metaNSW = extractProvisionMeta(tocNSW, "NSW");
  const metaVIC = extractProvisionMeta(tocVIC, "Victoria");

  // Group rows (NSW) and columns (VIC) by Part
  const nswGroups = groupIdsByPart(nswList, metaNSW);
  const vicGroups = groupIdsByPart(vicList, metaVIC);
  
  // Compose display labels: "<ChapterId> — <Title> (<PartId>)" for both NSW and VIC
  const nswGroupsDisplay = nswGroups.map(g => ({
    ...g,
    displayLabel: `${g.chapterId} — ${g.label} (${g.key})`,
  }));
  const vicGroupsDisplay = vicGroups.map(g => ({
    ...g,
    displayLabel: `${g.chapterId} — ${g.label} (${g.key})`,
  }));

  // Build a spacer-aware NSW column sequence for consistent chapter gaps (columns = NSW)
  const nswColsWithSpacers = [];
  let lastNSWChapter = null;
  nswGroupsDisplay.forEach((g, idx) => {
    if (idx > 0 && g.chapterId !== lastNSWChapter) {
      nswColsWithSpacers.push({ type: 'spacer', key: `nsw-spacer-${idx}` });
    }
    nswColsWithSpacers.push({ type: 'col', key: g.key, group: g });
    lastNSWChapter = g.chapterId;
  });

  // Grid template columns: left header + NSW columns or spacer widths
  const GRID_TEMPLATE_COLUMNS = [
    `${LEFT_COL_WIDTH}px`,
    ...nswColsWithSpacers.map(c => c.type === 'spacer' ? `${CHAPTER_GAP}px` : `${CELL_SIZE}px`)
  ].join(' ');

  // Build fast lookup maps for group members
  const nswGroupMap = new Map(nswGroups.map(g => [g.key, new Set(g.items)]));
  const vicGroupMap = new Map(vicGroups.map(g => [g.key, new Set(g.items)]));

  // Compute category-pair counts: how many NSW×VIC provision matches fall into each (NSW part, VIC part)
  const catCounts = new Map(); // key: `${nswKey}|||${vicKey}` -> number
  let maxCount = 0;
  nswGroups.forEach(ng => {
    vicGroups.forEach(vg => {
      let cnt = 0;
      const nswSet = nswGroupMap.get(ng.key);
      const vicSet = vicGroupMap.get(vg.key);
      nswSet.forEach(nswId => {
        const sims = matchMap[nswId];
        if (!sims) return;
        sims.forEach(vicId => {
          if (vicSet.has(vicId)) cnt += 1;
        });
      });
      const pairKey = `${ng.key}|||${vg.key}`;
      catCounts.set(pairKey, cnt);
      if (cnt > maxCount) maxCount = cnt;
    });
  });

  const [selectedPair, setSelectedPair] = useState(null);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Provision Match Matrix</h2>

      <div className="overflow-x-auto overflow-y-auto border p-4 bg-white">
        <div className="inline-grid gap-[1px]" style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}>
          {/* Row 1: corner + NSW category headers */}
          <div className="bg-white" />
          {nswColsWithSpacers.map((col) => (
            col.type === 'spacer' ? (
              <div key={col.key} className="bg-white" />
            ) : (
              <div
                key={`nsw-group-${col.group.key}`}
                className="bg-red-50 text-red-800 text-[12px] font-semibold flex items-start justify-start pl-1 text-left whitespace-nowrap overflow-hidden text-ellipsis transform rotate-180"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', height: VIC_HEADER_HEIGHT }}
                title={`${col.group.displayLabel}`}
              >
                {col.group.displayLabel}
              </div>
            )
          ))}

          {/* Body: one row per VIC category, one cell per NSW category */}
          {vicGroupsDisplay.map((vgRow, ri, rArr) => (
            <React.Fragment key={`row-${vgRow.key}`}>
              {/* Left VIC category label */}
              <div
                className="bg-blue-50 text-blue-800 text-[12px] font-semibold flex items-center justify-end pr-2 whitespace-nowrap overflow-hidden text-ellipsis"
                style={{ maxWidth: LEFT_COL_WIDTH, marginTop: ri > 0 && rArr[ri - 1].chapterId !== vgRow.chapterId ? CHAPTER_GAP : 0 }}
                title={`${vgRow.displayLabel}`}
              >
                {vgRow.displayLabel}
              </div>
              {nswColsWithSpacers.map((col, ci) => {
                if (col.type === 'spacer') {
                  return <div key={`${vgRow.key}-${col.key}`} className="bg-white" />;
                }
                const nswCol = col.group;
                // catCounts were computed as `${nswKey}|||${vicKey}`
                const key = `${nswCol.key}|||${vgRow.key}`;
                const count = catCounts.get(key) || 0;
                const alpha = (maxCount > 0 && count > 0)
                  ? Math.max(0.08, Math.min(1, Math.log1p(count) / Math.log1p(maxCount)))
                  : 0;
                const style = count > 0
                  ? { backgroundColor: `rgba(0,0,0,${alpha})` }
                  : { backgroundColor: `#f3f4f6` };
                return (
                  <div
                    key={key}
                    className={"flex items-center justify-center text-[11px] text-white select-none"}
                    style={{
                      ...style,
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      marginTop: ri > 0 && rArr[ri - 1].chapterId !== vgRow.chapterId ? CHAPTER_GAP : 0,
                    }}
                    title={`${vgRow.displayLabel} × ${nswCol.displayLabel}: ${count}`}
                  >
                    {count > 0 ? count : ""}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Modal */}
      {selectedPair && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white max-w-3xl w-full rounded-lg shadow-lg p-6 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Comparison: {selectedPair.NSW} ⇄ {selectedPair.Victoria}</h3>
              <button onClick={() => setSelectedPair(null)} className="text-gray-600 hover:text-black text-xl">✕</button>
            </div>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold text-blue-700">Who</h4>
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedPair.who }} />
              </div>
              <div>
                <h4 className="font-semibold text-blue-700">When</h4>
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedPair.when }} />
              </div>
              <div>
                <h4 className="font-semibold text-blue-700">Where</h4>
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedPair.where }} />
              </div>
              <div>
                <h4 className="font-semibold text-blue-700">How</h4>
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedPair.how }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
