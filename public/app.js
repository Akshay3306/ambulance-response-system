const state = {
  user: null,
  view: "overview",
  requests: [],
  fleet: [],
  drivers: [],
  team: [],
  report: null,
  requestFilter: "all",
  requestSearch: "",
  toastTimer: null,
};

const viewTitles = {
  overview: "Overview",
  requests: "Emergency requests",
  "new-request": "New request",
  dispatch: "Dispatch board",
  tracking: "Live tracking",
  fleet: "Ambulance fleet",
  drivers: "Driver activity",
  reports: "Reports",
  team: "Team & access",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const activeStatuses = ["pending", "dispatched", "en-route", "on-scene"];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function initials(name = "") {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

function titleCase(value = "") {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function elapsed(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 1 ? "Just now" : `${minutes} min ago`;
}

function statusPill(status) {
  return `<span class="status-pill status-${escapeHtml(status)}">${escapeHtml(titleCase(status))}</span>`;
}

function priorityPill(priority) {
  return `<span class="priority-pill priority-${escapeHtml(priority)}">●&nbsp; ${escapeHtml(titleCase(priority))}</span>`;
}

function canDispatch() {
  return ["admin", "dispatcher"].includes(state.user?.role);
}

function canManageRequests() {
  return ["admin", "dispatcher"].includes(state.user?.role);
}

function canUpdateRequest(request) {
  return canManageRequests() || (state.user?.role === "driver" && String(request.assignedDriver?._id || request.assignedDriver) === state.user.id);
}

function nextAction(status) {
  return ({ dispatched: ["en-route", "Start route"], "en-route": ["on-scene", "Mark on scene"], "on-scene": ["completed", "Complete call"] })[status] || null;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  if (response.status === 401 && !url.endsWith("/login")) {
    showLogin();
    throw new Error("Your session has ended. Please sign in again.");
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

function showToast(message, type = "success") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show${type === "error" ? " error" : ""}`;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { toast.className = "toast"; }, 3200);
}

function showLogin() {
  state.user = null;
  $("#app-shell").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
}

function showApp(user) {
  state.user = user;
  $("#login-screen").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");
  $("#user-name").textContent = user.name;
  $("#user-role").textContent = titleCase(user.role);
  $("#user-avatar").textContent = initials(user.name);
  $$(".nav-link").forEach((item) => {
    const roleHidden = item.dataset.roles && !item.dataset.roles.split(",").includes(user.role);
    const driverNewRequest = user.role === "driver" && item.dataset.view === "new-request";
    item.classList.toggle("hidden", Boolean(roleHidden || driverNewRequest));
  });
  navigate(state.view);
}

async function loadData() {
  const [requestData, fleetData] = await Promise.all([
    api("/api/requests"),
    api("/api/fleet"),
  ]);
  state.requests = requestData.requests;
  state.fleet = fleetData.ambulances;
  state.drivers = fleetData.drivers;
  state.team = fleetData.team || [];
  $("#nav-active-count").textContent = state.requests.filter((item) => activeStatuses.includes(item.status)).length;
  renderView();
}

function navigate(view) {
  if (!viewTitles[view]) return;
  if (view === "reports" && !canDispatch()) view = "overview";
  if (view === "team" && state.user?.role !== "admin") view = "overview";
  if (["fleet", "drivers", "dispatch"].includes(view) && !canDispatch()) view = "overview";
  state.view = view;
  $("#page-crumb").textContent = viewTitles[view];
  $$(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === view));
  $(".sidebar").classList.remove("open");
  renderView();
}

function heading(kicker, title, description, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${escapeHtml(kicker)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${action}</div>`;
}

function requestTable(requests, options = {}) {
  if (!requests.length) return `<div class="empty-state">${escapeHtml(options.empty || "No emergency requests to show.")}</div>`;
  const showActions = options.actions !== false;
  return `<div class="table-wrap"><table><thead><tr><th>Request</th><th>Emergency</th><th>Pickup location</th><th>Priority</th><th>Status</th><th>Received</th>${showActions ? "<th></th>" : ""}</tr></thead><tbody>${requests.map((request) => {
    let action = "";
    if (showActions && canManageRequests() && request.status === "pending") {
      action = `<button class="table-action" data-go-dispatch="${request._id}">Assign →</button>`;
    } else if (showActions && canUpdateRequest(request) && nextAction(request.status)) {
      const [next] = nextAction(request.status);
      action = `<button class="table-action" data-status="${request._id}" data-next="${next}">${escapeHtml(nextAction(request.status)[1])} →</button>`;
    }
    return `<tr>
      <td><span class="request-id">${escapeHtml(request.requestNumber)}</span><span class="secondary-cell">${escapeHtml(request.requester?.name || "Requester")}</span></td>
      <td><span class="primary-cell">${escapeHtml(titleCase(request.emergencyType))}</span><span class="secondary-cell">${escapeHtml(request.patientName || "Patient details pending")}</span></td>
      <td><span class="primary-cell">${escapeHtml(request.pickup?.address)}</span><span class="secondary-cell">${escapeHtml(request.assignedAmbulance?.callSign || "Awaiting assignment")}</span></td>
      <td>${priorityPill(request.priority)}</td><td>${statusPill(request.status)}</td><td>${escapeHtml(elapsed(request.createdAt))}</td>
      ${showActions ? `<td>${action}</td>` : ""}</tr>`;
  }).join("")}</tbody></table></div>`;
}

function renderOverview() {
  const active = state.requests.filter((request) => activeStatuses.includes(request.status));
  const completed = state.requests.filter((request) => request.status === "completed");
  const available = state.fleet.filter((ambulance) => ambulance.status === "available").length;
  const occupied = state.fleet.filter((ambulance) => ["assigned", "on-scene"].includes(ambulance.status)).length;
  const responses = completed.map((request) => {
    const sent = new Date(request.dispatchedAt || 0);
    const arrived = new Date(request.arrivedAt || 0);
    return sent.getTime() && arrived.getTime() ? (arrived - sent) / 60000 : null;
  }).filter((value) => value !== null && value >= 0);
  const avg = responses.length ? (responses.reduce((sum, value) => sum + value, 0) / responses.length).toFixed(1) : "—";
  const action = state.user.role === "driver" ? "" : `<button class="button button-primary" data-nav="new-request"><span>＋</span> New emergency request</button>`;
  const latest = [...state.requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const activeRows = active.slice(0, 4);
  const fleetRows = state.fleet.slice(0, 4);
  $("#view-container").innerHTML = `${heading(new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase(), `Good day, ${state.user.name.split(" ")[0]}`, "Here's what is happening across your response network right now.", action)}
    <div class="metric-grid">
      <article class="metric-card"><div class="metric-top">Active emergencies<span class="metric-icon red">✚</span></div><div class="metric-value">${active.length}</div><div class="metric-foot"><strong>${active.filter((item) => item.status === "pending").length} awaiting dispatch</strong></div></article>
      <article class="metric-card"><div class="metric-top">Available ambulances<span class="metric-icon teal">▰</span></div><div class="metric-value">${available}<span style="font-size:14px;color:#99a5b6;font-weight:500"> / ${state.fleet.length}</span></div><div class="metric-foot">${occupied} currently responding</div></article>
      <article class="metric-card"><div class="metric-top">Avg. response time<span class="metric-icon">◷</span></div><div class="metric-value">${avg}<span style="font-size:14px;color:#99a5b6;font-weight:500">${avg === "—" ? "" : " min"}</span></div><div class="metric-foot">From completed calls</div></article>
      <article class="metric-card"><div class="metric-top">Completed calls<span class="metric-icon amber">✓</span></div><div class="metric-value">${completed.length}</div><div class="metric-foot">${state.drivers.length} drivers on the roster</div></article>
    </div>
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-header"><div><h2>Live emergency queue</h2><p class="panel-subtitle">Active cases that need your attention</p></div><button class="text-button" data-nav="requests">All requests →</button></div>
      ${activeRows.length ? requestTable(activeRows, { actions: true }) : `<div class="empty-state">No active emergencies. Your network is standing by.</div>`}
      </section>
      <section class="panel response-panel"><div class="panel-header"><div><h2>Response overview</h2><p class="panel-subtitle">Ambulance availability right now</p></div><button class="text-button" data-nav="tracking">Track →</button></div>
        <div class="response-main"><div class="response-time"><strong>${available}</strong><span>units ready</span></div><p class="response-note">${occupied} active response${occupied === 1 ? "" : "s"} · ${state.fleet.filter((item) => item.status === "maintenance").length} in maintenance</p></div>
        <svg class="mini-chart" viewBox="0 0 300 65" preserveAspectRatio="none" aria-label="Recent response trend"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5877ec" stop-opacity=".18"/><stop offset="1" stop-color="#5877ec" stop-opacity="0"/></linearGradient></defs><path d="M0 50 C24 44 31 51 51 38 S82 45 102 30 S135 43 154 28 S186 36 207 21 S243 33 264 13 S285 25 300 8 V65 H0Z" fill="url(#area)"/><path d="M0 50 C24 44 31 51 51 38 S82 45 102 30 S135 43 154 28 S186 36 207 21 S243 33 264 13 S285 25 300 8" fill="none" stroke="#5979ec" stroke-width="2"/></svg><div class="chart-labels"><span>08:00</span><span>10:00</span><span>12:00</span><span>14:00</span><span>Now</span></div>
        <div class="response-foot"><span>Fleet utilization</span><strong>${state.fleet.length ? Math.round((occupied / state.fleet.length) * 100) : 0}%</strong></div>
      </section>
    </div>
    <div class="bottom-grid">
      <section class="panel"><div class="panel-header"><div><h2>Fleet at a glance</h2><p class="panel-subtitle">Latest unit availability</p></div><button class="text-button" data-nav="${canDispatch() ? "fleet" : "tracking"}">View fleet →</button></div>
      <div class="fleet-list">${fleetRows.length ? fleetRows.map((unit) => `<div class="fleet-row"><span class="vehicle-icon">▰</span><span class="fleet-info"><strong>${escapeHtml(unit.callSign)} · ${escapeHtml(unit.station)}</strong><small>${escapeHtml(unit.vehicle)}</small></span>${statusPill(unit.status)}</div>`).join("") : `<div class="empty-state">Fleet details will appear here.</div>`}</div></section>
      <section class="panel"><div class="panel-header"><div><h2>Recent activity</h2><p class="panel-subtitle">Latest requests in your network</p></div><button class="text-button" data-nav="requests">View all →</button></div>
      <div class="alert-list">${latest.length ? latest.map((request) => `<div class="alert-item"><span class="alert-marker ${request.status !== "pending" ? "blue" : ""}"></span><span class="alert-copy"><strong>${escapeHtml(request.requestNumber)} · ${escapeHtml(titleCase(request.emergencyType))}</strong><small>${escapeHtml(request.pickup.address)} · ${escapeHtml(titleCase(request.status))}</small></span><span class="alert-time">${escapeHtml(elapsed(request.createdAt))}</span></div>`).join("") : `<div class="empty-state">No recent requests.</div>`}</div></section>
    </div>`;
}

function renderRequests() {
  const filters = `<div class="filter-row"><input id="request-search" class="search-input" type="search" placeholder="Search request, patient, or location" value="${escapeHtml(state.requestSearch)}"><select id="request-status" class="filter-select"><option value="all">All statuses</option>${["pending", "dispatched", "en-route", "on-scene", "completed", "cancelled"].map((status) => `<option value="${status}" ${state.requestFilter === status ? "selected" : ""}>${escapeHtml(titleCase(status))}</option>`).join("")}</select></div>`;
  const action = state.user.role === "driver" ? "" : `<button class="button button-primary" data-nav="new-request">＋ New request</button>`;
  $("#view-container").innerHTML = `${heading("CASE MANAGEMENT", "Emergency requests", "Review incidents, track their progress, and coordinate the next step.", action)}
    ${filters}<section class="panel list-panel" id="request-table">${requestTable(filteredRequests(), { empty: "No requests match your filters." })}</section>`;
  $("#request-search").addEventListener("input", (event) => {
    state.requestSearch = event.target.value;
    $("#request-table").innerHTML = requestTable(filteredRequests(), { empty: "No requests match your filters." });
    bindRequestActions();
  });
  $("#request-status").addEventListener("change", (event) => { state.requestFilter = event.target.value; renderRequests(); });
  bindRequestActions();
}

function filteredRequests() {
  const search = state.requestSearch.toLowerCase();
  return state.requests.filter((request) => {
    const matchesStatus = state.requestFilter === "all" || request.status === state.requestFilter;
    const searchable = [request.requestNumber, request.requester?.name, request.patientName, request.pickup?.address, request.emergencyType].join(" ").toLowerCase();
    return matchesStatus && searchable.includes(search);
  });
}

function bindRequestActions(root = $("#view-container")) {
  $$("[data-status]", root).forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await api(`/api/requests/${button.dataset.status}/status`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.next }) });
      showToast(`Request updated to ${titleCase(button.dataset.next)}.`);
      await loadData();
    } catch (error) {
      button.disabled = false;
      showToast(error.message, "error");
    }
  }));
  $$("[data-go-dispatch]", root).forEach((button) => button.addEventListener("click", () => navigate("dispatch")));
}

function renderNewRequest() {
  $("#view-container").innerHTML = `${heading("NEW INCIDENT", "Request an ambulance", "Share a few details so the nearest response team can be dispatched quickly.")}
    <div class="form-layout"><section class="form-card"><h2>Emergency details</h2><p>Fields marked with * are required to create a request.</p>
      <form id="request-form"><div class="field-grid">
        <div class="field"><label for="contact-name">Contact name *</label><input id="contact-name" name="name" class="form-control" value="${escapeHtml(state.user.name)}" required maxlength="100"></div>
        <div class="field"><label for="contact-phone">Contact phone *</label><input id="contact-phone" name="phone" class="form-control" value="${escapeHtml(state.user.phone || "")}" required maxlength="30" type="tel"></div>
        <div class="field"><label for="patient-name">Patient name</label><input id="patient-name" name="patientName" class="form-control" placeholder="If different from caller" maxlength="100"></div>
        <div class="field"><label for="emergency-type">Emergency type *</label><select id="emergency-type" name="emergencyType" class="form-control" required><option value="">Select type</option><option value="medical">Medical emergency</option><option value="cardiac">Cardiac</option><option value="trauma">Trauma / accident</option><option value="obstetric">Obstetric</option><option value="other">Other</option></select></div>
        <div class="field"><label for="priority">Priority</label><select id="priority" name="priority" class="form-control"><option value="critical">Critical — immediate threat</option><option value="high" selected>High — urgent response</option><option value="standard">Standard</option></select></div>
        <div class="field full"><label for="pickup-address">Pickup address *</label><input id="pickup-address" name="address" class="form-control" placeholder="Street address, area, city" required maxlength="250"></div>
        <div class="field"><label for="pickup-lat">Latitude * <span class="field-hint">(-90 to 90)</span></label><input id="pickup-lat" name="lat" class="form-control" type="number" step="any" min="-90" max="90" value="17.385" required></div>
        <div class="field"><label for="pickup-lng">Longitude * <span class="field-hint">(-180 to 180)</span></label><input id="pickup-lng" name="lng" class="form-control" type="number" step="any" min="-180" max="180" value="78.4867" required></div>
        <div class="field full"><label for="notes">Situation notes</label><textarea id="notes" name="notes" class="form-control" placeholder="Symptoms, access information, or other details the crew should know…" maxlength="1000"></textarea></div>
      </div><div class="form-actions"><button class="button button-soft" type="reset">Clear form</button><button class="button button-primary" type="submit">Submit emergency request <span>→</span></button></div></form>
    </section><aside class="form-card tip-card"><span class="tip-icon">✚</span><h3>Before you submit</h3><p>Accurate contact and location details help the dispatcher reach you and choose the closest available unit.</p><ul><li>Keep your phone nearby for follow-up.</li><li>Share a precise address or landmark.</li><li>For immediate danger, stay on the line.</li></ul></aside></div>`;
  $("#request-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    payload.lat = Number(payload.lat);
    payload.lng = Number(payload.lng);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { request } = await api("/api/requests", { method: "POST", body: JSON.stringify(payload) });
      showToast(`Emergency request ${request.requestNumber} created.`);
      state.requestFilter = "all";
      state.requestSearch = "";
      await loadData();
      navigate("requests");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
}

function renderDispatch() {
  const pending = state.requests.filter((request) => request.status === "pending");
  const available = state.fleet.filter((unit) => unit.status === "available");
  $("#view-container").innerHTML = `${heading("COORDINATION CENTER", "Dispatch board", "Assign the right crew and vehicle to each incoming emergency.", `<button class="button button-soft" id="dispatch-refresh">↻ Refresh queue</button>`)}
    <div class="dispatch-layout"><section class="panel"><div class="panel-header"><div><h2>Awaiting dispatch <span class="nav-count" style="display:inline-block;margin-left:5px">${pending.length}</span></h2><p class="panel-subtitle">Prioritised by severity · oldest first</p></div></div>
      ${pending.length ? pending.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((request, index) => `<article class="queue-card">
        <span class="queue-number">${String(index + 1).padStart(2, "0")}</span><div class="queue-content"><strong>${escapeHtml(request.requestNumber)} · ${escapeHtml(titleCase(request.emergencyType))} ${priorityPill(request.priority)}</strong><small>${escapeHtml(request.pickup.address)} · ${escapeHtml(request.requester.name)} · ${escapeHtml(request.requester.phone)} · ${escapeHtml(elapsed(request.createdAt))}</small>
        <form class="dispatch-form" data-dispatch-form="${request._id}"><select class="filter-select" name="ambulanceId" required aria-label="Select available ambulance"><option value="">Ambulance</option>${available.map((unit) => `<option value="${unit._id}">${escapeHtml(unit.callSign)} · ${escapeHtml(unit.station)}</option>`).join("")}</select><select class="filter-select" name="driverId" required aria-label="Select driver"><option value="">Driver</option>${state.drivers.map((driver) => `<option value="${driver._id}">${escapeHtml(driver.name)}</option>`).join("")}</select><button class="button button-primary button-small" type="submit" ${!available.length || !state.drivers.length ? "disabled" : ""}>Dispatch →</button></form></div>
        </article>`).join("") : `<div class="empty-state">All caught up. There are no requests waiting for dispatch.</div>`}
      </section>
      <aside class="panel"><div class="panel-header"><div><h2>Units ready to respond</h2><p class="panel-subtitle">${available.length} of ${state.fleet.length} vehicles available</p></div></div>
        <div class="fleet-list">${available.length ? available.map((unit) => `<div class="fleet-row"><span class="vehicle-icon">▰</span><span class="fleet-info"><strong>${escapeHtml(unit.callSign)}</strong><small>${escapeHtml(unit.station)} · ${escapeHtml(unit.vehicle)}</small></span><span class="status-pill status-available">Ready</span></div>`).join("") : `<div class="empty-state">No ambulances are available right now.</div>`}</div>
        <div class="tip-card"><h3>Dispatch protocol</h3><p>Confirm the incident location and emergency type, then pair an available vehicle with an active driver. The crew can update their status as the call progresses.</p></div>
      </aside></div>`;
  $("#dispatch-refresh").addEventListener("click", () => loadData().catch((error) => showToast(error.message, "error")));
  $$("[data-dispatch-form]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    try {
      const { request } = await api(`/api/requests/${form.dataset.dispatchForm}/dispatch`, { method: "PATCH", body: JSON.stringify(data) });
      showToast(`${request.assignedAmbulance.callSign} dispatched to ${request.requestNumber}.`);
      await loadData();
    } catch (error) {
      button.disabled = false;
      showToast(error.message, "error");
    }
  }));
}

function renderTracking() {
  const active = state.requests.filter((request) => activeStatuses.includes(request.status));
  const positions = [[22, 32], [68, 23], [43, 61], [79, 58], [25, 72], [55, 39]];
  const markers = state.fleet.map((unit, index) => `<div class="map-marker m${(index % 4) + 1}" title="${escapeHtml(unit.callSign)} · ${escapeHtml(titleCase(unit.status))}"><span>▰</span></div>`).join("")
    + active.map((request, index) => `<div class="map-marker request-marker" style="left:${positions[index % positions.length][0]}%;top:${positions[index % positions.length][1]}%" title="${escapeHtml(request.requestNumber)}"><span>✚</span></div>`).join("");
  $("#view-container").innerHTML = `${heading("FIELD OPERATIONS", "Live tracking", "A live operations view of your fleet and active incidents.", `<span class="status-pill status-available">● Simulated map view</span>`)}
    <div class="tracking-layout"><section class="panel"><div class="panel-header"><div><h2>Response network · Hyderabad</h2><p class="panel-subtitle">Vehicle and incident positions · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div><button class="text-button" id="tracking-refresh">↻ Refresh</button></div>
      <div class="map-card"><span class="map-label l1">BANJARA HILLS</span><span class="map-label l2">JUBILEE HILLS</span><span class="map-label l3">MASAB TANK</span><span class="map-label l4">MADHAPUR</span>${markers}<div class="map-legend"><span><i class="legend-dot"></i>Ambulance</span><span><i class="legend-dot red"></i>Incident</span></div></div></section>
      <aside class="tracking-aside"><section class="panel live-card"><div class="live-card-head"><strong>Active response units</strong><small>${state.fleet.filter((unit) => ["assigned", "on-scene"].includes(unit.status)).length} on call</small></div>
      ${state.fleet.filter((unit) => ["assigned", "on-scene"].includes(unit.status)).length ? state.fleet.filter((unit) => ["assigned", "on-scene"].includes(unit.status)).map((unit) => {
        const request = state.requests.find((item) => String(item.assignedAmbulance?._id || item.assignedAmbulance) === String(unit._id) && activeStatuses.includes(item.status));
        return `<div class="live-unit"><span class="vehicle-icon">▰</span><span class="live-unit-copy"><b>${escapeHtml(unit.callSign)} · ${escapeHtml(unit.driver?.name || "Crew assigned")}</b><small>${escapeHtml(request?.requestNumber || "Active call")} · ${escapeHtml(request?.pickup.address || unit.station)}</small></span>${statusPill(unit.status)}</div>`;
      }).join("") : `<div class="empty-state">No units are currently responding.</div>`}</section>
      <section class="panel live-card"><div class="live-card-head"><strong>Incident locations</strong><small>${active.length} active</small></div>${active.length ? active.slice(0, 5).map((request) => `<div class="live-unit"><span class="queue-number" style="width:28px;height:28px">✚</span><span class="live-unit-copy"><b>${escapeHtml(request.requestNumber)} · ${escapeHtml(titleCase(request.emergencyType))}</b><small>${escapeHtml(request.pickup.address)}</small></span>${statusPill(request.status)}</div>`).join("") : `<div class="empty-state">No incidents to map.</div>`}</section>
      <div class="tracking-note">Map positions are illustrative for this demo. Driver location updates can be sent securely through the fleet location API.</div></aside></div>`;
  $("#tracking-refresh").addEventListener("click", () => loadData().catch((error) => showToast(error.message, "error")));
}

function renderFleet() {
  const ready = state.fleet.filter((unit) => unit.status === "available").length;
  $("#view-container").innerHTML = `${heading("VEHICLE MANAGEMENT", "Ambulance fleet", "See vehicle readiness, station assignment, and current crew.")}
    <div class="metric-grid"><article class="metric-card"><div class="metric-top">Total units<span class="metric-icon">▰</span></div><div class="metric-value">${state.fleet.length}</div><div class="metric-foot">Across all response stations</div></article><article class="metric-card"><div class="metric-top">Ready to dispatch<span class="metric-icon teal">✓</span></div><div class="metric-value">${ready}</div><div class="metric-foot">Available for a new emergency</div></article><article class="metric-card"><div class="metric-top">On response<span class="metric-icon red">⌁</span></div><div class="metric-value">${state.fleet.filter((unit) => ["assigned", "on-scene"].includes(unit.status)).length}</div><div class="metric-foot">Assigned or at the scene</div></article><article class="metric-card"><div class="metric-top">Maintenance<span class="metric-icon amber">⚙</span></div><div class="metric-value">${state.fleet.filter((unit) => unit.status === "maintenance").length}</div><div class="metric-foot">Unavailable for dispatch</div></article></div>
    <section class="panel list-panel"><div class="panel-header"><div><h2>Response vehicles</h2><p class="panel-subtitle">Unit assignments and current availability</p></div></div><div class="table-wrap"><table><thead><tr><th>Call sign</th><th>Vehicle</th><th>Station</th><th>Assigned driver</th><th>Location</th><th>Status</th></tr></thead><tbody>${state.fleet.map((unit) => `<tr><td><span class="primary-cell">${escapeHtml(unit.callSign)}</span></td><td>${escapeHtml(unit.vehicle)}</td><td>${escapeHtml(unit.station)}</td><td>${escapeHtml(unit.driver?.name || "—")}</td><td>${Number(unit.location?.lat).toFixed(4)}, ${Number(unit.location?.lng).toFixed(4)}</td><td>${statusPill(unit.status)}</td></tr>`).join("") || `<tr><td colspan="6" class="empty-state">No fleet vehicles found.</td></tr>`}</tbody></table></div></section>`;
}

function renderDrivers() {
  const activity = new Map();
  state.requests.forEach((request) => {
    const id = request.assignedDriver?._id || request.assignedDriver;
    if (!id) return;
    const entry = activity.get(String(id)) || { assigned: 0, completed: 0, active: 0 };
    entry.assigned++;
    if (request.status === "completed") entry.completed++;
    if (activeStatuses.includes(request.status)) entry.active++;
    activity.set(String(id), entry);
  });
  $("#view-container").innerHTML = `${heading("CREW OPERATIONS", "Driver activity", "A quick view of your active crew and their current response workload.")}
    <div class="metric-grid"><article class="metric-card"><div class="metric-top">Active drivers<span class="metric-icon">♙</span></div><div class="metric-value">${state.drivers.length}</div><div class="metric-foot">Available on the roster</div></article><article class="metric-card"><div class="metric-top">Calls assigned<span class="metric-icon">▤</span></div><div class="metric-value">${[...activity.values()].reduce((sum, item) => sum + item.assigned, 0)}</div><div class="metric-foot">In loaded request history</div></article><article class="metric-card"><div class="metric-top">Calls completed<span class="metric-icon teal">✓</span></div><div class="metric-value">${[...activity.values()].reduce((sum, item) => sum + item.completed, 0)}</div><div class="metric-foot">Completed by listed drivers</div></article><article class="metric-card"><div class="metric-top">Crews on call<span class="metric-icon red">⌁</span></div><div class="metric-value">${state.fleet.filter((unit) => ["assigned", "on-scene"].includes(unit.status)).length}</div><div class="metric-foot">Currently responding</div></article></div>
    <section class="panel list-panel"><div class="panel-header"><div><h2>Driver roster</h2><p class="panel-subtitle">Call assignments and activity summary</p></div></div><div class="table-wrap"><table><thead><tr><th>Driver</th><th>Phone</th><th>License</th><th>Assigned calls</th><th>Completed</th><th>Active calls</th><th>Unit</th></tr></thead><tbody>${state.drivers.map((driver) => {
      const item = activity.get(String(driver._id)) || { assigned: 0, completed: 0, active: 0 };
      const unit = state.fleet.find((ambulance) => String(ambulance.driver?._id || ambulance.driver) === String(driver._id));
      return `<tr><td><span class="primary-cell">${escapeHtml(driver.name)}</span></td><td>${escapeHtml(driver.phone || "—")}</td><td>${escapeHtml(driver.licenseNumber || "—")}</td><td>${item.assigned}</td><td>${item.completed}</td><td>${item.active}</td><td>${escapeHtml(unit?.callSign || "—")}</td></tr>`;
    }).join("") || `<tr><td colspan="7" class="empty-state">No drivers found.</td></tr>`}</tbody></table></div></section>`;
}

function reportBars(items, key, color = "") {
  const max = Math.max(1, ...items.map((item) => Number(item.count || item[key] || 0)));
  return items.length ? items.map((item) => {
    const value = Number(item.count || item[key] || 0);
    const label = item.label || item.name || item._id?.status || item._id?.emergencyType || item.driver || "Other";
    return `<div class="bar-row"><span>${escapeHtml(titleCase(label))}</span><div class="bar-track"><div class="bar-fill ${color}" style="width:${Math.max(4, value / max * 100)}%"></div></div><strong>${value}</strong></div>`;
  }).join("") : `<div class="empty-state" style="padding:18px 5px">No report data for this period yet.</div>`;
}

function renderReports() {
  $("#view-container").innerHTML = `${heading("INSIGHTS & PERFORMANCE", "Reports", "Operational reports for emergency requests, utilization, response times, and driver activity.", `<div class="report-filter"><input id="report-from" class="filter-select" type="date" aria-label="From date"><input id="report-to" class="filter-select" type="date" aria-label="To date"><button id="report-apply" class="button button-soft">Apply</button></div>`)}
    <div id="report-content"><div class="empty-state">Loading reports…</div></div>`;
  $("#report-apply").addEventListener("click", loadReports);
  loadReports();
}

async function loadReports() {
  const from = $("#report-from").value;
  const to = $("#report-to").value;
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", `${to}T23:59:59.999Z`);
  const suffix = query.toString() ? `?${query}` : "";
  const container = $("#report-content");
  container.innerHTML = `<div class="empty-state">Loading reports…</div>`;
  try {
    const [requests, utilization, responseTimes, drivers] = await Promise.all([
      api(`/api/reports/requests${suffix}`),
      api(`/api/reports/utilization${suffix}`),
      api(`/api/reports/response-times${suffix}`),
      api(`/api/reports/driver-activity${suffix}`),
    ]);
    container.innerHTML = `<div class="report-grid">
      <article class="report-card"><h3>Emergency request report</h3><p>Request volume by status and incident type</p>${reportBars(requests.report.map((item) => ({ label: `${titleCase(item._id.status)} · ${titleCase(item._id.emergencyType)}`, count: item.count })), "count", "red")}</article>
      <article class="report-card"><h3>Ambulance utilization report</h3><p>Vehicle trips in period and current availability</p><div class="report-summary"><strong>${utilization.totals.total}</strong><span>requests in selected period</span></div>${reportBars(utilization.fleet.map((unit) => ({ label: `${unit.callSign} · ${titleCase(unit.status)}`, count: unit.trips })), "count", "teal")}<p>${utilization.totals.assigned} requests received a vehicle assignment.</p></article>
      <article class="report-card"><h3>Response time report</h3><p>Dispatch-to-arrival times for completed scenes</p><div class="report-summary"><strong>${responseTimes.avgMinutes === null ? "—" : responseTimes.avgMinutes.toFixed(1)}</strong><span>average minutes</span></div>${reportBars(responseTimes.report.slice(0, 6).map((item) => ({ label: item.requestNumber, count: Math.round(item.minutes) })), "count", "amber")}</article>
      <article class="report-card"><h3>Driver activity report</h3><p>Assigned, active, and completed calls by crew member</p>${reportBars(drivers.report.map((item) => ({ label: `${item.driver} · ${item.completed} completed`, count: item.assigned })), "count")}</article>
    </div><section class="panel report-table"><div class="panel-header"><div><h2>Response time detail</h2><p class="panel-subtitle">Dispatch to on-scene · minutes</p></div><span class="status-pill status-available">${responseTimes.report.length} records</span></div><div class="table-wrap"><table><thead><tr><th>Request</th><th>Incident</th><th>Priority</th><th>Dispatched</th><th>Arrived</th><th>Response time</th></tr></thead><tbody>${responseTimes.report.length ? responseTimes.report.map((item) => `<tr><td class="request-id">${escapeHtml(item.requestNumber)}</td><td>${escapeHtml(titleCase(item.emergencyType))}</td><td>${priorityPill(item.priority)}</td><td>${escapeHtml(dateTime(item.dispatchedAt))}</td><td>${escapeHtml(dateTime(item.arrivedAt))}</td><td><strong>${item.minutes.toFixed(1)} min</strong></td></tr>`).join("") : `<tr><td colspan="6" class="empty-state">Response-time data appears after a crew is marked on scene.</td></tr>`}</tbody></table></div></section>`;
  } catch (error) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderTeam() {
  $("#view-container").innerHTML = `${heading("ACCESS MANAGEMENT", "Team & access", "People and permissions currently configured for this response network.")}
    <div class="team-grid">${state.team.map((member) => `<article class="panel team-card"><div class="team-card-top"><span class="avatar">${escapeHtml(initials(member.name))}</span><span><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(titleCase(member.role))}</small></span>${statusPill(member.active ? "available" : "maintenance")}</div><div class="team-contact">${escapeHtml(member.email)}<br>${escapeHtml(member.phone || "No phone on file")}${member.licenseNumber ? `<br>License: ${escapeHtml(member.licenseNumber)}` : ""}</div></article>`).join("") || `<section class="panel empty-state">No team members found.</section>`}</div>
    <section class="panel" style="margin-top:15px"><div class="panel-header"><div><h2>Role permissions</h2><p class="panel-subtitle">Role-based access is enforced by the API.</p></div></div><div class="table-wrap"><table><thead><tr><th>Role</th><th>Typical access</th></tr></thead><tbody><tr><td><strong>Administrator</strong></td><td>Manage operations, dispatch, fleet, reports, and team access</td></tr><tr><td><strong>Dispatcher</strong></td><td>Create and coordinate requests, assign vehicles, access reports</td></tr><tr><td><strong>Ambulance driver</strong></td><td>View assigned calls and update response status</td></tr><tr><td><strong>Requester</strong></td><td>Create and track personal emergency requests</td></tr></tbody></table></div></section>`;
}

function renderView() {
  if (!state.user || $("#app-shell").classList.contains("hidden")) return;
  const renderers = {
    overview: renderOverview, requests: renderRequests, "new-request": renderNewRequest,
    dispatch: renderDispatch, tracking: renderTracking, fleet: renderFleet,
    drivers: renderDrivers, reports: renderReports, team: renderTeam,
  };
  (renderers[state.view] || renderOverview)();
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  $("#login-error").textContent = "";
  button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form));
    const { user } = await api("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
    showApp(user);
    await loadData();
  } catch (error) {
    $("#login-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$$("[data-demo]").forEach((button) => button.addEventListener("click", () => {
  const [email, password] = button.dataset.demo.split("|");
  $("#login-form").elements.email.value = email;
  $("#login-form").elements.password.value = password;
  $("#login-form").requestSubmit();
}));

$$("[data-view]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
$$("[data-view-link]").forEach((button) => button.addEventListener("click", (event) => {
  event.preventDefault();
  navigate(button.dataset.viewLink);
}));
$("#view-container").addEventListener("click", (event) => {
  const button = event.target.closest("[data-nav]");
  if (button) navigate(button.dataset.nav);
});
$("#refresh-button").addEventListener("click", () => loadData().catch((error) => showToast(error.message, "error")));
$("#mobile-menu").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
$("#profile-button").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
    showLogin();
  } catch (error) {
    showToast(error.message, "error");
  }
});
$("#current-date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date());

api("/api/auth/me")
  .then(async ({ user }) => { showApp(user); await loadData(); })
  .catch((error) => {
    if (!error.message.includes("session")) console.info("Sign in to open the operations workspace.");
  });
