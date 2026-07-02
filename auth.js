(function () {
  const { $, nowIso, toast } = window.AppUtils;
  const SESSION_KEY = "infrastructure_tasks_session";
  let userCache = null;

  function currentUser() {
    return userCache;
  }

  function hasPermission(permission) {
    if (!userCache) return false;
    if (userCache.role === "مدير النظام") return true;
    return Array.isArray(userCache.permissions) && userCache.permissions.includes(permission);
  }

  function canSeeEntity(entityId) {
    if (!userCache) return false;
    if (userCache.role === "مدير النظام") return true;
    return Array.isArray(userCache.linkedEntities) && userCache.linkedEntities.includes(entityId);
  }

  async function restoreSession() {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    const user = await window.DB.get("users", id);
    if (!user || !user.isActive) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    userCache = user;
    return user;
  }

  async function login(username, password) {
    const users = await window.DB.getAll("users");
    const user = users.find((item) => item.username === username && item.password === password);
    if (!user || !user.isActive) throw new Error("بيانات الدخول غير صحيحة أو الحساب غير فعال");
    user.lastLoginAt = nowIso();
    user.updatedAt = nowIso();
    await window.DB.put("users", user);
    await window.DB.addAudit("تسجيل دخول", "auth", user.id, null, { username: user.username });
    localStorage.setItem(SESSION_KEY, user.id);
    userCache = user;
    return user;
  }

  async function logout() {
    if (userCache) await window.DB.addAudit("تسجيل خروج", "auth", userCache.id, null, { username: userCache.username });
    localStorage.removeItem(SESSION_KEY);
    userCache = null;
    $("#appView").hidden = true;
    $("#loginView").hidden = false;
    toast("تم تسجيل الخروج", "success");
  }

  function filterTasksForUser(tasks) {
    if (!userCache) return [];
    if (userCache.role === "مدير النظام") return tasks;
    const allowed = new Set(userCache.linkedEntities || []);
    return tasks.filter((task) => allowed.has(task.entityId));
  }

  function showAppShell() {
    $("#loginView").hidden = true;
    $("#appView").hidden = false;
    $("#currentUserName").textContent = userCache ? userCache.name : "";
  }

  function bindLogin() {
    $("#loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = $("#loginError");
      error.hidden = true;
      try {
        await login($("#loginUsername").value.trim(), $("#loginPassword").value);
        showAppShell();
        await window.App.refreshAll();
        toast("تم تسجيل الدخول بنجاح", "success");
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    });

    $("#logoutBtn").addEventListener("click", logout);
  }

  window.Auth = { currentUser, hasPermission, canSeeEntity, restoreSession, login, logout, filterTasksForUser, showAppShell, bindLogin };
})();
