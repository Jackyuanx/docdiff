import React from "react";
import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <header className="w-full bg-gray-100 py-4 border-b shadow-sm">
      <div className="w-full max-w-[95vw] mx-auto flex justify-between items-center px-8">
        <h1 className="text-2xl font-bold">Document Comparison Explorer</h1>
        <div className="flex gap-4 flex-shrink-0">
          <Link
            to="/"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Regulations
          </Link>
          <Link
            to="/climate"
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
          >
            Climate
          </Link>
        </div>
      </div>
    </header>
  );
}