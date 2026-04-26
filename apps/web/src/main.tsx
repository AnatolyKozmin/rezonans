import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./App";
import { AdminPage } from "./admin/AdminPage";
import { AdminSitePage } from "./admin/AdminSitePage";
import { AdminBotPage } from "./admin/AdminBotPage";
import { AdminUsersPage } from "./admin/AdminUsersPage";
import { MiniHomePage } from "./MiniHomePage";
import { MiniAdventPage } from "./MiniAdventPage";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/site" element={<AdminSitePage />} />
        <Route path="/admin/bot" element={<AdminBotPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/mini" element={<MiniHomePage />} />
        <Route path="/mini/advent/:day?" element={<MiniAdventPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
