// Global-ish app state (imported where needed)
export const state = {
  students: [],      // [{id, name, email, phoneE164}]
  courses: [],       // [{id, name, ...}]
  assignments: [],   // [{id, courseId, title, description, due: Date, status, student: string}]
  routes: [],        // [{id, studentId, channel, destination, policy, templateId}]
  // table/paging
  page: 1,
  pageSize: 10
};
