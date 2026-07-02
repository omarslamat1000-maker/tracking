(function () {
  const { $, escapeHtml, groupBy, sameTaskKey } = window.AppUtils;

  function renderReports(tasks, meetings) {
    if (!window.Auth.hasPermission("reports.view")) {
      $("#reportsGrid").innerHTML = `<div class="empty-state">لا تملك صلاحية عرض التقارير.</div>`;
      return;
    }
    const active = tasks.filter((task) => !task.isDeleted);
    const duplicateKeys = active.reduce((acc, task) => {
      const key = sameTaskKey(task);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const duplicateCount = Object.values(duplicateKeys).filter((count) => count > 1).length;
    const reports = [
      ["تقرير حسب الجهة", groupBy(active, (task) => task.entityName)],
      ["تقرير حسب المسؤول", groupBy(active, (task) => task.responsibleName)],
      ["تقرير حسب الحالة", groupBy(active, (task) => task.status)],
      ["المهام المتأخرة", { "متأخرة": active.filter((task) => task.status === "متأخر").length }],
      ["بنود التصعيد", groupBy(active.filter((task) => task.isEscalated || task.escalationStatus === "مصعد"), (task) => task.entityName)],
      ["جودة البيانات", {
        "مهام بلا حالة": active.filter((task) => !task.status || task.status === "غير محدد").length,
        "مهام بلا مسؤول": active.filter((task) => !task.responsibleName).length,
        "مهام بلا إفادة": active.filter((task) => !task.feedback).length,
        "مهام بلا تاريخ اجتماع": active.filter((task) => !task.meetingDate).length,
        "مهام مكررة محتملة": duplicateCount,
        "اجتماعات بلا مهام": meetings.filter((meeting) => !active.some((task) => task.meetingId === meeting.id || task.meetingTitle === meeting.title)).length
      }]
    ];

    $("#reportsGrid").innerHTML = reports.map(([title, data]) => `
      <article class="report-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="item-meta">
          ${Object.entries(data).sort((a, b) => b[1] - a[1]).map(([label, value]) => `<span>${escapeHtml(label || "غير محدد")}: ${value}</span>`).join("") || "<span>لا توجد بيانات</span>"}
        </div>
      </article>
    `).join("");
  }

  function executiveSummary(stats, tasks) {
    const active = tasks.filter((task) => !task.isDeleted);
    const entityCounts = groupBy(active, (task) => task.entityName);
    const lateCounts = groupBy(active.filter((task) => task.status === "متأخر"), (task) => task.entityName);
    const topEntity = topKey(entityCounts);
    const lateEntity = topKey(lateCounts);
    if (!active.length) {
      return "لا توجد مهام مسجلة بعد. يوصى باستيراد ملف Excel أو إضافة المهام يدويًا لبدء المتابعة التنفيذية.";
    }
    return `توضح بيانات المتابعة أن إجمالي المهام بلغ ${stats.total} مهمة، بنسبة إنجاز كلية قدرها ${stats.completion}%. تظهر ${topEntity || "لا توجد جهة محددة"} كأكثر الجهات ارتباطًا بالمهام، بينما تسجل ${lateEntity || "لا توجد جهة متأخرة"} أعلى مؤشرات التأخر. يوجد ${stats.escalated} بند تصعيد يتطلب متابعة مباشرة، ويوصى بتحديث الإفادات الناقصة ومراجعة المهام المتأخرة في أقرب اجتماع تنسيقي.`;
  }

  function topKey(data) {
    return Object.entries(data).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  }

  window.Reports = { renderReports, executiveSummary };
})();
