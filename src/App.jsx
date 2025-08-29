
import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

import './App.css';
import Climate from "./pages/Climate";
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Climate />} />
      </Routes>
    </Router>
  );
}
