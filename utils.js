(function () {
  const taskStatuses = ["تم الانتهاء", "جاري العمل", "تسليم جزئي", "متأخر", "لم يبدأ", "غير محدد"];
  const permissions = [
    "dashboard.view", "tasks.view", "tasks.create", "tasks.edit", "tasks.delete", "tasks.updateStatus",
    "tasks.export", "meetings.view", "meetings.create", "meetings.edit", "reports.view",
    "users.manage", "entities.manage", "database.backup", "database.restore", "database.importExcel",
    "settings.manage"
  ];

  const permissionLabels = {
    "dashboard.view": "عرض لوحة التحكم",
    "tasks.view": "عرض المهام",
    "tasks.create": "إضافة المهام",
    "tasks.edit": "تعديل المهام",
    "tasks.delete": "حذف المهام",
    "tasks.updateStatus": "تحديث الحالة",
    "tasks.export": "تصدير المهام",
    "meetings.view": "عرض الاجتماعات",
    "meetings.create": "إضافة الاجتماعات",
    "meetings.edit": "تعديل الاجتماعات",
    "reports.view": "عرض التقارير",
    "users.manage": "إدارة المستخدمين",
    "entities.manage": "إدارة الجهات",
    "database.backup": "نسخ احتياطي",
    "database.restore": "استعادة البيانات",
    "database.importExcel": "استيراد Excel",
    "settings.manage": "إدارة الإعدادات"
  };

  const statusWeights = {
    "تم الانتهاء": 100,
    "تسليم جزئي": 50,
    "جاري العمل": 30,
    "متأخر": 10,
    "لم يبدأ": 0,
    "غير محدد": 0
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function uid(prefix) {
    return `${prefix || "id"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(message, type) {
    const host = $("#toastHost");
    const node = document.createElement("div");
    node.className = `toast ${type || ""}`.trim();
    node.textContent = message;
    host.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type: type || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, "utf-8");
    });
  }

  function statusClass(status) {
    if (status === "تم الانتهاء") return "done";
    if (status === "جاري العمل") return "work";
    if (status === "تسليم جزئي") return "partial";
    if (status === "متأخر") return "late";
    if (status === "لم يبدأ") return "pending";
    return "unknown";
  }

  function completionFromStatus(status, fallback) {
    if (Number.isFinite(Number(fallback)) && Number(fallback) > 0) return Math.min(100, Math.max(0, Number(fallback)));
    return statusWeights[status] ?? 0;
  }

  function optionHtml(items, selected, emptyLabel) {
    const head = emptyLabel ? `<option value="">${escapeHtml(emptyLabel)}</option>` : "";
    return head + items.map((item) => {
      const value = typeof item === "object" ? item.value : item;
      const label = typeof item === "object" ? item.label : item;
      return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
  }

  function groupBy(items, getter) {
    return items.reduce((acc, item) => {
      const key = getter(item) || "غير محدد";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function unique(items) {
    return Array.from(new Set(items.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "ar"));
  }

  function sameTaskKey(task) {
    return [
      normalize(task.title),
      normalize(task.meetingTitle || task.meetingId),
      normalize(task.entityName || task.entityId),
      normalize(task.meetingDate),
      normalize(task.responsibleName)
    ].join("|");
  }

  window.AppUtils = {
    $, $$, uid, nowIso, formatDate, formatDateTime, normalize, escapeHtml, toast, downloadFile,
    readFileAsArrayBuffer, readFileAsText, statusClass, completionFromStatus, optionHtml,
    groupBy, unique, sameTaskKey, taskStatuses, permissions, permissionLabels, statusWeights
  };
})();
