import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./App";
import { AdminPage } from "./admin/AdminPage";
import { AdminSitePage } from "./admin/AdminSitePage";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/site" element={<AdminSitePage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
