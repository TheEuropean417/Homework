import { loadData } from "./data.js";
import { loadFilters, renderTable } from "./table.js";
import { refreshStats } from "./stats.js";
import { renderRoutes, setupRouteModal } from "./routes.js";
import { wireEvents } from "./events.js";
import { maybeAutoSync } from "./classroom.js";

async function boot() {
  await loadData();       // render from /data/*.json immediately
  loadFilters();
  refreshStats();
  renderTable();
  renderRoutes();
  setupRouteModal();
  wireEvents();
  await maybeAutoSync();  // auto-pull from Classroom (Vercel API)
}
boot();
