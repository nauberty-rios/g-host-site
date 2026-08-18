(() => {
  "use strict";
  let started = false;
  let people = [];
  let projects = [];
  const $ = id => document.getElementById(id);
  const cfg = () => String(window.GHOST_AUTH_CONFIG?.apiBase || "").trim().replace(/\/+$/, "");
  const token = () => window.GHOST_ADMIN_SESSION?.() || "";

  const request = async (path, opts = {}) => {
    const response = await fetch(`${cfg()}${path}`, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token()}`
      },
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (response.status === 401) {
      window.GHOST_AUTH_LOGOUT?.();
      throw new Error("Sessão expirada.");
    }
    if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
    return data;
  };

  const actionButton = (label, handler, danger = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mini-btn${danger ? " danger" : ""}`;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  };

  const clearPerson = () => {
    ["person-id", "person-name", "person-phone", "person-email", "person-organization", "person-notes"].forEach(id => $(id).value = "");
    $("person-kind").value = "cliente";
  };

  const clearProject = () => {
    ["project-id", "project-code", "project-name", "project-type", "project-location", "project-start", "project-due", "project-description", "project-notes"].forEach(id => $(id).value = "");
    $("project-status").value = "planejamento";
  };

  const renderPeople = () => {
    const query = $("people-search").value.trim().toLowerCase();
    const body = $("people-rows");
    body.replaceChildren();
    const filtered = people.filter(person => !query || [person.name, person.email, person.phone, person.organization, person.kind].some(v => String(v || "").toLowerCase().includes(query)));
    $("people-count").textContent = String(people.length);
    for (const person of filtered) {
      const tr = document.createElement("tr");
      const name = document.createElement("td"); name.textContent = person.name;
      const kind = document.createElement("td"); kind.textContent = person.kind;
      const contact = document.createElement("td"); contact.textContent = [person.phone, person.email].filter(Boolean).join(" · ") || "—";
      const org = document.createElement("td"); org.textContent = person.organization || "—";
      const actions = document.createElement("td"); actions.className = "db-actions";
      actions.append(
        actionButton("Editar", () => editPerson(person)),
        actionButton("Excluir", () => deletePerson(person), true)
      );
      tr.append(name, kind, contact, org, actions);
      body.append(tr);
    }
    if (!filtered.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5; td.className = "db-empty"; td.textContent = "Nenhuma pessoa encontrada.";
      tr.append(td); body.append(tr);
    }
  };

  const renderProjects = () => {
    const query = $("project-search").value.trim().toLowerCase();
    const body = $("project-rows");
    body.replaceChildren();
    const filtered = projects.filter(project => !query || [project.code, project.name, project.status, project.location, project.type].some(v => String(v || "").toLowerCase().includes(query)));
    $("project-count").textContent = String(projects.length);
    for (const project of filtered) {
      const tr = document.createElement("tr");
      const code = document.createElement("td"); code.textContent = project.code;
      const name = document.createElement("td"); name.textContent = project.name;
      const status = document.createElement("td");
      const pill = document.createElement("span"); pill.className = "status-pill"; pill.textContent = String(project.status || "").replaceAll("_", " "); status.append(pill);
      const count = document.createElement("td"); count.textContent = String(project.people_count || 0);
      const actions = document.createElement("td"); actions.className = "db-actions";
      actions.append(
        actionButton("Editar", () => editProject(project)),
        actionButton("Pessoas", () => { $("link-project").value = String(project.id); loadRelations(project.id); location.hash = "vinculos"; }),
        actionButton("Excluir", () => deleteProject(project), true)
      );
      tr.append(code, name, status, count, actions);
      body.append(tr);
    }
    if (!filtered.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5; td.className = "db-empty"; td.textContent = "Nenhum projeto encontrado.";
      tr.append(td); body.append(tr);
    }
  };

  const fillRelationSelects = () => {
    const projectSelect = $("link-project");
    const personSelect = $("link-person");
    const oldProject = projectSelect.value;
    const oldPerson = personSelect.value;
    projectSelect.replaceChildren(); personSelect.replaceChildren();
    for (const project of projects) {
      const option = document.createElement("option"); option.value = project.id; option.textContent = `${project.code} — ${project.name}`; projectSelect.append(option);
    }
    for (const person of people) {
      const option = document.createElement("option"); option.value = person.id; option.textContent = `${person.name} (${person.kind})`; personSelect.append(option);
    }
    if ([...projectSelect.options].some(o => o.value === oldProject)) projectSelect.value = oldProject;
    if ([...personSelect.options].some(o => o.value === oldPerson)) personSelect.value = oldPerson;
    if (projectSelect.value) loadRelations(projectSelect.value);
  };

  const load = async () => {
    if (!cfg() || !token()) return;
    const [projectData, peopleData] = await Promise.all([request("/db/projects"), request("/db/people")]);
    projects = projectData.items || [];
    people = peopleData.items || [];
    renderProjects(); renderPeople(); fillRelationSelects();
  };

  const editPerson = person => {
    $("person-id").value = person.id;
    $("person-name").value = person.name || "";
    $("person-kind").value = person.kind || "cliente";
    $("person-phone").value = person.phone || "";
    $("person-email").value = person.email || "";
    $("person-organization").value = person.organization || "";
    $("person-notes").value = person.notes || "";
    location.hash = "pessoas";
  };

  const editProject = project => {
    $("project-id").value = project.id;
    $("project-code").value = project.code || "";
    $("project-name").value = project.name || "";
    $("project-status").value = project.status || "planejamento";
    $("project-type").value = project.type || "";
    $("project-location").value = project.location || "";
    $("project-start").value = project.start_date || "";
    $("project-due").value = project.due_date || "";
    $("project-description").value = project.description || "";
    $("project-notes").value = project.notes || "";
    location.hash = "projetos";
  };

  const deletePerson = async person => {
    if (!confirm(`Excluir ${person.name}? Os vínculos com projetos também serão removidos.`)) return;
    await request(`/db/people/${person.id}`, { method: "DELETE" });
    await load();
  };

  const deleteProject = async project => {
    if (!confirm(`Excluir o projeto ${project.code} — ${project.name}?`)) return;
    await request(`/db/projects/${project.id}`, { method: "DELETE" });
    await load();
  };

  const loadRelations = async projectId => {
    const root = $("project-people-list");
    root.replaceChildren();
    if (!projectId) return;
    try {
      const data = await request(`/db/projects/${projectId}/people`);
      for (const item of data.items || []) {
        const row = document.createElement("div"); row.className = "relation-row";
        const info = document.createElement("div");
        const strong = document.createElement("strong"); strong.textContent = item.name;
        const small = document.createElement("small"); small.textContent = [item.role, item.email, item.phone].filter(Boolean).join(" · ");
        info.append(strong, small);
        row.append(info, actionButton("Remover vínculo", async () => {
          await request(`/db/projects/${projectId}/people/${item.id}`, { method: "DELETE" });
          await loadRelations(projectId); await load();
        }, true));
        root.append(row);
      }
      if (!(data.items || []).length) {
        const empty = document.createElement("div"); empty.className = "db-empty"; empty.textContent = "Nenhuma pessoa vinculada a este projeto."; root.append(empty);
      }
    } catch (error) {
      const message = document.createElement("div"); message.className = "db-message error"; message.textContent = error.message; root.append(message);
    }
  };

  const start = () => {
    if (started) return;
    started = true;

    $("person-form").addEventListener("submit", async event => {
      event.preventDefault();
      const id = $("person-id").value;
      const payload = {
        name: $("person-name").value,
        kind: $("person-kind").value,
        phone: $("person-phone").value,
        email: $("person-email").value,
        organization: $("person-organization").value,
        notes: $("person-notes").value
      };
      await request(id ? `/db/people/${id}` : "/db/people", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      clearPerson(); await load();
    });

    $("project-form").addEventListener("submit", async event => {
      event.preventDefault();
      const id = $("project-id").value;
      const payload = {
        code: $("project-code").value,
        name: $("project-name").value,
        status: $("project-status").value,
        type: $("project-type").value,
        location: $("project-location").value,
        startDate: $("project-start").value,
        dueDate: $("project-due").value,
        description: $("project-description").value,
        notes: $("project-notes").value
      };
      await request(id ? `/db/projects/${id}` : "/db/projects", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      clearProject(); await load();
    });

    $("link-form").addEventListener("submit", async event => {
      event.preventDefault();
      const projectId = $("link-project").value;
      await request(`/db/projects/${projectId}/people`, {
        method: "POST",
        body: JSON.stringify({ personId: Number($("link-person").value), role: $("link-role").value, notes: $("link-notes").value })
      });
      $("link-role").value = ""; $("link-notes").value = "";
      await loadRelations(projectId); await load();
    });

    $("link-project").addEventListener("change", () => loadRelations($("link-project").value));
    $("people-search").addEventListener("input", renderPeople);
    $("project-search").addEventListener("input", renderProjects);
    $("person-cancel").addEventListener("click", clearPerson);
    $("project-cancel").addEventListener("click", clearProject);
    $("people-refresh").addEventListener("click", load);
    $("project-refresh").addEventListener("click", load);
    $("db-export").addEventListener("click", async () => {
      const data = await request("/db/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `g-host-banco-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
    });
    load().catch(error => console.error(error));
  };

  window.addEventListener("ghost-authenticated", start, { once: true });
})();
