// Port of src/components/TopBar.tsx (no upload/admin/user section).

export function renderTopBar(container, state, actions) {
  const count = state.derived.filteredEpicTasks.length;
  container.innerHTML = `
    <div class="brand">
      <div class="brand-lines"><i></i><i></i><i></i></div>
      <div class="brand-name">rob<span>a</span>l<span>i</span>ze <em>lite</em></div>
    </div>
    <div class="topbar-actions">
      ${count > 0 ? `
        <div class="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input id="topbar-search" type="text" placeholder="Search projects..." />
          <button id="topbar-search-clear" class="${state.searchTerm ? "" : "hidden"}">×</button>
        </div>
        <div class="project-count"><span class="dot"></span>${count} projects</div>
        <button id="topbar-ai" class="pill pill-ghost">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/></svg>
          AI
        </button>
      ` : ""}
      <button id="topbar-jira" class="pill ${state.jiraConnected ? "pill-connected" : "pill-ghost"}">
        ${state.jiraConnected ? '<span class="dot dot-glow"></span>Jira Connected' : "Connect Jira"}
      </button>
    </div>
  `;

  const search = container.querySelector("#topbar-search");
  if (search) {
    search.value = state.searchTerm;
    search.addEventListener("input", (e) => {
      // re-render replaces the input; preserve focus and caret
      const pos = e.target.selectionStart;
      actions.setSearch(e.target.value);
      const next = document.getElementById("topbar-search");
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });
    container.querySelector("#topbar-search-clear")
      .addEventListener("click", () => actions.setSearch(""));
  }
  container.querySelector("#topbar-ai")?.addEventListener("click", actions.openAi);
  container.querySelector("#topbar-jira").addEventListener("click", () => {
    actions.openConnector();
  });
}
