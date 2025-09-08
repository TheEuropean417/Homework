import { loadData } from "./data.js";
import { loadFilters, renderTable } from "./table.js";
import { refreshStats } from "./stats.js";
import { renderRoutes, setupRouteModal } from "./routes.js";
import { wireEvents } from "./events.js";

async function boot() {
  await loadData();
  loadFilters();
  refreshStats();
  renderTable();
  renderRoutes();
  setupRouteModal();
  wireEvents();
}

boot();
