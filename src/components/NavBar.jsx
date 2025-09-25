import React from "react";
import { NavLink, Link } from "react-router-dom";

const baseBtn =
  "px-4 py-2 text-white rounded transition whitespace-nowrap";
const variants = {
  blue:   "bg-blue-600 hover:bg-blue-700",
  green:  "bg-green-600 hover:bg-green-700",
  yellow: "bg-yellow-600 hover:bg-yellow-700",
  amber:  "bg-amber-600 hover:bg-amber-700",
};

function NavItem({ to, children, variant = "blue" }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          baseBtn,
          variants[variant],
          isActive ? "ring-2 ring-black/10 ring-offset-2" : "",
        ].join(" ")
      }
      end
    >
      {children}
    </NavLink>
  );
}

export default function Navbar() {
  return (
    <header className="w-full bg-gray-100 border-b shadow-sm">
      <div className="mx-auto max-w-screen-2xl px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="text-2xl font-bold text-gray-900">
            Document Comparison Explorer
          </Link>

          <nav className="flex flex-wrap items-center gap-3">
            <NavItem to="/" variant="blue">WHS Regulations</NavItem>
            <NavItem to="/climate" variant="green">Climate</NavItem>
            <NavItem to="/road" variant="yellow">Road Regulations</NavItem>
            <NavItem to="/road/mic" variant="amber">Michigan Road Regulations</NavItem>
          </nav>
        </div>
      </div>
    </header>
  );
}