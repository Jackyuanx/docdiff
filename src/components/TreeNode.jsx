import React, { useState, useEffect } from "react";

export default function TreeNode({
  node,
  level = 0,
  searchTerm = "",
  searchResults = null,
  onProvisionClick = null,
  thresholds = null,
  jurisdiction = null
}) {
  const [open, setOpen] = useState(false);

  // 展开节点，如果搜索时命中当前节点或其子节点，为了显示方便，可以默认展开
  useEffect(() => {
    if (!searchTerm) {
      setOpen(false);
      return;
    }

    const isMatch = isNodeOrDescendantMatched(node, searchResults);
    setOpen(isMatch);
  }, [searchTerm, searchResults, node]);

  const hasParts = node.parts && Object.keys(node.parts).length > 0;
  const hasProvisions = node.provisions && node.provisions.length > 0;
  const hasChildren = hasParts || hasProvisions;

  const indent = {
    padding: "4px 0",
    paddingLeft: `${level * 16}px`,
    textAlign: "left",
  };

  const labelClass =
    level === 0
      ? "font-bold text-blue-800"
      : level === 1
      ? "text-gray-700 font-semibold"
      : "text-gray-600";

  function isNodeOrDescendantMatched(node, results) {
    if (!results) return true;
    if (results.includes(node.id)) return true;
    if (node.parts) {
      return Object.values(node.parts).some((part) => isNodeOrDescendantMatched(part, results));
    }
    if (node.provisions) {
      return node.provisions.some((prov) => results.includes(prov.id));
    }
    return false;
  }

  if (searchTerm && !isNodeOrDescendantMatched(node, searchResults)) return null;

  const getPairCounts = (provId) => {
    if (!thresholds) return [0, 0, 0]; // Fallback
    const direction = provId.includes("NSW") ? "nsw" : "vic";

    const counts = [0.7, 0.8, 0.9].map((threshold) => {
      const dataset =
        threshold === 0.7
          ? thresholds.low[direction]
          : threshold === 0.8
          ? thresholds.medium[direction]
          : thresholds.high[direction];

      const entry = dataset.find((item) => item.id === provId);
      return entry ? entry.similar.length : 0;
    });

    return counts;
  };

  return (
    <div style={indent} className="text-left">
      <div
        className={`cursor-pointer select-none flex items-start gap-2 ${labelClass}`}
        onClick={() => setOpen(!open)}
      >
        {hasChildren ? <span>{open ? "▼" : "▶"}</span> : <span className="opacity-50">•</span>}
        <span>
          {node.id} - {node.title}
        </span>
      </div>

      {open && hasParts &&
        Object.values(node.parts).map((part) => (
          <TreeNode
            key={part.id}
            node={part}
            level={level + 1}
            searchTerm={searchTerm}
            searchResults={searchResults}
            onProvisionClick={onProvisionClick}
            thresholds={thresholds}
            jurisdiction={jurisdiction}
          />
        ))}

      {open && hasProvisions &&
        node.provisions.map((prov) => {
          const counts = getPairCounts(prov.id);
          return (
            <div
              key={prov.id}
              className="ml-6 text-sm text-gray-600 hover:bg-gray-100 px-2 py-1 rounded flex justify-between items-center cursor-pointer"
              onClick={() => onProvisionClick && onProvisionClick(prov.id)}
            >
              {/* Left: flex‑1 so it shrinks before the badge */}
              <span className="flex-1 truncate">
                {prov.id} – {prov.title}
              </span>

              {/* Right: fixed width, truncate, no shrink/grow */}
              <span className="flex-none w-24 text-right text-gray-500 font-mono text-xs truncate">
                {counts[0]} | {counts[1]} | {counts[2]}
              </span>
            </div>
          );
        })}

    </div>
  );
}
