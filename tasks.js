(function () {
  const {
    $, $$, uid, nowIso, formatDate, formatDateTime, escapeHtml, toast, optionHtml,
    taskStatuses, unique, normalize, completionFromStatus
  } = window.AppUtils;

  let taskCache = [];
  let entityCache = [];
  let filteredCache = [];

  function bindTaskEvents() {
    $("#addTaskBtn").addEventListener("click", () => openTaskDialog());
    $("#resetFiltersBtn").addEventListener("click", resetFilters);
    $("#exportFilteredBtn").addEventListener("click", () => window.ImportExport.exportTasks(filteredCache));
    $("#taskForm").addEventListener("submit", saveTaskFromForm);
    $$("[data-close-dialog]").forEach((btn) => btn.addEventListener("click", () => $("#taskDialog").close()));
    ["taskSearch", "filterEntity", "filterResponsible", "filterStatus", "filterMeeting", "filterMeetingDate", "filterEscalation", "filterPriority"]
      .forEach((id) => $(`#${id}`).addEventListener("input", renderTasksTable));
  }

  async function load() {
    entityCache = (await window.DB.getAll("entities")).filter((entity) => entity.isActive);
    taskCache = window.Auth.filterTasksForUser(await window.DB.getAll("tasks"));
    taskCache = taskCache.filter((task) => !task.isDeleted);
    hydrateFilters();
    renderTasksTable();
  }

  function hydrateFilters() {
    const entityOptions = entityCache
      .filter((entity) => window.Auth.canSeeEntity(entity.id))
      .map((entity) => ({ value: entity.id, label: entity.name }));
    $("#filterEntity").innerHTML = optionHtml(entityOptions, "", "كل الجهات");
    $("#filterResponsible").innerHTML = optionHtml(unique(taskCache.map((task) => task.responsibleName)), "", "كل المسؤولين");
    $("#filterStatus").innerHTML = optionHtml(taskStatuses, "", "كل الحالات");
    $("#filterMeeting").innerHTML = optionHtml(unique(taskCache.map((task) => task.meetingTitle)), "", "كل المحاضر");
    const entitySelect = $("#taskForm [name='entityId']");
    entitySelect.innerHTML = optionHtml(entityOptions, "", "اختر الجهة");
    $("#taskForm [name='status']").innerHTML = optionHtml(taskStatuses, "غير محدد");
  }

  function resetFilters() {
    ["taskSearch", "filterEntity", "filterResponsible", "filterStatus", "filterMeeting", "filterMeetingDate", "filterEscalation", "filterPriority"]
      .forEach((id) => { $(`#${id}`).value = ""; });
    renderTasksTable();
  }

  function getFilteredTasks() {
    const text = normalize($("#taskSearch").value);
    const entityId = $("#filterEntity").value;
    const responsible = $("#filterResponsible").value;
    const status = $("#filterStatus").value;
    const meeting = $("#filterMeeting").value;
    const meetingDate = $("#filterMeetingDate").value;
    const escalation = $("#filterEscalation").value;
    const priority = $("#filterPriority").value;
    return taskCache.filter((task) => {
      const haystack = normalize([task.title, task.meetingTitle, task.entityName, task.responsibleName, task.feedback, task.notes].join(" "));
      return (!text || haystack.includes(text))
        && (!entityId || task.entityId === entityId)
        && (!responsible || task.responsibleName === responsible)
        && (!status || task.status === status)
        && (!meeting || task.meetingTitle === meeting)
        && (!meetingDate || task.meetingDate === meetingDate)
        && (!escalation || task.escalationStatus === escalation)
        && (!priority || task.priority === priority);
    });
  }

  function renderTasksTable() {
    filteredCache = getFilteredTasks();
    const tbody = $("#tasksTable");
    if (!filteredCache.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty-state">لا توجد مهام مطابقة.</td></tr>`;
      return;
    }
    tbody.innerHTML = filteredCache.map((task) => `
      <tr>
        <td>${escapeHtml(task.taskNumber || "-")}</td>
        <td>${escapeHtml(task.meetingTitle || "-")}</td>
        <td>${formatDate(task.meetingDate)}</td>
        <td>${escapeHtml(task.entityName || "-")}</td>
        <td>${escapeHtml(task.title || "-")}</td>
        <td>${escapeHtml(task.responsibleName || "-")}</td>
        <td>${window.Charts.statusBadge(task.status)}</td>
        <td>${Number(task.completionPercentage || 0)}%</td>
        <td><span class="badge ${task.escalationStatus === "مصعد" ? "escalated" : "unknown"}">${escapeHtml(task.escalationStatus || "غير مصعد")}</span></td>
        <td>${escapeHtml(task.feedback || "-")}</td>
        <td>${formatDateTime(task.updatedAt)}</td>
        <td>
          <div class="row-actions">
            <button type="button" data-edit-task="${task.id}">تعديل</button>
            <button type="button" data-status-task="${task.id}">تحديث</button>
            <button type="button" data-delete-task="${task.id}">حذف</button>
          </div>
        </td>
      </tr>
    `).join("");

    $$("[data-edit-task]").forEach((btn) => btn.addEventListener("click", () => openTaskDialog(btn.dataset.editTask)));
    $$("[data-status-task]").forEach((btn) => btn.addEventListener("click", () => quickStatus(btn.dataset.statusTask)));
    $$("[data-delete-task]").forEach((btn) => btn.addEventListener("click", () => deleteTask(btn.dataset.deleteTask)));
  }

  function openTaskDialog(id) {
    if (id && !window.Auth.hasPermission("tasks.edit")) {
      toast("لا تملك صلاحية تعديل المهام", "error");
      return;
    }
    if (!id && !window.Auth.hasPermission("tasks.create")) {
      toast("لا تملك صلاحية إضافة المهام", "error");
      return;
    }
    const form = $("#taskForm");
    form.reset();
    hydrateFilters();
    $("#taskDialogTitle").textContent = id ? "تعديل مهمة" : "إضافة مهمة";
    const task = id ? taskCache.find((item) => item.id === id) : null;
    if (task) {
      Object.entries(task).forEach(([key, value]) => {
        const input = form.elements[key];
        if (input) input.value = value ?? "";
      });
      form.elements.meetingTitle.value = task.meetingTitle || task.meetingId || "";
      form.elements.entityId.value = task.entityId || "";
    } else {
      form.elements.id.value = "";
      form.elements.taskNumber.value = String(taskCache.length + 1);
      form.elements.status.value = "غير محدد";
      form.elements.completionPercentage.value = 0;
    }
    $("#taskDialog").showModal();
  }

  async function saveTaskFromForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const id = formData.get("id");
    const oldTask = id ? await window.DB.get("tasks", id) : null;
    const entity = entityCache.find((item) => item.id === formData.get("entityId"));
    const task = {
      ...(oldTask || {}),
      id: id || uid("task"),
      meetingTitle: formData.get("meetingTitle").trim(),
      meetingId: normalize(formData.get("meetingTitle")),
      meetingDate: formData.get("meetingDate"),
      entityId: formData.get("entityId"),
      entityName: entity ? entity.name : "",
      taskNumber: formData.get("taskNumber").trim(),
      title: formData.get("title").trim(),
      responsibleName: formData.get("responsibleName").trim(),
      status: formData.get("status") || "غير محدد",
      completionPercentage: completionFromStatus(formData.get("status"), formData.get("completionPercentage")),
      dueDate: formData.get("dueDate"),
      followupDate: formData.get("followupDate"),
      escalationStatus: formData.get("escalationStatus") || "غير مصعد",
      priority: formData.get("priority") || "متوسطة",
      feedback: formData.get("feedback").trim(),
      notes: formData.get("notes").trim()
    };
    if (!task.meetingTitle || !task.meetingDate || !task.entityId || !task.title) {
      toast("يرجى تعبئة الحقول المطلوبة", "error");
      return;
    }
    await window.DB.saveTask(task, oldTask);
    if (window.GoogleSync && window.GoogleSync.pushTaskUpdate) {
      window.GoogleSync.pushTaskUpdate("saveTask", task).catch(() => {});
    }
    $("#taskDialog").close();
    toast("تم حفظ المهمة بنجاح", "success");
    await window.App.refreshAll();
  }

  async function quickStatus(id) {
    if (!window.Auth.hasPermission("tasks.updateStatus")) {
      toast("لا تملك صلاحية تحديث الحالة", "error");
      return;
    }
    const task = await window.DB.get("tasks", id);
    if (!task) return;
    const next = prompt("أدخل الحالة الجديدة", task.status || "جاري العمل");
    if (!next) return;
    const feedback = prompt("تحديث الإفادة", task.feedback || "") ?? task.feedback;
    const updated = {
      ...task,
      status: next,
      feedback,
      completionPercentage: completionFromStatus(next, task.completionPercentage),
      closedAt: next === "تم الانتهاء" ? nowIso() : task.closedAt
    };
    await window.DB.saveTask(updated, task);
    if (window.GoogleSync && window.GoogleSync.pushTaskUpdate) {
      window.GoogleSync.pushTaskUpdate("saveTask", updated).catch(() => {});
    }
    toast("تم تحديث الحالة", "success");
    await window.App.refreshAll();
  }

  async function deleteTask(id) {
    if (!window.Auth.hasPermission("tasks.delete")) {
      toast("لا تملك صلاحية حذف المهام", "error");
      return;
    }
    if (!confirm("هل تريد حذف المهمة حذفًا ناعمًا؟")) return;
    const task = await window.DB.get("tasks", id);
    await window.DB.softDeleteTask(id);
    if (window.GoogleSync && window.GoogleSync.pushTaskUpdate) {
      window.GoogleSync.pushTaskUpdate("deleteTask", task).catch(() => {});
    }
    toast("تم حذف المهمة", "success");
    await window.App.refreshAll();
  }

  function currentFiltered() {
    return filteredCache.slice();
  }

  window.Tasks = { bindTaskEvents, load, renderTasksTable, getFilteredTasks, currentFiltered };
})();
