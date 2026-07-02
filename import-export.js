(function () {
  const {
    $, formatDate, nowIso, escapeHtml, toast, downloadFile, readFileAsArrayBuffer,
    readFileAsText, sameTaskKey, normalize, completionFromStatus
  } = window.AppUtils;

  let restorePayload = null;
  let importPlan = null;

  function bindImportExportEvents() {
    $("#backupBtn").addEventListener("click", backup);
    $("#saveSheetUrlBtn").addEventListener("click", saveGoogleSheetUrl);
    $("#saveSheetSyncUrlBtn").addEventListener("click", saveGoogleSheetSyncUrl);
    $("#syncNowBtn").addEventListener("click", syncNowHandler);
    $("#restoreFile").addEventListener("change", previewRestore);
    $("#restoreBtn").addEventListener("click", restore);
    $("#excelFile").addEventListener("change", previewExcel);
    $("#importExcelBtn").addEventListener("click", executeImport);
    loadGoogleSheetUrl();
    loadGoogleSheetSyncUrl();
  }

  async function backup() {
    if (!window.Auth.hasPermission("database.backup")) {
      toast("لا تملك صلاحية النسخ الاحتياطي", "error");
      return;
    }
    const data = await window.DB.exportAll();
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`infrastructure_tasks_backup_${date}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    toast("تم تحميل النسخة الاحتياطية", "success");
  }

  async function previewRestore(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      restorePayload = JSON.parse(await readFileAsText(file));
      const html = [
        ["المستخدمون", restorePayload.users],
        ["الجهات", restorePayload.entities],
        ["الاجتماعات", restorePayload.meetings],
        ["المهام", restorePayload.tasks],
        ["سجلات التحديث", restorePayload.taskUpdates]
      ].map(([label, value]) => `<div>${label}: ${Array.isArray(value) ? value.length : 0}</div>`).join("");
      $("#restoreSummary").innerHTML = html;
      $("#restoreBtn").disabled = false;
    } catch (err) {
      restorePayload = null;
      $("#restoreSummary").textContent = "فشل قراءة ملف النسخة الاحتياطية.";
      $("#restoreBtn").disabled = true;
      toast("فشل قراءة JSON", "error");
    }
  }

  async function restore() {
    if (!window.Auth.hasPermission("database.restore")) {
      toast("لا تملك صلاحية استعادة البيانات", "error");
      return;
    }
    if (!restorePayload || !confirm("سيتم استبدال قاعدة البيانات الحالية. هل أنت متأكد؟")) return;
    await window.DB.importAll(restorePayload);
    toast("تمت استعادة النسخة الاحتياطية", "success");
    restorePayload = null;
    $("#restoreFile").value = "";
    $("#restoreSummary").textContent = "";
    $("#restoreBtn").disabled = true;
    await window.App.refreshAll();
  }

  function getSheetId(url) {
    try {
      const matches = /\/d\/([a-zA-Z0-9-_]+)/.exec(url);
      return matches ? matches[1] : null;
    } catch {
      return null;
    }
  }

  async function saveGoogleSheetUrl() {
    const input = $("#googleSheetUrl");
    const message = $("#googleSheetMessage");
    const url = String(input.value || "").trim();
    const sheetId = getSheetId(url);
    if (!url || !sheetId) {
      message.textContent = "أدخل رابط Google Sheets صالحًا.";
      message.className = "summary-box error";
      return;
    }
    await window.DB.setSetting("googleSheetUrl", url);
    message.textContent = "تم حفظ الرابط. سيُستخدم عند تحميل البيانات من Google Sheets.";
    message.className = "summary-box success";
  }

  async function loadGoogleSheetUrl() {
    const input = $("#googleSheetUrl");
    const url = await window.DB.getSetting("googleSheetUrl");
    if (url) input.value = url;
  }

  async function saveGoogleSheetSyncUrl() {
    const input = $("#googleSheetSyncUrl");
    const message = $("#googleSheetMessage");
    const url = String(input.value || "").trim();
    if (!url) {
      message.textContent = "أدخل رابط مزامنة صالحًا أو اتركه فارغًا.";
      message.className = "summary-box error";
      return;
    }
    await window.DB.setSetting("googleSheetSyncUrl", url);
    message.textContent = "تم حفظ رابط المزامنة. سيتم إرسال التحديثات عند حفظ المهام.";
    message.className = "summary-box success";
  }

  async function loadGoogleSheetSyncUrl() {
    const input = $("#googleSheetSyncUrl");
    const url = await window.DB.getSetting("googleSheetSyncUrl");
    if (url) input.value = url;
  }

  async function syncNowHandler() {
    const message = $("#googleSheetMessage");
    try {
      if (!window.GoogleSync) throw new Error("وحدة GoogleSync غير متوفرة.");
      await window.GoogleSync.syncNow();
      message.textContent = "تمت المزامنة بنجاح.";
      message.className = "summary-box success";
    } catch (err) {
      message.textContent = `فشل المزامنة: ${err.message}`;
      message.className = "summary-box error";
    }
  }

  function exportTasks(tasks) {
    if (!window.Auth.hasPermission("tasks.export")) {
      toast("لا تملك صلاحية تصدير المهام", "error");
      return;
    }
    const rows = (tasks || []).map((task) => ({
      "رقم": task.taskNumber || "",
      "محضر الاجتماع": task.meetingTitle || task.meetingId || "",
      "تاريخ الاجتماع": task.meetingDate || "",
      "جهة الاجتماع": task.entityName || "",
      "المهمة المسندة": task.title || "",
      "المسؤول": task.responsibleName || "",
      "الحالة": task.status || "",
      "نسبة الإنجاز": task.completionPercentage || 0,
      "حالة التصعيد": task.escalationStatus || "",
      "الإفادة": task.feedback || "",
      "آخر تحديث": task.updatedAt || ""
    }));
    if (!window.XLSX) {
      const csv = rows.map((row) => Object.values(row).map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
      downloadFile(`tasks_export_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
      toast("تم تصدير CSV لأن SheetJS غير متوفر", "success");
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "المهام");
    XLSX.writeFile(workbook, `tasks_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast("تم تصدير Excel", "success");
  }

  async function previewExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!window.XLSX) {
      toast("مكتبة SheetJS غير متوفرة. افتح الملف مع اتصال بالإنترنت أو أضف المكتبة محليًا.", "error");
      return;
    }
    try {
      const buffer = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      importPlan = await buildImportPlan(rows);
      $("#importSummary").innerHTML = renderImportSummary(importPlan);
      $("#importExcelBtn").disabled = false;
    } catch (err) {
      importPlan = null;
      $("#importSummary").textContent = "فشل قراءة Excel أو لم يتم التعرف على الأعمدة.";
      $("#importExcelBtn").disabled = true;
      toast("فشل قراءة Excel", "error");
    }
  }

  async function buildImportPlan(rows) {
    const known = ["الإفادة", "الحالة", "حالة التصعيد", "التاريخ", "المسؤول", "المهمة المسندة", "م", "محضر اجتماع", "عدد المهام", "تاريخ الاجتماع", "جهة الاجتماع"];
    const headerIndex = rows.findIndex((row) => row.some((cell) => known.includes(String(cell).trim())));
    if (headerIndex < 0) throw new Error("لا توجد أعمدة معروفة");
    const headers = rows[headerIndex].map((cell) => String(cell).trim());
    const dataRows = rows.slice(headerIndex + 1).filter((row) => row.some(Boolean));
    const entities = await window.DB.getAll("entities");
    const tasks = await window.DB.getAll("tasks");
    const taskKeys = new Map(tasks.filter((task) => !task.isDeleted).map((task) => [sameTaskKey(task), task]));
    const parsed = [];
    const duplicates = [];

    for (const row of dataRows) {
      const object = {};
      headers.forEach((header, index) => { object[header] = row[index]; });
      const entityName = text(object["جهة الاجتماع"]) || "غير محدد";
      let entity = entities.find((item) => normalize(item.name) === normalize(entityName));
      if (!entity) {
        entity = {
          id: `entity-${normalize(entityName).replace(/\s+/g, "-") || Date.now()}`,
          name: entityName,
          description: "أضيفت تلقائيًا من ملف Excel",
          isActive: true,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
      }
      const status = text(object["الحالة"]) || "غير محدد";
      const task = {
        meetingTitle: text(object["محضر اجتماع"]) || text(object["محضر الاجتماع"]) || "محضر مستورد",
        meetingId: normalize(text(object["محضر اجتماع"]) || text(object["محضر الاجتماع"]) || "محضر مستورد"),
        taskNumber: text(object["م"]) || "",
        meetingDate: dateValue(object["تاريخ الاجتماع"] || object["التاريخ"]),
        entityId: entity.id,
        entityName: entity.name,
        title: text(object["المهمة المسندة"]) || "مهمة مستوردة بدون عنوان",
        responsibleName: text(object["المسؤول"]),
        status,
        completionPercentage: completionFromStatus(status, 0),
        escalationStatus: text(object["حالة التصعيد"]) || "غير مصعد",
        isEscalated: normalize(object["حالة التصعيد"]).includes("مصعد"),
        priority: "متوسطة",
        feedback: text(object["الإفادة"]),
        notes: "",
        importedEntity: entity
      };
      const existing = taskKeys.get(sameTaskKey(task));
      if (existing) duplicates.push(task);
      parsed.push({ task, existing });
    }

    return {
      rows: dataRows.length,
      tasks: parsed,
      newTasks: parsed.filter((item) => !item.existing).length,
      updatedTasks: parsed.filter((item) => item.existing).length,
      duplicates: duplicates.length,
      missingStatus: parsed.filter((item) => !item.task.status || item.task.status === "غير محدد").length,
      missingResponsible: parsed.filter((item) => !item.task.responsibleName).length,
      missingFeedback: parsed.filter((item) => !item.task.feedback).length,
      escalated: parsed.filter((item) => item.task.isEscalated).length
    };
  }

  function renderImportSummary(plan) {
    return `
      <div>إجمالي الصفوف: ${plan.rows}</div>
      <div>مهام جديدة: ${plan.newTasks}</div>
      <div>مهام محدثة: ${plan.updatedTasks}</div>
      <div>صفوف مكررة محتملة: ${plan.duplicates}</div>
      <div>بدون حالة: ${plan.missingStatus}</div>
      <div>بدون مسؤول: ${plan.missingResponsible}</div>
      <div>بدون إفادة: ${plan.missingFeedback}</div>
      <div>بنود تحتوي على تصعيد: ${plan.escalated}</div>
    `;
  }

  async function executeImport() {
    if (!window.Auth.hasPermission("database.importExcel")) {
      toast("لا تملك صلاحية استيراد Excel", "error");
      return;
    }
    if (!importPlan) return;
    const mode = document.querySelector("input[name='importMode']:checked").value;
    if (mode === "replace" && !confirm("سيتم استبدال كل المهام الحالية. هل تريد المتابعة؟")) return;
    if (mode === "replace") await window.DB.replaceStore("tasks", []);
    const entities = await window.DB.getAll("entities");
    const entityIds = new Set(entities.map((entity) => entity.id));
    for (const item of importPlan.tasks) {
      if (!entityIds.has(item.task.importedEntity.id)) {
        await window.DB.put("entities", item.task.importedEntity);
        entityIds.add(item.task.importedEntity.id);
      }
      const existing = item.existing;
      if (mode === "new" && existing) continue;
      if (mode === "update" && !existing) continue;
      const task = { ...(existing || {}), ...item.task };
      delete task.importedEntity;
      await window.DB.saveTask(task, existing || null);
    }
    await window.DB.addAudit("استيراد Excel", "database", "tasks", null, { rows: importPlan.rows, mode });
    toast("تم تنفيذ الاستيراد بنجاح", "success");
    $("#excelFile").value = "";
    $("#importSummary").textContent = "";
    $("#importExcelBtn").disabled = true;
    importPlan = null;
    await window.App.refreshAll();
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

  window.ImportExport = { bindImportExportEvents, backup, exportTasks };
})();
