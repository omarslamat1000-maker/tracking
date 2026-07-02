(function () {
  const { $, $$, formatDate, formatDateTime, completionFromStatus, toast, optionHtml, unique, taskStatuses } = window.AppUtils;

  const state = {
    users: [],
    entities: [],
    meetings: [],
    tasks: [],
    auditLogs: [],
    currentView: "dashboard",
    dashboardFilters: {
      entityId: "",
      responsibleName: "",
      status: "",
      escalationStatus: "",
      dateFrom: "",
      dateTo: ""
    }
  };

  const navItems = [
    ["dashboard", "لوحة التحكم", "dashboard.view"],
    ["tasks", "المهام", "tasks.view"],
    ["meetings", "الاجتماعات", "meetings.view"],
    ["users", "المستخدمون", "users.manage"],
    ["entities", "الجهات", "entities.manage"],
    ["reports", "التقارير", "reports.view"],
    ["database", "قاعدة البيانات", "database.backup"]
  ];

  function setSavingState(status) {
    const indicator = $("#saveIndicator");
    if (!indicator) return;
    indicator.classList.remove("saving", "saved");
    if (status === "saving") {
      indicator.classList.add("saving");
      indicator.textContent = "يتم الحفظ...";
    } else if (status === "saved") {
      indicator.classList.add("saved");
      indicator.textContent = `تم الحفظ ${new Intl.DateTimeFormat("ar-SA", { timeStyle: "short" }).format(new Date())}`;
      setTimeout(() => indicator.classList.remove("saved"), 1500);
    } else {
      indicator.textContent = "قاعدة البيانات متصلة";
    }
  }

  async function init() {
    window.App = api;
    try {
      await window.DB.open();
      window.Auth.bindLogin();
      bindNav();
      bindDashboardFilters();
      window.Tasks.bindTaskEvents();
      window.ImportExport.bindImportExportEvents();
      window.Users.bindUsersEvents();
      const user = await window.Auth.restoreSession();
      if (user) {
        window.Auth.showAppShell();
        await refreshAll();
        window.GoogleSync && window.GoogleSync.startAutoSync();
      } else {
        $("#loginView").hidden = false;
        $("#appView").hidden = true;
      }
      setSavingState("connected");
    } catch (err) {
      console.error(err);
      toast("تعذر تشغيل قاعدة البيانات المحلية", "error");
    }
  }

  function bindNav() {
    $("#mainNav").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-view]");
      if (!button) return;
      await showView(button.dataset.view);
    });
  }

  async function refreshAll() {
    state.users = await window.DB.getAll("users");
    state.entities = await window.DB.getAll("entities");
    state.meetings = (await window.DB.getAll("meetings")).filter((meeting) => !meeting.isDeleted);
    state.tasks = window.Auth.filterTasksForUser(await window.DB.getAll("tasks"));
    state.auditLogs = await window.DB.getAll("auditLogs");
    renderNav();
    applyPermissionsToControls();
    await window.Tasks.load();
    await window.Users.loadAdminSections();
    hydrateDashboardFilters();
    renderDashboard();
    renderMeetings();
    window.Reports.renderReports(state.tasks, state.meetings);
    await updateRecordCounter();
    await showView(state.currentView, true);
  }

  function renderNav() {
    $("#mainNav").innerHTML = navItems
      .filter(([, , permission]) => window.Auth.hasPermission(permission))
      .map(([view, label]) => `<button type="button" data-view="${view}" class="${state.currentView === view ? "active" : ""}"><span>${label}</span><span>›</span></button>`)
      .join("");
  }

  function applyPermissionsToControls() {
    const canBackup = window.Auth.hasPermission("database.backup");
    const canRestore = window.Auth.hasPermission("database.restore");
    const canImportExcel = window.Auth.hasPermission("database.importExcel");

    $("#addTaskBtn").hidden = !window.Auth.hasPermission("tasks.create");
    $("#exportFilteredBtn").hidden = !window.Auth.hasPermission("tasks.export");
    $("#userForm").hidden = !window.Auth.hasPermission("users.manage");
    $("#entityForm").hidden = !window.Auth.hasPermission("entities.manage");
    $("#backupBtn").disabled = !canBackup;
    $("#restoreBtn").disabled = !canRestore;
    $("#importExcelBtn").disabled = !canImportExcel;
    $("#restoreFile").disabled = !canRestore;
    $("#excelFile").disabled = !canImportExcel;
  }

  async function showView(view, silent) {
    const found = navItems.find((item) => item[0] === view);
    if (!found || !window.Auth.hasPermission(found[2])) {
      view = "dashboard";
    }
    state.currentView = view;
    $$(".view-section").forEach((section) => { section.hidden = true; });
    $(`#${view}Section`).hidden = false;
    $$("#mainNav button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    const titles = {
      dashboard: ["لوحة التحكم", "لوحة التحكم التنفيذية"],
      tasks: ["إدارة المهام", "المهام والمتابعة"],
      meetings: ["الاجتماعات", "محاضر الاجتماعات"],
      users: ["الصلاحيات", "إدارة المستخدمين"],
      entities: ["الجهات", "إدارة الجهات"],
      reports: ["التقارير", "تقارير المتابعة والجودة"],
      database: ["قاعدة البيانات", "النسخ والاستيراد والتصدير"]
    };
    $("#pageKicker").textContent = titles[view][0];
    $("#pageTitle").textContent = titles[view][1];
    if (!silent) await updateRecordCounter();
  }

  function renderDashboard() {
    const dashboardTasks = getDashboardTasks();
    const dashboardMeetings = getDashboardMeetings(dashboardTasks);
    const stats = getStats(dashboardTasks, dashboardMeetings, state.entities);
    $("#kpiGrid").innerHTML = window.Charts.kpiCards(stats);
    $("#executiveSummary").textContent = window.Reports.executiveSummary(stats, dashboardTasks);
    window.Charts.renderCharts(dashboardTasks);
  }

  function bindDashboardFilters() {
    const ids = [
      "dashboardFilterEntity",
      "dashboardFilterResponsible",
      "dashboardFilterStatus",
      "dashboardFilterEscalation",
      "dashboardFilterDateFrom",
      "dashboardFilterDateTo"
    ];
    ids.forEach((id) => {
      const control = $(`#${id}`);
      if (!control) return;
      control.addEventListener("input", () => {
        state.dashboardFilters = readDashboardFilters();
        renderDashboard();
      });
    });
    $("#resetDashboardFiltersBtn").addEventListener("click", () => {
      ids.forEach((id) => { $(`#${id}`).value = ""; });
      state.dashboardFilters = readDashboardFilters();
      renderDashboard();
    });
  }

  function hydrateDashboardFilters() {
    const current = state.dashboardFilters;
    const activeTasks = state.tasks.filter((task) => !task.isDeleted);
    const allowedEntities = state.entities
      .filter((entity) => window.Auth.canSeeEntity(entity.id))
      .map((entity) => ({ value: entity.id, label: entity.name }));
    $("#dashboardFilterEntity").innerHTML = optionHtml(allowedEntities, current.entityId, "كل الجهات");
    $("#dashboardFilterResponsible").innerHTML = optionHtml(unique(activeTasks.map((task) => task.responsibleName)), current.responsibleName, "كل المسؤولين");
    $("#dashboardFilterStatus").innerHTML = optionHtml(taskStatuses, current.status, "كل الحالات");
    $("#dashboardFilterEscalation").value = current.escalationStatus;
    $("#dashboardFilterDateFrom").value = current.dateFrom;
    $("#dashboardFilterDateTo").value = current.dateTo;
  }

  function readDashboardFilters() {
    return {
      entityId: $("#dashboardFilterEntity").value,
      responsibleName: $("#dashboardFilterResponsible").value,
      status: $("#dashboardFilterStatus").value,
      escalationStatus: $("#dashboardFilterEscalation").value,
      dateFrom: $("#dashboardFilterDateFrom").value,
      dateTo: $("#dashboardFilterDateTo").value
    };
  }

  function getDashboardTasks() {
    const filters = state.dashboardFilters;
    return state.tasks.filter((task) => {
      if (task.isDeleted) return false;
      if (filters.entityId && task.entityId !== filters.entityId) return false;
      if (filters.responsibleName && task.responsibleName !== filters.responsibleName) return false;
      if (filters.status && task.status !== filters.status) return false;
      if (filters.escalationStatus === "مصعد" && !isTaskEscalated(task)) return false;
      if (filters.escalationStatus === "غير مصعد" && isTaskEscalated(task)) return false;
      if (filters.dateFrom && (!task.meetingDate || task.meetingDate < filters.dateFrom)) return false;
      if (filters.dateTo && (!task.meetingDate || task.meetingDate > filters.dateTo)) return false;
      return true;
    });
  }

  function isTaskEscalated(task) {
    const text = String(task.escalationStatus || "").trim();
    if (text.includes("غير") || text.includes("ØºÙŠØ±")) return false;
    return Boolean(task.isEscalated) || text === "مصعد" || text.includes("مصعد") || text.includes("ØµØ¹Ø¯");
  }

  function getDashboardMeetings(tasks) {
    const meetingKeys = new Set(tasks.map((task) => task.meetingId || task.meetingTitle).filter(Boolean));
    return state.meetings.filter((meeting) => meetingKeys.has(meeting.id) || meetingKeys.has(meeting.title));
  }

  function getStats(tasks, meetings, entities) {
    const active = tasks.filter((task) => !task.isDeleted);
    const total = active.length;
    const sum = active.reduce((acc, task) => acc + completionFromStatus(task.status, task.completionPercentage), 0);
    return {
      meetings: meetings.length,
      total,
      done: active.filter((task) => task.status === "تم الانتهاء").length,
      inProgress: active.filter((task) => task.status === "جاري العمل").length,
      partial: active.filter((task) => task.status === "تسليم جزئي").length,
      late: active.filter((task) => task.status === "متأخر").length,
      pending: active.filter((task) => task.status === "لم يبدأ").length,
      unknown: active.filter((task) => !task.status || task.status === "غير محدد").length,
      escalated: active.filter(isTaskEscalated).length,
      entities: new Set(active.map((task) => task.entityId).filter(Boolean)).size || entities.filter((entity) => window.Auth.canSeeEntity(entity.id)).length,
      completion: total ? Math.round(sum / total) : 0
    };
  }

  function renderMeetings() {
    const list = $("#meetingsList");
    const tasks = state.tasks.filter((task) => !task.isDeleted);
    const meetings = state.meetings.filter((meeting) => window.Auth.canSeeEntity(meeting.entityId));
    if (!meetings.length) {
      list.innerHTML = `<div class="empty-state">لا توجد اجتماعات بعد. ستظهر المحاضر تلقائيًا بعد إضافة أو استيراد المهام.</div>`;
      return;
    }
    list.innerHTML = meetings.map((meeting) => {
      const related = tasks.filter((task) => task.meetingId === meeting.id || task.meetingTitle === meeting.title);
      const done = related.filter((task) => task.status === "تم الانتهاء").length;
      const late = related.filter((task) => task.status === "متأخر").length;
      const escalated = related.filter(isTaskEscalated).length;
      const completion = related.length ? Math.round(related.reduce((acc, task) => acc + completionFromStatus(task.status, task.completionPercentage), 0) / related.length) : 0;
      const entity = state.entities.find((item) => item.id === meeting.entityId);
      return `
        <article class="item-card">
          <h3>${meeting.title}</h3>
          <div class="item-meta">
            <span>تاريخ الاجتماع: ${formatDate(meeting.meetingDate)}</span>
            <span>الجهة: ${entity ? entity.name : "-"}</span>
            <span>عدد المهام: ${related.length}</span>
            <span>المكتملة: ${done}</span>
            <span>المتأخرة: ${late}</span>
            <span>التصعيدات: ${escalated}</span>
            <span>نسبة الإنجاز: ${completion}%</span>
          </div>
          <div class="item-actions">
            <button type="button" data-view-meeting="${meeting.title}">عرض مهام الاجتماع</button>
          </div>
        </article>
      `;
    }).join("");
    $$("[data-view-meeting]").forEach((btn) => btn.addEventListener("click", async () => {
      await showView("tasks");
      $("#filterMeeting").value = btn.dataset.viewMeeting;
      window.Tasks.renderTasksTable();
    }));
  }

  async function updateRecordCounter() {
    const counts = await window.DB.countRecords();
    $("#recordCounter").textContent = `${counts.total} سجل مخزن`;
  }

  const api = { state, init, refreshAll, setSavingState, showView, getStats };
  window.App = api;
  document.addEventListener("DOMContentLoaded", init);
})();
