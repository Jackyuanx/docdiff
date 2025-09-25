
import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

import Home from "./pages/Home";
import ProvisionComparison from "./pages/ProvisionComparison";
import RoadComparison from "./pages/RoadComparison";
import './App.css';
import Climate from "./pages/Climate";
import Road from "./pages/Road";
import EmbeddingMatrix from "./pages/EmbeddingMatrix";
import Bipartite from "./pages/Bipartite";
export default function App() {
  return (
    <Router>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/climate" element={<Climate />} />
        <Route path="/road" element={<Road />} />
        <Route path="/embedding" element={<EmbeddingMatrix />} />
        <Route path="/bipartite" element={<Bipartite />} />
        <Route path="/compare/:jurisdiction/:id" element={<ProvisionComparison />} />
        /<Route path="/road/:jurisdiction/:id" element={<RoadComparison />} />
      </Routes>
    </Router>
  );
}
