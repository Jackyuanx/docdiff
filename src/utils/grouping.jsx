// Sort-aware grouping by Part (within Chapter)
// Returns groups as [{ key: partId, label: partTitle, chapterId, items }],
// sorted by numeric Chapter number then numeric Part number.
export function groupIdsByPart(ids, metaMap) {
  const byPart = new Map();

  ids.forEach((id) => {
    const m = metaMap[id] || {};
    const partId = m.partId || "(unknown)";
    const partTitle = m.partTitle || "(Uncategorized)";
    const chapterId = m.chapterId || "";
    if (!byPart.has(partId)) {
      byPart.set(partId, { key: partId, label: partTitle, chapterId, items: [] });
    }
    byPart.get(partId).items.push(id);
  });

  // Helpers to parse numbers out of IDs like "Chapter 4_NSW", "Part 4.3_NSW"
  const parseChapterNum = (chapterId) => {
    if (!chapterId) return Number.POSITIVE_INFINITY;
    const m = String(chapterId).match(/(chapter|ch)\s*(\d+(?:\.\d+)?)/i);
    if (m && m[2]) return parseFloat(m[2]);
    const m2 = String(chapterId).match(/(\d+(?:\.\d+)?)/);
    return m2 ? parseFloat(m2[1]) : Number.POSITIVE_INFINITY;
  };
  const parsePartNum = (partId) => {
    if (!partId) return Number.POSITIVE_INFINITY;
    // Prefer patterns like "4.1" first
    const mDot = String(partId).match(/(\d+\.\d+)/);
    if (mDot && mDot[1]) return parseFloat(mDot[1]);
    // Fallback to first integer after "Part" or any number
    const m = String(partId).match(/part\s*(\d+)/i) || String(partId).match(/(\d+)/);
    return m && m[1] ? parseFloat(m[1]) : Number.POSITIVE_INFINITY;
  };

  const groups = Array.from(byPart.values());
  groups.sort((a, b) => {
    const ca = parseChapterNum(a.chapterId);
    const cb = parseChapterNum(b.chapterId);
    if (ca !== cb) return ca - cb;
    const pa = parsePartNum(a.key);
    const pb = parsePartNum(b.key);
    if (pa !== pb) return pa - pb;
    return a.key.localeCompare(b.key);
  });

  return groups;
}