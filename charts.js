(function () {
  const { groupBy, statusClass } = window.AppUtils;
  const chartInstances = {};
  const palette = ["#2f7d72", "#45988f", "#84bd5f", "#c79a3a", "#2874a6", "#c33b32", "#66736f", "#16463f"];
  const statusOrder = ["تم الانتهاء", "جاري العمل", "تسليم جزئي", "متأخر", "لم يبدأ", "غير محدد"];
  const statusColors = {
    "تم الانتهاء": "#2f7d72",
    "جاري العمل": "#2874a6",
    "تسليم جزئي": "#c79a3a",
    "متأخر": "#c33b32",
    "لم يبدأ": "#66736f",
    "غير محدد": "#b7c3bf"
  };

  const valueLabelsPlugin = {
    id: "valueLabels",
    afterDatasetsDraw(chart) {
      const options = chart.options.plugins.valueLabels || {};
      const ctx = chart.ctx;
      if (chart.config.type === "doughnut" && options.centerText) {
        const { left, right, top, bottom } = chart.chartArea;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#0d302c";
        ctx.font = "700 22px Segoe UI";
        ctx.fillText(options.centerText, (left + right) / 2, (top + bottom) / 2 - 4);
        if (options.centerSubtext) {
          ctx.fillStyle = "#66736f";
          ctx.font = "12px Segoe UI";
          ctx.fillText(options.centerSubtext, (left + right) / 2, (top + bottom) / 2 + 18);
        }
        ctx.restore();
      }
      if (chart.config.type !== "bar") return;
      ctx.save();
      ctx.fillStyle = "#273431";
      ctx.font = "700 11px Segoe UI";
      ctx.textBaseline = "middle";
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        meta.data.forEach((bar, index) => {
          const value = dataset.data[index];
          if (!value) return;
          const position = bar.tooltipPosition();
          ctx.textAlign = chart.options.indexAxis === "y" ? "left" : "center";
          ctx.fillText(String(value), position.x + (chart.options.indexAxis === "y" ? 8 : 0), position.y - (chart.options.indexAxis === "y" ? 0 : 10));
        });
      });
      ctx.restore();
    }
  };

  function makeChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const card = canvas.closest("article");
    setChartState(card, config.summary, hasData(config));
    if (chartInstances[id]) {
      chartInstances[id].destroy();
      delete chartInstances[id];
    }
    if (!hasData(config)) {
      drawEmpty(canvas);
      return;
    }
    if (!window.Chart) {
      drawFallback(canvas, config);
      return;
    }
    chartInstances[id] = new Chart(canvas, {
      type: config.type,
      data: {
        labels: config.labels,
        datasets: config.datasets
      },
      options: chartOptions(config),
      plugins: [valueLabelsPlugin]
    });
  }

  function hasData(config) {
    return config.datasets.some((dataset) => dataset.data.some((value) => Number(value) > 0));
  }

  function chartOptions(config) {
    const indexAxis = config.horizontal ? "y" : "x";
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis,
      cutout: config.type === "doughnut" ? "68%" : undefined,
      layout: { padding: { top: 4, bottom: 4 } },
      plugins: {
        legend: {
          display: config.legend !== false,
          position: "bottom",
          rtl: true,
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            padding: 14,
            color: "#273431",
            font: { family: "Segoe UI", size: 12 }
          }
        },
        tooltip: {
          rtl: true,
          textDirection: "rtl",
          backgroundColor: "#0d302c",
          titleFont: { family: "Segoe UI", size: 13 },
          bodyFont: { family: "Segoe UI", size: 12 },
          padding: 10,
          callbacks: {
            label: (context) => {
              const value = context.parsed.x ?? context.parsed.y ?? context.parsed;
              return `${context.dataset.label || "عدد المهام"}: ${value}`;
            }
          }
        }
      },
      valueLabels: {
        centerText: config.centerText,
        centerSubtext: config.centerSubtext
      },
      scales: config.type === "doughnut" ? {} : {
        x: {
          beginAtZero: true,
          grid: { color: "rgba(221, 230, 227, 0.75)", drawBorder: false },
          ticks: { precision: 0, color: "#66736f", font: { family: "Segoe UI", size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { display: !config.horizontal, drawBorder: false },
          ticks: { precision: 0, color: "#273431", font: { family: "Segoe UI", size: 11 } }
        }
      }
    };
  }

  function setChartState(card, summary, hasValues) {
    if (!card) return;
    card.classList.add("chart-card");
    card.classList.toggle("is-empty", !hasValues);
    let summaryNode = card.querySelector(".chart-summary");
    if (!summaryNode) {
      summaryNode = document.createElement("p");
      summaryNode.className = "chart-summary";
      card.querySelector("h3").insertAdjacentElement("afterend", summaryNode);
    }
    summaryNode.textContent = summary;
  }

  function drawEmpty(canvas) {
    const ctx = prepareCanvas(canvas);
    const width = canvas.width;
    const height = canvas.height;
    ctx.fillStyle = "#f7f9f8";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#66736f";
    ctx.font = "600 14px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("لا توجد بيانات كافية للرسم", width / 2, height / 2);
  }

  function drawFallback(canvas, config) {
    const ctx = prepareCanvas(canvas);
    const width = canvas.width;
    const height = canvas.height;
    ctx.fillStyle = "#f7f9f8";
    ctx.fillRect(0, 0, width, height);
    const data = config.datasets[0].data;
    const max = Math.max(1, ...data);
    const barHeight = Math.max(14, (height - 46) / Math.max(1, data.length) - 8);
    data.forEach((value, index) => {
      const barWidth = (width - 120) * (value / max);
      const y = 26 + index * (barHeight + 8);
      ctx.fillStyle = config.datasets[0].backgroundColor[index] || palette[index % palette.length];
      ctx.fillRect(88, y, barWidth, barHeight);
      ctx.fillStyle = "#273431";
      ctx.font = "12px Segoe UI";
      ctx.textAlign = "right";
      ctx.fillText(String(config.labels[index]).slice(0, 14), 80, y + barHeight - 3);
      ctx.textAlign = "left";
      ctx.fillText(String(value), 94 + barWidth, y + barHeight - 3);
    });
  }

  function prepareCanvas(canvas) {
    const width = canvas.clientWidth || 420;
    const height = canvas.clientHeight || 240;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    return ctx;
  }

  function renderCharts(tasks) {
    const active = tasks.filter((task) => !task.isDeleted);
    const openTasks = active.filter((task) => task.status !== "تم الانتهاء");

    const status = groupBy(active, (task) => task.status || "غير محدد");
    const statusLabels = statusOrder.filter((label) => status[label]);
    const statusData = statusLabels.map((label) => status[label]);
    makeChart("statusChart", {
      type: "doughnut",
      labels: statusLabels,
      datasets: [{
        label: "عدد المهام",
        data: statusData,
        backgroundColor: statusLabels.map((label) => statusColors[label]),
        borderColor: "#ffffff",
        borderWidth: 3,
        hoverOffset: 8
      }],
      summary: active.length ? `إجمالي ${active.length} مهمة موزعة حسب حالة التنفيذ.` : "لا توجد مهام مسجلة بعد."
      ,
      centerText: String(active.length),
      centerSubtext: "مهمة"
    });

    const entityRows = topEntries(groupBy(active, (task) => task.entityName || "غير محدد"), 8);
    makeChart("entityChart", {
      type: "bar",
      horizontal: true,
      legend: false,
      labels: entityRows.map(([label]) => label),
      datasets: [{
        label: "عدد المهام",
        data: entityRows.map(([, value]) => value),
        backgroundColor: entityRows.map((_, index) => index === 0 ? "#1f655c" : "#45988f"),
        borderRadius: 8,
        barThickness: 16
      }],
      summary: entityRows.length ? `أعلى جهة حاليًا: ${entityRows[0][0]} بعدد ${entityRows[0][1]} مهمة.` : "لا توجد مهام مرتبطة بالجهات."
    });

    const ownerRows = topEntries(groupBy(openTasks, (task) => task.responsibleName || "غير محدد"), 8);
    makeChart("ownerChart", {
      type: "bar",
      horizontal: true,
      legend: false,
      labels: ownerRows.map(([label]) => label),
      datasets: [{
        label: "مهام مفتوحة",
        data: ownerRows.map(([, value]) => value),
        backgroundColor: ownerRows.map((_, index) => index === 0 ? "#c79a3a" : "#84bd5f"),
        borderRadius: 8,
        barThickness: 16
      }],
      summary: ownerRows.length ? `يعرض الرسم المهام غير المكتملة فقط، وأكثر مسؤول لديه ${ownerRows[0][1]} مهمة مفتوحة.` : "لا توجد مهام مفتوحة على المسؤولين."
    });

    const timelineRows = timelineEntries(active);
    makeChart("timelineChart", {
      type: "line",
      labels: timelineRows.map(([label]) => label),
      legend: false,
      datasets: [{
        label: "مهام حسب شهر الاجتماع",
        data: timelineRows.map(([, value]) => value),
        backgroundColor: "rgba(69, 152, 143, 0.14)",
        borderColor: "#2f7d72",
        pointBackgroundColor: "#c79a3a",
        pointBorderColor: "#ffffff",
        pointRadius: 4,
        fill: true,
        tension: 0.35
      }],
      summary: timelineRows.length ? `آخر شهر ظاهر: ${timelineRows[timelineRows.length - 1][0]} بعدد ${timelineRows[timelineRows.length - 1][1]} مهمة.` : "لا توجد تواريخ اجتماعات كافية لبناء اتجاه زمني."
    });

    const done = active.filter((task) => task.status === "تم الانتهاء").length;
    const remaining = Math.max(0, active.length - done);
    const donePercent = active.length ? Math.round((done / active.length) * 100) : 0;
    makeChart("doneChart", {
      type: "doughnut",
      labels: ["مكتمل", "متبقي"],
      datasets: [{
        label: "عدد المهام",
        data: [done, remaining],
        backgroundColor: ["#2f7d72", "#dde6e3"],
        borderColor: "#ffffff",
        borderWidth: 3,
        hoverOffset: 8
      }],
      summary: active.length ? `نسبة الإغلاق الفعلية ${donePercent}%، والمتبقي ${remaining} مهمة.` : "لا توجد مهام لحساب نسبة الإغلاق."
      ,
      centerText: `${donePercent}%`,
      centerSubtext: "إغلاق"
    });

    const escalatedRows = topEntries(groupBy(active.filter(isTaskEscalated), (task) => task.entityName || "غير محدد"), 8);
    makeChart("escalationChart", {
      type: "bar",
      horizontal: true,
      legend: false,
      labels: escalatedRows.map(([label]) => label),
      datasets: [{
        label: "بنود تصعيد",
        data: escalatedRows.map(([, value]) => value),
        backgroundColor: escalatedRows.map((_, index) => index === 0 ? "#c33b32" : "#d76f67"),
        borderRadius: 8,
        barThickness: 16
      }],
      summary: escalatedRows.length ? `أعلى جهة في التصعيد: ${escalatedRows[0][0]} بعدد ${escalatedRows[0][1]} بند.` : "لا توجد بنود تصعيد حالية."
    });
  }

  function topEntries(data, limit) {
    return Object.entries(data)
      .filter(([, value]) => Number(value) > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ar"))
      .slice(0, limit);
  }

  function timelineEntries(tasks) {
    const grouped = groupBy(tasks.filter((task) => task.meetingDate), (task) => task.meetingDate.slice(0, 7));
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  }

  function isTaskEscalated(task) {
    const text = String(task.escalationStatus || "").trim();
    if (text.includes("غير") || text.includes("ØºÙŠØ±")) return false;
    return Boolean(task.isEscalated) || text === "مصعد" || text.includes("مصعد") || text.includes("ØµØ¹Ø¯");
  }

  function kpiCards(stats) {
    const cards = [
      ["إجمالي الاجتماعات", stats.meetings, "leaf"],
      ["إجمالي المهام", stats.total, ""],
      ["المهام المكتملة", stats.done, "leaf"],
      ["المهام قيد العمل", stats.inProgress, "blue"],
      ["التسليم الجزئي", stats.partial, "gold"],
      ["المهام المتأخرة", stats.late, "red"],
      ["لم تبدأ", stats.pending, ""],
      ["غير محددة الحالة", stats.unknown, ""],
      ["بنود التصعيد", stats.escalated, "red"],
      ["الجهات المشاركة", stats.entities, "leaf"],
      ["نسبة الإنجاز الكلية", `${stats.completion}%`, "gold"]
    ];
    return cards.map(([label, value, className]) => `<article class="kpi-card ${className}"><strong>${value}</strong><span>${label}</span></article>`).join("");
  }

  function statusBadge(status) {
    return `<span class="badge ${statusClass(status)}">${status || "غير محدد"}</span>`;
  }

  window.Charts = { renderCharts, kpiCards, statusBadge };
})();
