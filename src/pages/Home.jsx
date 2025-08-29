import React, { useState, useMemo } from "react";
import Fuse from "fuse.js";
import { useNavigate } from "react-router-dom";
import TreeNode from "../components/TreeNode";
import tocNSW from "../../backend/toc - NSW.json";
import tocVIC from "../../backend/toc - VIC.json";
import nswVic07 from "../../backend/pairing/nsw - vic - 0.7.json";
import nswVic08 from "../../backend/pairing/nsw - vic - 0.8.json";
import nswVic09 from "../../backend/pairing/nsw - vic - 0.9.json";
import vicNsw07 from "../../backend/pairing/vic - nsw - 0.7.json";
import vicNsw08 from "../../backend/pairing/vic - nsw - 0.8.json";
import vicNsw09 from "../../backend/pairing/vic - nsw - 0.9.json";
import Navbar from "../components/NavBar";
const thresholds = {
  low: { nsw: nswVic07, vic: vicNsw07 },
  medium: { nsw: nswVic08, vic: vicNsw08 },
  high: { nsw: nswVic09, vic: vicNsw09 },
};

function flattenData(data) {
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

export default function Home() {
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  const fuseNSW = useMemo(
    () =>
      new Fuse(flattenData(tocNSW), {
        keys: ["id", "title"],
        threshold: 0.2,
        ignoreLocation: true,
      }),
    []
  );
  const fuseVIC = useMemo(
    () =>
      new Fuse(flattenData(tocVIC), {
        keys: ["id", "title"],
        threshold: 0.2,
        ignoreLocation: true,
      }),
    []
  );

  const searchResultsNSW = searchTerm
    ? fuseNSW.search(searchTerm).map((res) => res.item.id)
    : null;
  const searchResultsVIC = searchTerm
    ? fuseVIC.search(searchTerm).map((res) => res.item.id)
    : null;

  const handleProvisionClick = (jurisdiction, id) => {
    navigate(`/compare/${jurisdiction}/${id}`);
  };

  
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
            <h2 className="text-xl font-semibold mb-2">
              NSW WHS Regulation
            </h2>
            {tocNSW.map((chapter) => (
              <TreeNode
                key={chapter.id}
                node={chapter}
                searchTerm={searchTerm}
                searchResults={searchResultsNSW}
                onProvisionClick={(id) =>
                  handleProvisionClick("nsw", id)
                }
                thresholds={thresholds}
                jurisdiction="nsw"
              />
            ))}
          </div>

          <div className="w-1/2 flex-none pl-4 break-words">
            <h2 className="text-xl font-semibold mb-2">
              Victoria WHS Regulation
            </h2>
            {tocVIC.map((chapter) => (
              <TreeNode
                key={chapter.id}
                node={chapter}
                searchTerm={searchTerm}
                searchResults={searchResultsVIC}
                onProvisionClick={(id) =>
                  handleProvisionClick("vic", id)
                }
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