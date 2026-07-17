// Port of src/components/JiraConnector.tsx — no admin/Supabase logic:
// everyone edits the full config, stored in localStorage only.
import { loadJiraConfig, saveJiraConfig, fetchJiraData, DEFAULT_JQL } from "./jira.js";
import { setupAutoRefresh, clearError } from "./main.js";

export function openConnector(state, actions) {
  const root = document.getElementById("connector-root");
  const saved = loadJiraConfig() || {};
  const connected = state.jiraConnected;

  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-header ${connected ? "modal-header-connected" : ""}">
          <span>${connected ? "Connected to Jira" : "Import from Jira"}</span>
          <button class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="field-hint">Credentials are optional — leave them empty to use the server-managed connection.</div>
          <label class="field">
            <span>Atlassian email (optional)</span>
            <input id="jc-email" type="email" placeholder="you@company.com" />
          </label>
          <label class="field">
            <span>API Token (optional)</span>
            <input id="jc-token" type="password" placeholder="Paste your Atlassian API token" />
            <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">Create an API token</a>
          </label>
          <label class="field">
            <span>JQL Query</span>
            <textarea id="jc-jql" rows="3"></textarea>
          </label>
          <div class="field-row">
            <label class="field">
              <span>Max rows</span>
              <input id="jc-maxrows" type="number" min="1" max="10000" style="width:100px" />
            </label>
            <label class="field">
              <span>Auto-refresh (seconds)</span>
              <input id="jc-refresh" type="number" min="0" step="30" placeholder="0 = off" style="width:120px" />
            </label>
          </div>
          <div id="jc-error" class="form-error hidden"></div>
          <div id="jc-progress" class="progress hidden">
            <span id="jc-progress-label"></span>
            <div class="progress-track"><div id="jc-progress-bar" class="progress-bar"></div></div>
          </div>
          <div class="modal-buttons">
            <button id="jc-fetch" class="btn-primary">${connected ? "Refresh Now" : "Get Data Now"}</button>
            ${connected ? '<button id="jc-disconnect" class="btn-danger">Disconnect</button>' : ""}
          </div>
        </div>
      </div>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);
  $("#jc-email").value = saved.email || "";
  $("#jc-token").value = saved.apiToken || "";
  $("#jc-jql").value = saved.jql || DEFAULT_JQL;
  $("#jc-maxrows").value = saved.maxRows ?? 5000;
  $("#jc-refresh").value = saved.refreshInterval ?? 0;

  function close() { root.innerHTML = ""; }
  $(".modal-close").addEventListener("click", close);
  $(".modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) close();
  });

  $("#jc-disconnect")?.addEventListener("click", () => {
    state.jiraConnected = false;
    setupAutoRefresh(); // clears the timer since jiraConnected is now false
    close();
    actions.setData(state.rawData, { silent: true }); // re-render topbar state
  });

  $("#jc-fetch").addEventListener("click", async () => {
    const config = {
      email: $("#jc-email").value.trim(),
      apiToken: $("#jc-token").value.trim(),
      jql: $("#jc-jql").value.trim(),
      maxRows: Number($("#jc-maxrows").value) || 1000,
      refreshInterval: parseInt($("#jc-refresh").value, 10) || 0,
    };
    const errorBox = $("#jc-error");
    errorBox.classList.add("hidden");
    if (!config.jql) {
      errorBox.textContent = "Please provide a JQL query.";
      errorBox.classList.remove("hidden");
      return;
    }
    saveJiraConfig(config);

    const btn = $("#jc-fetch");
    btn.disabled = true;
    btn.textContent = "Loading...";
    $("#jc-progress").classList.remove("hidden");
    try {
      const rows = await fetchJiraData(config, (loaded, total) => {
        $("#jc-progress-label").textContent = `Loading... ${loaded} / ${total} issues`;
        $("#jc-progress-bar").style.width = `${(loaded / total) * 100}%`;
      });
      if (rows.length === 0) {
        errorBox.textContent = "No results found for this JQL query.";
        errorBox.classList.remove("hidden");
        return;
      }
      state.jiraConnected = true;
      actions.setData(rows, { silent: true });
      clearError();
      setupAutoRefresh();
      close();
    } catch (err) {
      errorBox.textContent = err instanceof Error ? err.message : "Connection failed.";
      errorBox.classList.remove("hidden");
      state.jiraConnected = false;
    } finally {
      btn.disabled = false;
      btn.textContent = state.jiraConnected ? "Refresh Now" : "Get Data Now";
      $("#jc-progress")?.classList.add("hidden");
    }
  });
}
