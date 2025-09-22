
import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

import Home from "./pages/Home";
import ProvisionComparison from "./pages/ProvisionComparison";
import RoadComparison from "./pages/RoadComparison";
import './App.css';
import Climate from "./pages/Climate";
import Road from "./pages/Road";
export default function App() {
  return (
    <Router>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/climate" element={<Climate />} />
        <Route path="/road" element={<Road />} />
        <Route path="/compare/:jurisdiction/:id" element={<ProvisionComparison />} />
        /<Route path="/road/:jurisdiction/:id" element={<RoadComparison />} />
      </Routes>
    </Router>
  );
}
