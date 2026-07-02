(function () {
  const { toast, nowIso, normalize, sameTaskKey, completionFromStatus } = window.AppUtils;

  let syncTimer = null;

  function getSheetId(url) {
    try {
      const matches = /\/d\/([a-zA-Z0-9-_]+)/.exec(url);
      return matches ? matches[1] : null;
    } catch {
      return null;
    }
  }

  async function fetchSheet(url) {
    const sheetId = getSheetId(url);
    if (!sheetId) throw new Error("رابط Google Sheets غير صالح.");
    const endpoint = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error("فشل الوصول إلى Google Sheets.");
    const text = await response.text();
    return parseGvizJson(text);
  }

  function parseGvizJson(text) {
    const jsonText = text.replace(/^.*?\{/, "{").replace(/\}\);?\s*$/, "}");
    const parsed = JSON.parse(jsonText);
    const cols = parsed.table.cols.map((col) => String(col.label || col.id || "").trim());
    const rows = parsed.table.rows.map((row) => row.c.map((cell) => (cell && cell.v != null ? cell.v : "")));
    return { cols, rows };
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function dateValue(value) {
    if (!value) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toISOString().slice(0, 10);
  }

  async function buildTasksFromSheet(rows, cols, entities) {
    const entityMap = new Map(entities.map((entity) => [normalize(entity.name), entity]));
    const tasks = [];

    for (const row of rows) {
      const item = {};
      cols.forEach((header, index) => { item[header] = row[index]; });

      const entityName = text(item["جهة الاجتماع"]) || "غير محدد";
      let entity = entityMap.get(normalize(entityName));
      if (!entity) {
        entity = {
          id: `entity-${normalize(entityName).replace(/\s+/g, "-") || Date.now()}`,
          name: entityName,
          description: "أضيفت تلقائيًا من Google Sheets",
          isActive: true,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        entityMap.set(normalize(entityName), entity);
      }

      const status = text(item["الحالة"]) || "غير محدد";
      const task = {
        id: text(item["id"]) || `task-${normalize(text(item["المهمة المسندة"]))}-${Date.now()}`,
        taskNumber: text(item["رقم"]),
        meetingTitle: text(item["محضر الاجتماع"]) || "محضر مستورد",
        meetingId: normalize(text(item["محضر الاجتماع"]) || "محضر مستورد"),
        meetingDate: dateValue(item["تاريخ الاجتماع"]),
        entityId: entity.id,
        entityName: entity.name,
        title: text(item["المهمة المسندة"]) || "مهمة مستوردة بدون عنوان",
        responsibleName: text(item["المسؤول"]),
        status,
        completionPercentage: completionFromStatus(status, Number(item["نسبة الإنجاز"]) || 0),
        dueDate: dateValue(item["تاريخ الاستحقاق"] || item["تاريخ الاستحقاق"]),
        followupDate: dateValue(item["تاريخ المتابعة"] || item["تاريخ المتابعة"]),
        escalationStatus: text(item["حالة التصعيد"]) || "غير مصعد",
        priority: text(item["الأولوية"]) || "متوسطة",
        feedback: text(item["الإفادة"]),
        notes: text(item["ملاحظات"]),
        updatedAt: dateValue(item["آخر تحديث"]) || nowIso(),
        isDeleted: false
      };
      tasks.push({ task, entity });
    }

    return tasks;
  }

  async function syncFromSheet() {
    const sheetUrl = await window.DB.getSetting("googleSheetUrl");
    if (!sheetUrl) throw new Error("لم يتم تهيئة رابط Google Sheets.");
    const { cols, rows } = await fetchSheet(sheetUrl);
    const entities = await window.DB.getAll("entities");
    const storedTasks = await window.DB.getAll("tasks");
    const taskMap = new Map(storedTasks.filter((task) => !task.isDeleted).map((task) => [sameTaskKey(task), task]));
    const payload = await buildTasksFromSheet(rows, cols, entities);
    const processedEntities = new Map(entities.map((entity) => [entity.id, entity]));

    for (const { task, entity } of payload) {
      if (!processedEntities.has(entity.id)) {
        await window.DB.put("entities", entity);
        processedEntities.set(entity.id, entity);
      }
      const existing = taskMap.get(sameTaskKey(task));
      const mergedTask = existing ? { ...existing, ...task, updatedAt: nowIso() } : task;
      await window.DB.saveTask(mergedTask, existing || null);
    }

    await window.DB.addAudit("مزامنة من Google Sheets", "database", "googleSheet", null, { rows: payload.length });
    await window.App.refreshAll();
    return payload.length;
  }

  async function syncToEndpoint() {
    const syncUrl = await window.DB.getSetting("googleSheetSyncUrl");
    if (!syncUrl) return false;
    const tasks = (await window.DB.getAll("tasks")).filter((task) => !task.isDeleted);
    const response = await fetch(syncUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "syncAll", tasks })
    });
    if (!response.ok) throw new Error("فشل إرسال البيانات إلى نقطة المزامنة.");
    return true;
  }

  async function pushTaskUpdate(action, task) {
    const syncUrl = await window.DB.getSetting("googleSheetSyncUrl");
    if (!syncUrl) return;
    await fetch(syncUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, task })
    });
  }

  async function syncNow() {
    try {
      const count = await syncFromSheet();
      await syncToEndpoint();
      toast(`تمت المزامنة من Google Sheets (${count} صفًا)`, "success");
    } catch (err) {
      toast(`فشل المزامنة: ${err.message}`, "error");
      throw err;
    }
  }

  function startAutoSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncNow().catch(() => {});
    syncTimer = setInterval(() => syncNow().catch(() => {}), 120000);
  }

  function stopAutoSync() {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  }

  window.GoogleSync = {
    startAutoSync,
    stopAutoSync,
    syncNow,
    pushTaskUpdate
  };
})();