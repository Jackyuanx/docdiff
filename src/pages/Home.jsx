import React, { useState, useMemo } from "react";
import { groupIdsByPart } from "../utils/grouping.jsx";

// Assume props: nswList, vicList, metaNSW, metaVIC, matchMap
export default function EmbeddingMatrix({ nswList, vicList, metaNSW, metaVIC, matchMap }) {
  const nswGroups = groupIdsByPart(nswList, metaNSW);
  const vicGroups = groupIdsByPart(vicList, metaVIC);

  // Build fast lookup maps for group members
  const nswGroupMap = new Map(nswGroups.map(g => [g.label, new Set(g.items)]));
  const vicGroupMap = new Map(vicGroups.map(g => [g.label, new Set(g.items)]));

  // Compute category-pair counts: how many NSW×VIC provision matches fall into each (NSW part, VIC part)
  const catCounts = new Map(); // key: `${nswLabel}|||${vicLabel}` -> number
  let maxCount = 0;
  nswGroups.forEach(ng => {
    vicGroups.forEach(vg => {
      let cnt = 0;
      const nswSet = nswGroupMap.get(ng.label);
      const vicSet = vicGroupMap.get(vg.label);
      // For each NSW provision in this NSW group, count how many of its matches land in this VIC group
      nswSet.forEach(nswId => {
        const sims = matchMap[nswId];
        if (!sims) return;
        sims.forEach(vicId => {
          if (vicSet.has(vicId)) cnt += 1;
        });
      });
      catCounts.set(`${ng.label}|||${vg.label}`, cnt);
      if (cnt > maxCount) maxCount = cnt;
    });
  });

  // Modal and other state/handlers omitted for brevity; assume unchanged

  return (
    <div>
      {/* Other UI elements above */}
      {/* Grid layout strategy: */}
      <div className="inline-grid gap-[1px]" style={{ gridTemplateColumns: `220px repeat(${vicGroups.length}, 48px)` }}>
        {/* Row 1: corner + VIC category headers */}
        <div className="bg-white" />
        {vicGroups.map((g) => (
          <div
            key={`vic-group-${g.label}`}
            className="bg-red-50 text-red-800 text-[12px] font-semibold flex items-center justify-center px-2 text-center"
            title={`${g.label}`}
          >
            {g.label}
          </div>
        ))}

        {/* Body: one row per NSW category, one cell per VIC category */}
        {nswGroups.map((ng) => (
          <React.Fragment key={`row-${ng.label}`}>
            {/* Left NSW category label */}
            <div
              className="bg-blue-50 text-blue-800 text-[12px] font-semibold flex items-center justify-end pr-2"
              title={`${ng.label}`}
            >
              {ng.label}
            </div>
            {vicGroups.map((vg) => {
              const key = `${ng.label}|||${vg.label}`;
              const count = catCounts.get(key) || 0;
              // Determine intensity; avoid division by zero
              const alpha = maxCount > 0 ? Math.max(0.08, Math.min(1, count / maxCount)) : 0;
              const style = count > 0
                ? { backgroundColor: `rgba(0,0,0,${alpha})` }
                : { backgroundColor: `#f3f4f6` }; // Tailwind gray-100
              return (
                <div
                  key={key}
                  className="w-[48px] h-[48px] flex items-center justify-center text-[11px] text-white select-none"
                  style={style}
                  title={`${ng.label} × ${vg.label}: ${count}`}
                >
                  {count > 0 ? count : ""}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {/* Modal and other UI below remain unchanged */}
    </div>
  );
}