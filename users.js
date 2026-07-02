(function () {
  const { $, $$, escapeHtml, optionHtml, permissions, permissionLabels, nowIso, uid, toast } = window.AppUtils;

  let users = [];
  let entities = [];

  function bindUsersEvents() {
    $("#userForm").addEventListener("submit", saveUser);
    $("#entityForm").addEventListener("submit", saveEntity);
    $("#resetUserForm").addEventListener("click", resetUserForm);
    $("#resetEntityForm").addEventListener("click", resetEntityForm);
  }

  async function loadAdminSections() {
    users = await window.DB.getAll("users");
    entities = await window.DB.getAll("entities");
    hydrateUserForm();
    renderUsers();
    renderEntities();
  }

  function hydrateUserForm() {
    $("#userForm [name='linkedEntities']").innerHTML = optionHtml(entities.map((entity) => ({ value: entity.id, label: entity.name })));
    $("#permissionsBox").innerHTML = permissions.map((permission) => `
      <label><input type="checkbox" value="${permission}"><span>${permissionLabels[permission] || permission}</span></label>
    `).join("");
  }

  function renderUsers() {
    const list = $("#usersList");
    if (!window.Auth.hasPermission("users.manage")) {
      list.innerHTML = `<div class="empty-state">لا تملك صلاحية إدارة المستخدمين.</div>`;
      return;
    }
    list.innerHTML = users.map((user) => `
      <article class="item-card">
        <h3>${escapeHtml(user.name)}</h3>
        <div class="item-meta">
          <span>اسم المستخدم: ${escapeHtml(user.username)}</span>
          <span>الدور: ${escapeHtml(user.role)}</span>
          <span>الحالة: ${user.isActive ? "فعال" : "معطل"}</span>
          <span>الجهات المرتبطة: ${linkedEntityNames(user).join("، ") || "-"}</span>
        </div>
        <div class="item-actions">
          <button type="button" data-edit-user="${user.id}">تعديل</button>
          <button type="button" data-toggle-user="${user.id}">${user.isActive ? "تعطيل" : "تفعيل"}</button>
          <button type="button" data-reset-pass="${user.id}">إعادة كلمة المرور</button>
        </div>
      </article>
    `).join("");
    $$("[data-edit-user]").forEach((btn) => btn.addEventListener("click", () => editUser(btn.dataset.editUser)));
    $$("[data-toggle-user]").forEach((btn) => btn.addEventListener("click", () => toggleUser(btn.dataset.toggleUser)));
    $$("[data-reset-pass]").forEach((btn) => btn.addEventListener("click", () => resetPassword(btn.dataset.resetPass)));
  }

  function renderEntities() {
    const list = $("#entitiesList");
    if (!window.Auth.hasPermission("entities.manage")) {
      list.innerHTML = `<div class="empty-state">لا تملك صلاحية إدارة الجهات.</div>`;
      return;
    }
    list.innerHTML = entities.map((entity) => {
      const tasks = window.App.state.tasks.filter((task) => task.entityId === entity.id && !task.isDeleted);
      const done = tasks.filter((task) => task.status === "تم الانتهاء").length;
      const completion = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
      return `
        <article class="item-card">
          <h3>${escapeHtml(entity.name)}</h3>
          <div class="item-meta">
            <span>${escapeHtml(entity.description || "-")}</span>
            <span>الحالة: ${entity.isActive ? "فعالة" : "معطلة"}</span>
            <span>عدد المهام: ${tasks.length}</span>
            <span>نسبة الإنجاز: ${completion}%</span>
          </div>
          <div class="item-actions">
            <button type="button" data-edit-entity="${entity.id}">تعديل</button>
            <button type="button" data-toggle-entity="${entity.id}">${entity.isActive ? "تعطيل" : "تفعيل"}</button>
          </div>
        </article>
      `;
    }).join("");
    $$("[data-edit-entity]").forEach((btn) => btn.addEventListener("click", () => editEntity(btn.dataset.editEntity)));
    $$("[data-toggle-entity]").forEach((btn) => btn.addEventListener("click", () => toggleEntity(btn.dataset.toggleEntity)));
  }

  function linkedEntityNames(user) {
    const ids = new Set(user.linkedEntities || []);
    return entities.filter((entity) => ids.has(entity.id)).map((entity) => entity.name);
  }

  function editUser(id) {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    const form = $("#userForm");
    form.elements.id.value = user.id;
    form.elements.name.value = user.name || "";
    form.elements.username.value = user.username || "";
    form.elements.password.value = "";
    form.elements.role.value = user.role || "مستخدم جهة";
    form.elements.isActive.checked = Boolean(user.isActive);
    Array.from(form.elements.linkedEntities.options).forEach((option) => {
      option.selected = (user.linkedEntities || []).includes(option.value);
    });
    $$("#permissionsBox input").forEach((input) => {
      input.checked = (user.permissions || []).includes(input.value);
    });
  }

  async function saveUser(event) {
    event.preventDefault();
    if (!window.Auth.hasPermission("users.manage")) {
      toast("لا تملك صلاحية إدارة المستخدمين", "error");
      return;
    }
    const form = event.currentTarget;
    const id = form.elements.id.value || uid("user");
    const old = users.find((item) => item.id === id);
    const selectedEntities = Array.from(form.elements.linkedEntities.selectedOptions).map((option) => option.value);
    const selectedPermissions = $$("#permissionsBox input:checked").map((input) => input.value);
    const user = {
      ...(old || {}),
      id,
      name: form.elements.name.value.trim(),
      username: form.elements.username.value.trim(),
      password: form.elements.password.value || (old ? old.password : "ChangeMe@123"),
      role: form.elements.role.value,
      linkedEntities: selectedEntities,
      permissions: form.elements.role.value === "مدير النظام" ? permissions.slice() : selectedPermissions,
      isActive: form.elements.isActive.checked,
      mustChangePassword: old ? old.mustChangePassword : true,
      createdAt: old ? old.createdAt : nowIso(),
      updatedAt: nowIso(),
      lastLoginAt: old ? old.lastLoginAt : null
    };
    if (!user.name || !user.username) {
      toast("يرجى تعبئة اسم المستخدم والاسم", "error");
      return;
    }
    await window.DB.put("users", user);
    await window.DB.addAudit(old ? "تعديل مستخدم" : "إضافة مستخدم", "users", user.id, old || null, user);
    toast("تم حفظ المستخدم", "success");
    resetUserForm();
    await window.App.refreshAll();
  }

  async function toggleUser(id) {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    const old = { ...user };
    user.isActive = !user.isActive;
    user.updatedAt = nowIso();
    await window.DB.put("users", user);
    await window.DB.addAudit(user.isActive ? "تفعيل مستخدم" : "تعطيل مستخدم", "users", user.id, old, user);
    toast("تم تحديث حالة المستخدم", "success");
    await window.App.refreshAll();
  }

  async function resetPassword(id) {
    const user = users.find((item) => item.id === id);
    if (!user || !confirm("سيتم تعيين كلمة المرور إلى ChangeMe@123")) return;
    const old = { ...user };
    user.password = "ChangeMe@123";
    user.mustChangePassword = true;
    user.updatedAt = nowIso();
    await window.DB.put("users", user);
    await window.DB.addAudit("إعادة تعيين كلمة المرور", "users", user.id, old, { id: user.id });
    toast("تمت إعادة تعيين كلمة المرور", "success");
    await window.App.refreshAll();
  }

  function resetUserForm() {
    $("#userForm").reset();
    $("#userForm [name='id']").value = "";
    $$("#permissionsBox input").forEach((input) => { input.checked = false; });
  }

  function editEntity(id) {
    const entity = entities.find((item) => item.id === id);
    if (!entity) return;
    const form = $("#entityForm");
    form.elements.id.value = entity.id;
    form.elements.name.value = entity.name || "";
    form.elements.description.value = entity.description || "";
    form.elements.isActive.checked = Boolean(entity.isActive);
  }

  async function saveEntity(event) {
    event.preventDefault();
    if (!window.Auth.hasPermission("entities.manage")) {
      toast("لا تملك صلاحية إدارة الجهات", "error");
      return;
    }
    const form = event.currentTarget;
    const id = form.elements.id.value || uid("entity");
    const old = entities.find((item) => item.id === id);
    const entity = {
      ...(old || {}),
      id,
      name: form.elements.name.value.trim(),
      description: form.elements.description.value.trim(),
      isActive: form.elements.isActive.checked,
      createdAt: old ? old.createdAt : nowIso(),
      updatedAt: nowIso()
    };
    if (!entity.name) {
      toast("اسم الجهة مطلوب", "error");
      return;
    }
    await window.DB.put("entities", entity);
    await window.DB.addAudit(old ? "تعديل جهة" : "إضافة جهة", "entities", entity.id, old || null, entity);
    toast("تم حفظ الجهة", "success");
    resetEntityForm();
    await window.App.refreshAll();
  }

  async function toggleEntity(id) {
    const entity = entities.find((item) => item.id === id);
    if (!entity) return;
    const old = { ...entity };
    entity.isActive = !entity.isActive;
    entity.updatedAt = nowIso();
    await window.DB.put("entities", entity);
    await window.DB.addAudit(entity.isActive ? "تفعيل جهة" : "تعطيل جهة", "entities", entity.id, old, entity);
    toast("تم تحديث حالة الجهة", "success");
    await window.App.refreshAll();
  }

  function resetEntityForm() {
    $("#entityForm").reset();
    $("#entityForm [name='id']").value = "";
  }

  window.Users = { bindUsersEvents, loadAdminSections };
})();
