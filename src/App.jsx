
import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import ProvisionComparison from "./pages/ProvisionComparison";
import './App.css';
import Climate from "./pages/Climate";
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/climate" element={<Climate />} />
        <Route path="/compare/:jurisdiction/:id" element={<ProvisionComparison />} />
      </Routes>
    </Router>
  );
}
