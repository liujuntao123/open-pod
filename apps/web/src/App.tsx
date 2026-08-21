import { NavLink, Route, Routes } from "react-router-dom";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkBenchPage } from "./pages/WorkBenchPage";
import { WorkListPage } from "./pages/WorkListPage";
import { cn } from "@/lib/utils";

export function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <div className="font-display text-lg font-semibold tracking-tight">Open Pod</div>
          </div>
          <nav className="flex items-center gap-1 rounded-full bg-muted/50 p-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              作品
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              设置
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Routes>
          <Route path="/" element={<WorkListPage />} />
          <Route path="/works/:workId" element={<WorkBenchPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
