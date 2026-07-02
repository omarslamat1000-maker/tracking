(function () {
  const { uid, nowIso, permissions } = window.AppUtils;
  const DB_NAME = "InfrastructureTasksDB";
  const DB_VERSION = 1;
  const stores = ["users", "entities", "meetings", "tasks", "taskUpdates", "auditLogs", "settings"];
  let db;

  const defaultEntities = [
    "وكالة الشؤون الفنية",
    "وكالة الدراسات والتصاميم",
    "وكالة الطرق",
    "وكالة الحدائق والأنسنة",
    "شبكات تصريف مياه الأمطار",
    "مركز متابعة العمليات البلدية",
    "تنسيق المشروعات"
  ];

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        stores.forEach((store) => {
          if (!database.objectStoreNames.contains(store)) {
            const keyPath = store === "settings" ? "key" : "id";
            database.createObjectStore(store, { keyPath });
          }
        });
      };
      request.onsuccess = async () => {
        db = request.result;
        await seedIfNeeded();
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  function tx(store, mode) {
    if (!db) throw new Error("قاعدة البيانات غير متصلة");
    return db.transaction(store, mode || "readonly").objectStore(store);
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getAll(store) {
    return requestToPromise(tx(store).getAll());
  }

  function get(store, key) {
    return requestToPromise(tx(store).get(key));
  }

  function put(store, value) {
    window.App.setSavingState && window.App.setSavingState("saving");
    return requestToPromise(tx(store, "readwrite").put(value)).then((result) => {
      window.App.setSavingState && window.App.setSavingState("saved");
      return result;
    });
  }

  function remove(store, key) {
    window.App.setSavingState && window.App.setSavingState("saving");
    return requestToPromise(tx(store, "readwrite").delete(key)).then((result) => {
      window.App.setSavingState && window.App.setSavingState("saved");
      return result;
    });
  }

  function getSetting(key) {
    return get("settings", key).then((record) => record ? record.value : null);
  }

  function setSetting(key, value) {
    return put("settings", { key, value });
  }

  function clear(store) {
    return requestToPromise(tx(store, "readwrite").clear());
  }

  async function seedIfNeeded() {
    const users = await getAll("users");
    if (users.length) return;

    const createdAt = nowIso();
    const entities = defaultEntities.map((name) => ({
      id: uid("entity"),
      name,
      description: "جهة افتراضية ضمن منظومة متابعة مهام البنية التحتية",
      isActive: true,
      createdAt,
      updatedAt: createdAt
    }));

    for (const entity of entities) await put("entities", entity);

    const admin = {
      id: uid("user"),
      name: "مدير النظام",
      username: "admin",
      password: "ChangeMe@123",
      role: "مدير النظام",
      linkedEntities: entities.map((entity) => entity.id),
      permissions: permissions.slice(),
      isActive: true,
      mustChangePassword: true,
      createdAt,
      updatedAt: createdAt,
      lastLoginAt: null
    };
    await put("users", admin);

    for (let index = 0; index < entities.length; index += 1) {
      await put("users", {
        id: uid("user"),
        name: entities[index].name,
        username: `user${index + 1}`,
        password: "ChangeMe@123",
        role: "مستخدم جهة",
        linkedEntities: [entities[index].id],
        permissions: ["dashboard.view", "tasks.view", "tasks.updateStatus", "meetings.view", "reports.view", "tasks.export"],
        isActive: true,
        mustChangePassword: true,
        createdAt,
        updatedAt: createdAt,
        lastLoginAt: null
      });
    }

    await put("settings", { key: "created", value: createdAt });
    await put("settings", { key: "theme", value: "madinah" });
  }

  async function addAudit(action, module, recordId, oldValues, newValues) {
    const user = window.Auth && window.Auth.currentUser();
    await put("auditLogs", {
      id: uid("audit"),
      userId: user ? user.id : "system",
      username: user ? user.username : "system",
      action,
      module,
      recordId,
      oldValues: oldValues || null,
      newValues: newValues || null,
      createdAt: nowIso()
    });
  }

  async function saveTask(task, oldTask) {
    const now = nowIso();
    const current = window.Auth && window.Auth.currentUser();
    const normalized = {
      ...task,
      id: task.id || uid("task"),
      meetingId: task.meetingId || task.meetingTitle || "اجتماع غير محدد",
      isEscalated: isEscalationValue(task.escalationStatus, task.isEscalated),
      isDeleted: Boolean(task.isDeleted),
      completionPercentage: Number(task.completionPercentage || 0),
      updatedAt: now,
      updatedBy: current ? current.id : "system",
      createdAt: task.createdAt || now,
      createdBy: task.createdBy || (current ? current.id : "system")
    };

    await put("tasks", normalized);
    await upsertMeetingFromTask(normalized);
    await addAudit(oldTask ? "تعديل مهمة" : "إضافة مهمة", "tasks", normalized.id, oldTask || null, normalized);

    if (oldTask && (oldTask.status !== normalized.status || oldTask.feedback !== normalized.feedback)) {
      await put("taskUpdates", {
        id: uid("update"),
        taskId: normalized.id,
        oldStatus: oldTask.status,
        newStatus: normalized.status,
        oldFeedback: oldTask.feedback,
        newFeedback: normalized.feedback,
        note: "تحديث الحالة أو الإفادة",
        updatedBy: current ? current.username : "system",
        createdAt: now
      });
    }

    return normalized;
  }

  async function upsertMeetingFromTask(task) {
    const meetings = await getAll("meetings");
    const meetingId = task.meetingId || `${task.meetingTitle}-${task.meetingDate}`;
    const related = (await getAll("tasks")).filter((item) => !item.isDeleted && (item.meetingId === meetingId || item.meetingTitle === task.meetingTitle));
    const existing = meetings.find((meeting) => meeting.id === meetingId || meeting.title === task.meetingTitle);
    const now = nowIso();
    const meeting = {
      id: existing ? existing.id : meetingId,
      title: task.meetingTitle || task.meetingId || "محضر اجتماع",
      meetingDate: task.meetingDate || "",
      entityId: task.entityId || "",
      tasksCount: related.length,
      notes: existing ? existing.notes : "",
      createdBy: existing ? existing.createdBy : (task.createdBy || "system"),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      isDeleted: false
    };
    await put("meetings", meeting);
  }

  function isEscalationValue(value, fallback) {
    const text = String(value || "").trim();
    if (text.includes("غير") || text.includes("ØºÙŠØ±")) return false;
    return Boolean(fallback) || text === "مصعد" || text.includes("مصعد") || text.includes("ØµØ¹Ø¯");
  }

  async function softDeleteTask(id) {
    const task = await get("tasks", id);
    if (!task) return;
    const deleted = { ...task, isDeleted: true, updatedAt: nowIso() };
    await put("tasks", deleted);
    await addAudit("حذف ناعم لمهمة", "tasks", id, task, deleted);
  }

  async function replaceStore(store, values) {
    await clear(store);
    for (const value of values || []) await put(store, value);
  }

  async function exportAll() {
    const data = {};
    for (const store of stores) data[store] = await getAll(store);
    data.meta = { exportedAt: nowIso(), dbName: DB_NAME, version: DB_VERSION };
    return data;
  }

  async function importAll(data) {
    for (const store of stores) await replaceStore(store, Array.isArray(data[store]) ? data[store] : []);
    await addAudit("استعادة نسخة احتياطية", "database", "all", null, { stores: stores.length });
  }

  async function countRecords() {
    const counts = {};
    let total = 0;
    for (const store of stores) {
      counts[store] = (await getAll(store)).length;
      total += counts[store];
    }
    counts.total = total;
    return counts;
  }

  async function snapshot() {
    const data = {};
    for (const store of stores) data[store] = await getAll(store);
    return data;
  }

  window.DB = {
    open, getAll, get, put, remove, clear, getSetting, setSetting, saveTask, softDeleteTask, addAudit,
    exportAll, importAll, replaceStore, countRecords, snapshot, defaultEntities
  };
})();
