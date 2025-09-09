// Global app config
export const CONFIG = {
  // Your live Google Apps Script Web App (Classroom JSON bridge)
  classroomEndpoint: "https://script.google.com/a/macros/newcovenant.net/s/AKfycbypk7MnPAxicy4LuVriNxxf3jubiRpSBzGxrlVyQhVaOTKIGO7HNZLxmMFLVEVjSzKprQ/exec",

  // Auto-pull from Classroom shortly after page load
  autoSyncOnLoad: true,

  // If your browser ever blocks CORS, set this to true and we’ll switch to JSONP
  useJsonp: false
};
