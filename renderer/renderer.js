const scheduleReveals = () => {
  const reveals = document.querySelectorAll(".reveal");
  reveals.forEach((element, index) => {
    window.setTimeout(() => {
      element.classList.add("is-visible");
    }, 120 * index);
  });
};

const hydrateAppMeta = async () => {
  if (!window.ifactory) {
    return;
  }

  try {
    const meta = window.ifactory.getMeta
      ? await window.ifactory.getMeta()
      : null;
    if (!meta) {
      return;
    }

    const versionEl = document.querySelector("[data-app-version]");
    if (versionEl && meta.version) {
      versionEl.textContent = `v${meta.version}`;
    }

    const descriptionEl = document.querySelector("[data-app-description]");
    if (descriptionEl && meta.description) {
      descriptionEl.textContent = meta.description;
    }
  } catch (error) {
    console.error("Failed to load app meta", error);
  }
};

const setupGithubOAuth = () => {
  if (
    !window.ifactory?.settings ||
    !window.ifactory?.github ||
    !window.ifactory?.git
  ) {
    return;
  }

  const skipKey = "ifactory.github.skip";
  const statusEl = document.querySelector("[data-github-status]");
  const connectButton = document.querySelector("[data-github-connect]");
  const skipButton = document.querySelector("[data-github-skip]");
  const flowEl = document.querySelector("[data-github-flow]");
  const codeEl = document.querySelector("[data-github-code]");
  const copyButton = document.querySelector("[data-github-copy]");
  const openButton = document.querySelector("[data-github-open]");
  const resetButton = document.querySelector("[data-setup-reset]");
  const gitSection = document.querySelector("[data-git-section]");
  const githubSection = document.querySelector("[data-github-section]");
  const gitStatusEl = document.querySelector("[data-git-status]");
  const gitCheckButton = document.querySelector("[data-git-check]");
  const gitSkipButton = document.querySelector("[data-git-skip]");
  const gitInstructions = document.querySelector("[data-git-instructions]");
  const gitOpenButton = document.querySelector("[data-git-open]");
  const createButton = document.querySelector("[data-action-create]");
  const cloneButton = document.querySelector("[data-action-clone]");
  const openProjectButton = document.querySelector("[data-action-open]");
  const backButtons = document.querySelectorAll("[data-action-back]");
  const createRepoToggle = document.querySelector("[data-create-repo]");
  const privateRepoToggle = document.querySelector("[data-create-private]");
  const createSubmitButton = document.querySelector("[data-create-submit]");
  const createNameInput = document.querySelector("[data-create-name]");
  const createLocationInput = document.querySelector("[data-create-location]");
  const createFolderToggle = document.querySelector("[data-create-folder]");
  const installPath = document.querySelector("[data-install-path]");
  const homeButtons = document.querySelectorAll("[data-action-home]");
  const agentNavButton = document.querySelector("[data-ai-nav=\"agent\"]");
  const createNavButton = document.querySelector("[data-ai-create]");
  const projectItemsEl = document.querySelector("[data-project-items]");
  const agentStatusEl = document.querySelector("[data-agent-status]");
  const buildStatusEl = document.querySelector("[data-build-status]");
  const buildCheckButton = document.querySelector("[data-build-check]");
  const buildOpenButton = document.querySelector("[data-build-open]");
  const buildPanelCheck = document.querySelector(
    "[data-build-panel=\"check\"]"
  );
  const buildPanelRun = document.querySelector("[data-build-panel=\"run\"]");
  const templateTitleEl = document.querySelector("[data-template-title]");
  const templateStatusEl = document.querySelector("[data-template-status]");
  const templateSearchInput = document.querySelector("[data-template-search]");
  const templateListEl = document.querySelector("[data-template-list]");
  const templateContinueButton = document.querySelector(
    "[data-template-continue]"
  );
  const templateNameInput = document.querySelector("[data-template-name]");
  const recentListEl = document.querySelector("[data-recent-list]");

  if (
    !statusEl ||
    !connectButton ||
    !flowEl ||
    !codeEl ||
    !resetButton ||
    !gitSection ||
    !githubSection ||
    !gitStatusEl ||
    !gitCheckButton ||
    !gitSkipButton ||
    !gitInstructions ||
    !gitOpenButton
  ) {
    return;
  }

  let pollTimer = null;
  let verificationUri = "https://github.com/login/device";
  let githubConnected = false;
  let currentProjectPath = "";
  let gitInstalled = false;
  let gitSkipped = false;
  let gitChecking = false;
  let templatesData = [];
  let selectedTemplate = "";
  let codexInstalled = false;
  let buildToolsInstalled = false;
  let buildToolsChecked = false;
  let aiView = "agent";
  let activeProjectItem = "";
  let projectItems = [];

  const sanitizeTemplateName = (value) => value.replace(/[^a-zA-Z0-9]/g, "");

  const updateTemplateContinue = () => {
    if (!templateContinueButton) {
      return;
    }
    const nameValue = templateNameInput?.value.trim() || "";
    templateContinueButton.disabled = !selectedTemplate || !nameValue;
  };

  const getInstallApi = () => {
    if (window.ifactoryInstall) {
      return window.ifactoryInstall;
    }
    const statusEl = document.querySelector("[data-iplug-status]");
    const progressEl = document.querySelector("[data-install-progress]");
    const stageEl = document.querySelector("[data-install-stage]");
    const eyebrowEl = document.querySelector("[data-install-eyebrow]");
    const titleEl = document.querySelector("[data-install-title-text]");

    const setStatus = (message, tone) => {
      if (!statusEl) {
        return;
      }
      if (!message) {
        statusEl.textContent = "";
        statusEl.hidden = true;
        statusEl.removeAttribute("data-tone");
        return;
      }
      statusEl.textContent = message;
      statusEl.hidden = false;
      if (tone) {
        statusEl.setAttribute("data-tone", tone);
      } else {
        statusEl.removeAttribute("data-tone");
      }
    };

    const updateProgress = (progress, stage) => {
      if (progressEl && typeof progress === "number") {
        const clamped = Math.max(0, Math.min(progress, 1));
        progressEl.style.width = `${Math.round(clamped * 100)}%`;
      }
      if (stageEl && stage) {
        stageEl.textContent = stage;
      }
    };

    return {
      start: () => {
        document.body.classList.add("is-installing-run");
        if (progressEl) {
          progressEl.style.width = "0%";
        }
      },
      stop: () => {
        document.body.classList.remove("is-installing-run");
      },
      setStatus,
      updateProgress,
      setHeader: (eyebrow, title) => {
        if (eyebrowEl && eyebrow) {
          eyebrowEl.textContent = eyebrow;
        }
        if (titleEl && title) {
          titleEl.textContent = title;
        }
      }
    };
  };

  const setAi = (active) => {
    document.body.classList.toggle("is-ai", active);
    if (active) {
      document.body.classList.remove("is-installing-run");
      document.body.classList.remove("is-installing");
      document.body.classList.remove("is-creating");
    }
  };

  const setAiNeedsAgent = (needsAgent) => {
    document.body.classList.toggle("ai-needs-agent", needsAgent);
  };

  const updateSidebarActive = () => {
    if (agentNavButton) {
      agentNavButton.classList.toggle("is-active", aiView === "agent");
    }
    if (createNavButton) {
      createNavButton.classList.toggle("is-active", aiView === "templates");
    }
    if (projectItemsEl) {
      const items = projectItemsEl.querySelectorAll("[data-project-item]");
      items.forEach((button) => {
        const match = button.dataset.projectItem === activeProjectItem;
        button.classList.toggle(
          "is-active",
          aiView === "get-started" && match
        );
      });
    }
  };

  const setAiView = (view) => {
    aiView = view;
    document.body.dataset.aiView = view;
    setAi(true);
    updateSidebarActive();
    if (view === "get-started") {
      if (buildToolsInstalled) {
        setBuildPanels();
      } else if (buildToolsChecked) {
        setBuildPanels();
        updateBuildStatus("Build tools not found.");
      } else {
        checkBuildTools();
      }
    }
  };

  const setActiveProjectItem = (name) => {
    activeProjectItem = name || "";
    updateSidebarActive();
  };

  const updateAiPanels = () => {
    setAiNeedsAgent(!codexInstalled);
  };

  const setGetStarted = (active) => {
    if (active) {
      setAiView("get-started");
    } else if (aiView === "get-started" && document.body.classList.contains("is-ai")) {
      setAiView("agent");
    }
  };

  const updateAgentStatus = (message) => {
    if (!agentStatusEl) {
      return;
    }
    agentStatusEl.textContent = message;
  };

  const checkCodex = async () => {
    if (!window.ifactory?.codex?.check) {
      codexInstalled = false;
      updateAiPanels();
      updateAgentStatus("No agents found.");
      return;
    }
    updateAgentStatus("Checking for agents.");
    try {
      const result = await window.ifactory.codex.check();
      codexInstalled = Boolean(result?.installed);
      updateAiPanels();
      if (!codexInstalled) {
        updateAgentStatus("No agents found.");
      }
    } catch (error) {
      codexInstalled = false;
      updateAiPanels();
      updateAgentStatus("No agents found.");
    }
  };

  const setBuildPanels = () => {
    if (!buildPanelCheck || !buildPanelRun) {
      return;
    }
    buildPanelCheck.hidden = false;
    buildPanelRun.hidden = true;
  };

  const goToRunScreen = () => {
    setAiView("run");
  };

  const updateBuildStatus = (message) => {
    if (!buildStatusEl) {
      return;
    }
    buildStatusEl.textContent = message;
  };

  const checkBuildTools = async () => {
    if (!window.ifactory?.build?.check) {
      buildToolsInstalled = false;
      buildToolsChecked = true;
      setBuildPanels();
      updateBuildStatus("Build tools not found.");
      return;
    }
    updateBuildStatus("Checking build tools.");
    if (buildCheckButton) {
      buildCheckButton.disabled = true;
    }
    try {
      const result = await window.ifactory.build.check();
      buildToolsInstalled = Boolean(result?.installed);
      buildToolsChecked = true;
      if (buildToolsInstalled) {
        goToRunScreen();
      } else {
        setBuildPanels();
        updateBuildStatus("Build tools not found.");
      }
    } catch (error) {
      buildToolsInstalled = false;
      buildToolsChecked = true;
      setBuildPanels();
      updateBuildStatus("Build tools not found.");
    } finally {
      if (buildCheckButton) {
        buildCheckButton.disabled = false;
      }
    }
  };

  const ensureBuildTools = async () => {
    if (buildToolsInstalled) {
      setBuildPanels();
      return;
    }
    await checkBuildTools();
  };

  const showProjectEditor = async (view = "agent") => {
    setAiView(view);
    updateAiPanels();
    if (view === "agent" && !codexInstalled) {
      await checkCodex();
    }
  };

  const renderRecents = (projects) => {
    if (!recentListEl) {
      return;
    }
    recentListEl.innerHTML = "";
    if (!Array.isArray(projects) || projects.length === 0) {
      const empty = document.createElement("div");
      empty.className = "recent-empty";
      empty.textContent = "No recent projects yet.";
      recentListEl.appendChild(empty);
      return;
    }

    projects.slice(0, 3).forEach((project) => {
      if (!project?.path) {
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recent-item";
      button.dataset.recentPath = project.path;

      const name = document.createElement("div");
      name.className = "recent-name";
      name.textContent = project.name || project.path;

      const pathEl = document.createElement("div");
      pathEl.className = "recent-path";
      pathEl.textContent = project.path;

      const status = document.createElement("span");
      status.className = "recent-status";
      status.textContent = "NOT FOUND";

      button.appendChild(name);
      button.appendChild(pathEl);
      button.appendChild(status);
      button.addEventListener("click", async () => {
        const result = await openProjectPath(project.path);
        if (result?.error === "path_not_found") {
          button.classList.add("is-missing");
          if (window.ifactory?.recents?.remove) {
            await window.ifactory.recents.remove(project.path);
          }
          window.setTimeout(() => {
            button.classList.add("is-removing");
            window.setTimeout(() => {
              button.remove();
              if (recentListEl.childElementCount === 0) {
                renderRecents([]);
              }
            }, 400);
          }, 3000);
        }
      });

      recentListEl.appendChild(button);
    });
  };

  const openPluginScreen = async (name) => {
    setActiveProjectItem(name);
    setAiView("get-started");
    await ensureBuildTools();
  };

  const buildProjectItemButton = (item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-nav-item ai-nav-item--entry";
    button.dataset.projectItem = item.name;
    button.dataset.itemType = item.type;
    button.title = item.name;

    const icon = document.createElement("img");
    icon.src =
      item.type === "tool" ? "../icons/tool.svg" : "../icons/plugin.svg";
    icon.alt = item.type === "tool" ? "Tool" : "Plugin";

    const label = document.createElement("span");
    label.className = "ai-nav-label";
    label.textContent = item.name;

    button.appendChild(icon);
    button.appendChild(label);

    button.addEventListener("click", async () => {
      await openPluginScreen(item.name);
    });

    return button;
  };

  const renderProjectItems = (items) => {
    if (!projectItemsEl) {
      return;
    }
    projectItemsEl.innerHTML = "";
    projectItems = Array.isArray(items) ? items : [];
    projectItems.forEach((item) => {
      projectItemsEl.appendChild(buildProjectItemButton(item));
    });
    updateSidebarActive();
  };

  const loadProjectItems = async (projectPath) => {
    if (!projectItemsEl) {
      return;
    }
    if (!projectPath || !window.ifactory?.project?.listItems) {
      renderProjectItems([]);
      return;
    }
    try {
      const result = await window.ifactory.project.listItems({
        path: projectPath
      });
      if (result?.error) {
        renderProjectItems([]);
        return;
      }
      renderProjectItems(result.items);
    } catch (error) {
      renderProjectItems([]);
    }
  };

  const setTemplateStatus = (message) => {
    if (!templateStatusEl) {
      return;
    }
    if (!message) {
      templateStatusEl.textContent = "";
      templateStatusEl.hidden = true;
      return;
    }
    templateStatusEl.textContent = message;
    templateStatusEl.hidden = false;
  };

  const showTemplateMessage = (message) => {
    if (!templateListEl) {
      return;
    }
    templateListEl.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "fork-empty";
    empty.textContent = message;
    templateListEl.appendChild(empty);
  };

  const renderTemplates = () => {
    if (!templateListEl) {
      return;
    }
    const query = (templateSearchInput?.value || "").trim().toLowerCase();
    const templates = Array.isArray(templatesData) ? templatesData : [];
    const filtered = query
      ? templates.filter((template) => {
          const parts = [
            template?.name || "",
            template?.folder || "",
            template?.description || ""
          ];
          return parts.join(" ").toLowerCase().includes(query);
        })
      : templates;

    const displayTemplates = selectedTemplate
      ? templates.filter((template) => template.folder === selectedTemplate)
      : filtered;

    templateListEl.innerHTML = "";
    if (!displayTemplates.length) {
      showTemplateMessage("No templates found.");
      return;
    }

    displayTemplates.forEach((template) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fork-item template-item";
      button.dataset.templateFolder = template.folder || "";
      if (template.folder && template.folder === selectedTemplate) {
        button.classList.add("is-selected");
      }

      const title = document.createElement("div");
      title.className = "fork-title";
      title.textContent = template.name || template.folder || "Template";

      button.appendChild(title);

      if (template.description) {
        const desc = document.createElement("div");
        desc.className = "fork-meta";
        desc.textContent = template.description;
        button.appendChild(desc);
      }

      if (template.folder && template.folder === selectedTemplate) {
        const clear = document.createElement("span");
        clear.className = "template-clear";
        clear.textContent = "x";
        clear.setAttribute("aria-label", "Clear selection");
        button.appendChild(clear);
      }

      button.addEventListener("click", (event) => {
        if (event.target?.classList?.contains("template-clear")) {
          selectedTemplate = "";
          if (templateNameInput) {
            templateNameInput.value = "";
          }
          renderTemplates();
          return;
        }
        selectedTemplate = template.folder || "";
        if (templateNameInput) {
          templateNameInput.value = sanitizeTemplateName(selectedTemplate);
        }
        renderTemplates();
      });

      templateListEl.appendChild(button);
    });
    updateTemplateContinue();
    document.body.classList.toggle(
      "is-template-selected",
      Boolean(selectedTemplate)
    );
  };

  const loadTemplates = async () => {
    if (!templateListEl || !templateTitleEl) {
      return;
    }
    if (templateSearchInput) {
      templateSearchInput.value = "";
    }
    selectedTemplate = "";
    if (templateNameInput) {
      templateNameInput.value = "";
    }
    document.body.classList.remove("is-template-selected");
    updateTemplateContinue();
    templateTitleEl.textContent = "Loading templates.";
    setTemplateStatus("Fetching available iPlug2 templates.");
    templateListEl.innerHTML = "";
    templatesData = [];

    if (!currentProjectPath) {
      setTemplateStatus("Select a project to load templates.");
      showTemplateMessage("No templates found.");
      return;
    }
    if (!window.ifactory?.templates?.list) {
      setTemplateStatus("Templates are unavailable right now.");
      showTemplateMessage("No templates found.");
      return;
    }
    try {
      const result = await window.ifactory.templates.list({
        projectPath: currentProjectPath
      });
      if (result?.error === "examples_missing") {
        setTemplateStatus("Unable to find iPlug2 Examples in this project.");
        showTemplateMessage("Examples folder not found.");
        return;
      }
      if (result?.error) {
        setTemplateStatus("Unable to load templates right now.");
        showTemplateMessage("No templates found.");
        return;
      }
      templatesData = Array.isArray(result?.templates) ? result.templates : [];
      templateTitleEl.textContent = "Choose a plugin template.";
      setTemplateStatus("");
      renderTemplates();
    } catch (error) {
      setTemplateStatus("Unable to load templates right now.");
      showTemplateMessage("No templates found.");
    }
  };

  const loadRecents = async () => {
    if (!window.ifactory?.recents?.get) {
      return;
    }
    try {
      const projects = await window.ifactory.recents.get();
      renderRecents(projects);
    } catch (error) {
      console.error("Failed to load recent projects", error);
    }
  };

  const setFlowVisible = (visible) => {
    flowEl.hidden = !visible;
  };

  const setSetupComplete = (complete) => {
    document.body.classList.toggle("is-setup-complete", complete);
    if (!complete) {
      document.body.classList.remove("is-creating");
      document.body.classList.remove("is-installing");
      document.body.classList.remove("is-ai");
      document.body.removeAttribute("data-ai-view");
    }
  };

  const isSkipped = () => window.localStorage.getItem(skipKey) === "1";

  const setSkipped = (value) => {
    if (value) {
      window.localStorage.setItem(skipKey, "1");
    } else {
      window.localStorage.removeItem(skipKey);
    }
  };

  const setCreating = (creating) => {
    document.body.classList.toggle("is-creating", creating);
    if (creating) {
      document.body.classList.remove("is-installing");
      document.body.classList.remove("is-ai");
      document.body.removeAttribute("data-ai-view");
    }
  };

  const setInstalling = (installing) => {
    document.body.classList.toggle("is-installing", installing);
    if (installing) {
      document.body.classList.remove("is-creating");
      document.body.classList.remove("is-ai");
    }
  };

  const setTemplates = (active) => {
    if (active) {
      setAiView("templates");
    } else if (aiView === "templates" && document.body.classList.contains("is-ai")) {
      setAiView("agent");
    }
  };

  const updateInstallPath = (pathValue) => {
    currentProjectPath = pathValue || "";
    if (installPath) {
      installPath.textContent = currentProjectPath || "Not set";
    }
    document.body.dataset.projectPath = currentProjectPath;
  };

  const updateSetupState = () => {
    if (gitSkipped) {
      setSetupComplete(true);
      return;
    }
    if (!gitInstalled) {
      setSetupComplete(false);
      return;
    }
    setSetupComplete(githubConnected || isSkipped());
  };

  const setGitChecking = (checking) => {
    gitChecking = checking;
    gitCheckButton.disabled = checking;
    if (gitStatusEl && checking) {
      gitStatusEl.textContent = "Checking Installation";
    }
  };

  const applyGitState = (git) => {
    gitInstalled = Boolean(git?.installed);
    gitSkipped = Boolean(git?.skipped);
    gitSection.hidden = gitInstalled || gitSkipped;
    githubSection.hidden = !gitInstalled;
    gitInstructions.hidden = gitInstalled || gitSkipped || gitChecking;
    if (!gitChecking) {
      if (gitInstalled) {
        gitStatusEl.textContent = "Installed";
      } else if (gitSkipped) {
        gitStatusEl.textContent = "Skipped";
      } else {
        gitStatusEl.textContent = "Not Installed";
      }
    }
    updateSetupState();
  };

  const checkGitInstallation = async () => {
    try {
      if (!window.ifactory?.git?.check) {
        return;
      }
      setGitChecking(true);
      gitInstructions.hidden = true;
      const result = await window.ifactory.git.check();
      setGitChecking(false);
      applyGitState(result);
    } catch (error) {
      setGitChecking(false);
      applyGitState({ installed: false, skipped: false });
    }
  };

  const openProjectPath = async (projectPath) => {
    try {
      if (!window.ifactory?.project) {
        return null;
      }
      const result = await window.ifactory.project.open({ path: projectPath });
      if (result?.error) {
        return result;
      }
      updateInstallPath(result.path);
      await loadProjectItems(result.path);
      setActiveProjectItem("");
      if (result.needsIPlug) {
        setInstalling(true);
      } else if (result.needsDependencies) {
        setInstalling(true);
        if (window.ifactoryInstall?.installDependencies) {
          await window.ifactoryInstall.installDependencies(result.path);
        }
      } else {
        await showProjectEditor("agent");
      }
      await loadRecents();
      return result;
    } catch (error) {
      console.error("Failed to open project", error);
      return { error: "open_failed" };
    }
  };

  const goToSetup = () => {
    setSkipped(false);
    setSetupComplete(false);
    setCreating(false);
    setInstalling(false);
    setTemplates(false);
    setGetStarted(false);
    setAi(false);
    setAiNeedsAgent(false);
    document.body.removeAttribute("data-ai-view");
    activeProjectItem = "";
    setFlowVisible(false);
    updateSetupState();
  };

  const applyGithubState = (settings) => {
    const github = settings?.integrations?.github;
    if (!github) {
      return;
    }

    githubConnected = Boolean(github.connected || github.tokenStored);
    statusEl.textContent = "Not connected";
    setFlowVisible(false);
    if (githubConnected) {
      setSkipped(false);
    }
    updateSetupState();
    setCreating(false);
    setInstalling(false);
    if (createRepoToggle) {
      createRepoToggle.checked = githubConnected;
    }
    if (privateRepoToggle) {
      privateRepoToggle.disabled = !createRepoToggle?.checked;
    }
  };

  const loadGithub = async () => {
    try {
      const settings = await window.ifactory.settings.get();
      const gitState = settings?.dependencies?.git;
      const codexState = settings?.dependencies?.codex;
      const buildState = settings?.dependencies?.buildTools;
      const needsCheck = !gitState?.installed && !gitState?.skipped;
      if (needsCheck) {
        setGitChecking(true);
        gitSection.hidden = false;
        githubSection.hidden = true;
        gitInstructions.hidden = true;
        gitStatusEl.textContent = "Checking Installation";
      } else {
        applyGitState(gitState);
      }
      applyGithubState(settings);
      codexInstalled = Boolean(codexState?.installed);
      buildToolsInstalled = Boolean(buildState?.installed);
      buildToolsChecked = Boolean(buildState?.checkedAt);
      if (buildToolsInstalled) {
        goToRunScreen();
      } else {
        setBuildPanels();
      }
      updateAiPanels();
      if (needsCheck) {
        await checkGitInstallation();
      }
    } catch (error) {
      console.error("Failed to load GitHub settings", error);
      statusEl.textContent = "GitHub unavailable";
    }
  };

  const startPolling = (deviceCode, intervalSeconds) => {
    const intervalMs = Math.max(5, Number(intervalSeconds) || 5) * 1000;
    if (pollTimer) {
      window.clearInterval(pollTimer);
    }

    pollTimer = window.setInterval(async () => {
      try {
        const result = await window.ifactory.github.pollDeviceFlow(deviceCode);
        if (result?.error) {
          if (result.error === "authorization_pending") {
            return;
          }
          if (result.error === "slow_down") {
            window.clearInterval(pollTimer);
            startPolling(deviceCode, intervalSeconds + 5);
            return;
          }
          if (result.error === "expired_token") {
            statusEl.textContent = "Authorization expired";
            setFlowVisible(false);
            window.clearInterval(pollTimer);
            pollTimer = null;
            return;
          }
          statusEl.textContent = "Auth failed";
          setFlowVisible(false);
          window.clearInterval(pollTimer);
          pollTimer = null;
          return;
        }

        applyGithubState(result);
        window.clearInterval(pollTimer);
        pollTimer = null;
      } catch (error) {
        console.error("Failed to poll GitHub device flow", error);
      }
    }, intervalMs);
  };

  const startFlow = async () => {
    try {
      const data = await window.ifactory.github.startDeviceFlow([
        "repo",
        "read:user"
      ]);
      codeEl.textContent = data.user_code || "----";
      verificationUri =
        data.verification_uri_complete || data.verification_uri || verificationUri;
      statusEl.textContent = "Awaiting authorization";
      setFlowVisible(true);
      startPolling(data.device_code, data.interval);
    } catch (error) {
      console.error("Failed to start GitHub device flow", error);
      statusEl.textContent = "GitHub auth failed";
    }
  };

  const copyCode = async () => {
    try {
      if (!navigator.clipboard) {
        return;
      }
      await navigator.clipboard.writeText(codeEl.textContent);
    } catch (error) {
      console.error("Failed to copy GitHub code", error);
    }
  };

  const openGitHub = async () => {
    try {
      if (!window.ifactory.openExternal) {
        return;
      }
      await window.ifactory.openExternal(verificationUri);
    } catch (error) {
      console.error("Failed to open GitHub device login", error);
    }
  };

  const disconnect = async () => {
    try {
      if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      const settings = await window.ifactory.github.disconnect();
      setSkipped(false);
      applyGithubState(settings);
    } catch (error) {
      console.error("Failed to disconnect GitHub", error);
    }
  };

  const openGitInstaller = async () => {
    try {
      if (!window.ifactory?.openExternal) {
        return;
      }
      await window.ifactory.openExternal("https://git-scm.com/download/win");
    } catch (error) {
      console.error("Failed to open Git installer", error);
    }
  };

  const skipGit = async () => {
    try {
      if (!window.ifactory?.git?.skip) {
        return;
      }
      const result = await window.ifactory.git.skip();
      applyGitState(result);
    } catch (error) {
      console.error("Failed to skip Git install", error);
    }
  };

  connectButton.addEventListener("click", startFlow);
  resetButton.addEventListener("click", disconnect);
  gitCheckButton.addEventListener("click", checkGitInstallation);
  gitSkipButton.addEventListener("click", skipGit);
  gitOpenButton.addEventListener("click", openGitInstaller);
  if (copyButton) {
    copyButton.addEventListener("click", copyCode);
  }
  if (openButton) {
    openButton.addEventListener("click", openGitHub);
  }
  if (skipButton) {
    skipButton.addEventListener("click", () => {
      setSkipped(true);
      setSetupComplete(true);
      setCreating(false);
      setTemplates(false);
      setGetStarted(false);
      setAi(false);
      setAiNeedsAgent(false);
      document.body.removeAttribute("data-ai-view");
    });
  }
  if (createButton) {
    createButton.addEventListener("click", () => {
      setCreating(true);
    });
  }
  if (createNavButton) {
    createNavButton.addEventListener("click", () => {
      setActiveProjectItem("");
      setTemplates(true);
      loadTemplates();
    });
  }
  if (agentNavButton) {
    agentNavButton.addEventListener("click", async () => {
      await showProjectEditor("agent");
    });
  }
  if (buildCheckButton) {
    buildCheckButton.addEventListener("click", () => {
      checkBuildTools();
    });
  }
  if (buildOpenButton) {
    buildOpenButton.addEventListener("click", () => {
      if (!window.ifactory?.openExternal) {
        return;
      }
      window.ifactory.openExternal(
        "https://visualstudio.microsoft.com/visual-cpp-build-tools/"
      );
    });
  }
  if (openProjectButton) {
    openProjectButton.addEventListener("click", async () => {
      try {
        if (!window.ifactory?.dialog || !window.ifactory?.project) {
          return;
        }
        const folder = await window.ifactory.dialog.selectFolder();
        if (!folder) {
          return;
        }
        await openProjectPath(folder);
      } catch (error) {
        console.error("Failed to open project", error);
      }
    });
  }
  if (cloneButton) {
    cloneButton.addEventListener("click", () => {
      if (!githubConnected) {
        goToSetup();
      }
    });
  }
  if (createSubmitButton) {
    createSubmitButton.addEventListener("click", async () => {
      if (!window.ifactory?.project) {
        return;
      }
      const name = createNameInput?.value.trim() || "";
      const basePath = createLocationInput?.value.trim() || "";
      const createFolder = createFolderToggle?.checked !== false;
      const createRepo = createRepoToggle?.checked === true;
      const privateRepo = privateRepoToggle?.checked !== false;

      if (createRepo && !githubConnected) {
        goToSetup();
        return;
      }

      try {
        const result = await window.ifactory.project.create({
          name,
          basePath,
          createFolder,
          createRepo,
          privateRepo
        });
        if (result?.error) {
          console.error("Failed to create project", result.error);
          return;
        }
        updateInstallPath(result.path);
        setInstalling(true);
        await loadRecents();
      } catch (error) {
        console.error("Failed to create project", error);
      }
    });
  }
  if (createRepoToggle) {
    createRepoToggle.addEventListener("change", () => {
      if (createRepoToggle.checked && !githubConnected) {
        createRepoToggle.checked = false;
        goToSetup();
      }
      if (privateRepoToggle) {
        privateRepoToggle.disabled = !createRepoToggle.checked;
      }
    });
  }
  backButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCreating(false);
    });
  });
  homeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCreating(false);
      setInstalling(false);
      setAi(false);
      setAiNeedsAgent(false);
      document.body.removeAttribute("data-ai-view");
      activeProjectItem = "";
      updateSetupState();
    });
  });
  if (templateSearchInput) {
    templateSearchInput.addEventListener("input", renderTemplates);
  }
  if (templateNameInput) {
    templateNameInput.addEventListener("input", () => {
      const sanitized = sanitizeTemplateName(templateNameInput.value);
      if (sanitized !== templateNameInput.value) {
        templateNameInput.value = sanitized;
      }
      updateTemplateContinue();
    });
    templateNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && templateContinueButton) {
        event.preventDefault();
        if (!templateContinueButton.disabled) {
          templateContinueButton.click();
        }
      }
    });
  }
  if (templateContinueButton) {
    templateContinueButton.addEventListener("click", async () => {
      const projectPath =
        currentProjectPath || document.body.dataset.projectPath || "";
      if (!selectedTemplate || !projectPath) {
        return;
      }
      const pluginName = templateNameInput?.value.trim() || "";
      const installApi = getInstallApi();
      if (!pluginName || !window.ifactory?.templates?.copy) {
        return;
      }
      setGetStarted(false);
      setTemplates(false);
      setInstalling(true);
      installApi.setHeader?.("Creating plugin", "Creating plugin");
      installApi.start?.();
      installApi.setStatus?.("");
      installApi.updateProgress?.(0.05, "Copying template...");
      try {
        const result = await window.ifactory.templates.copy({
          projectPath,
          templateFolder: selectedTemplate,
          name: pluginName
        });
        if (result?.error) {
          const message =
            result.error === "already_exists"
              ? "A plugin with that name already exists."
              : result.error === "template_missing"
                ? "Template not found."
                : "Unable to create the plugin.";
          installApi.setStatus?.(message, "error");
          return;
      }
      installApi.updateProgress?.(1, "Finished");
      await loadProjectItems(projectPath);
      await openPluginScreen(pluginName);
      } catch (error) {
        installApi.setStatus?.("Unable to create the plugin.", "error");
      } finally {
        installApi.stop?.();
        setInstalling(false);
      }
    });
  }

  window.ifactoryUI = {
    showProjectEditor,
    refreshProjectItems: () => loadProjectItems(currentProjectPath),
    setActiveProjectItem
  };

  loadGithub();
  loadRecents();
};

const setupWindowControls = () => {
  if (!window.ifactory?.windowControls) {
    return;
  }

  const minimizeButtons = document.querySelectorAll("[data-window-minimize]");
  const maximizeButtons = document.querySelectorAll("[data-window-maximize]");
  const closeButtons = document.querySelectorAll("[data-window-close]");

  const refreshMaxState = async () => {
    try {
      const isMaximized = await window.ifactory.windowControls.isMaximized();
      document.body.classList.toggle("is-maximized", Boolean(isMaximized));
    } catch (error) {
      console.error("Failed to read window state", error);
    }
  };

  minimizeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      window.ifactory.windowControls.minimize();
    });
  });

  maximizeButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      await window.ifactory.windowControls.toggleMaximize();
      refreshMaxState();
    });
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      window.ifactory.windowControls.close();
    });
  });

  refreshMaxState();
};

const setupCreateForm = () => {
  const browseButton = document.querySelector("[data-create-browse]");
  const locationInput = document.querySelector("[data-create-location]");
  const nameInput = document.querySelector("[data-create-name]");
  const suffixEl = document.querySelector("[data-path-suffix]");
  const createFolderToggle = document.querySelector("[data-create-folder]");

  if (!browseButton || !locationInput || !suffixEl || !nameInput) {
    return;
  }

  const measureEl = document.createElement("span");
  measureEl.className = "path-measure";
  measureEl.style.position = "absolute";
  measureEl.style.visibility = "hidden";
  measureEl.style.whiteSpace = "pre";
  measureEl.style.pointerEvents = "none";
  suffixEl.parentElement?.appendChild(measureEl);

  const getProjectName = () => {
    const value = nameInput.value.trim();
    return value || nameInput.getAttribute("placeholder") || "Project";
  };

  const updateSuffixPosition = () => {
    const style = window.getComputedStyle(locationInput);
    measureEl.style.font = style.font;
    measureEl.style.letterSpacing = style.letterSpacing;
    suffixEl.style.font = style.font;
    suffixEl.style.letterSpacing = style.letterSpacing;
    measureEl.textContent = locationInput.value || "";
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const left = paddingLeft + measureEl.getBoundingClientRect().width;
    suffixEl.style.left = `${left}px`;
  };

  const updateSuffix = () => {
    const createFolder =
      createFolderToggle && createFolderToggle.checked !== false;
    const basePath = locationInput.value.trim();
    if (!createFolder || basePath.length === 0) {
      suffixEl.textContent = "";
      suffixEl.hidden = true;
      return;
    }
    const separator = basePath.endsWith("\\") ? "" : "\\";
    suffixEl.textContent = `${separator}${getProjectName()}`;
    suffixEl.hidden = false;
    updateSuffixPosition();
  };

  const handleLocationInput = () => {
    updateSuffix();
  };

  const handleNameInput = () => {
    updateSuffix();
  };

  if (createFolderToggle) {
    createFolderToggle.addEventListener("change", updateSuffix);
  }

  locationInput.addEventListener("input", handleLocationInput);
  nameInput.addEventListener("input", handleNameInput);

  browseButton.addEventListener("click", async () => {
    try {
      if (!window.ifactory?.dialog) {
        return;
      }
      const folder = await window.ifactory.dialog.selectFolder();
      if (folder) {
        locationInput.value = folder;
        updateSuffix();
      }
    } catch (error) {
      console.error("Failed to select folder", error);
    }
  });

  window.addEventListener("resize", updateSuffixPosition);
  updateSuffix();
};

const setupInstallScreen = () => {
  if (!window.ifactory?.github || !window.ifactory?.iplug) {
    return;
  }

  const sourceButtons = document.querySelectorAll("[data-iplug-source]");
  const branchButtons = document.querySelectorAll("[data-iplug-branch-mode]");
  const officialSection = document.querySelector("[data-iplug-official]");
  const forkSection = document.querySelector("[data-iplug-forks]");
  const listEl = document.querySelector("[data-iplug-list]");
  const searchInput = document.querySelector("[data-iplug-search]");
  const noteEl = document.querySelector("[data-iplug-note]");
  const branchListEl = document.querySelector("[data-iplug-branch-list]");
  const branchSection = document.querySelector("[data-iplug-branch-section]");
  const branchSearchWrap = document.querySelector("[data-iplug-branch-search]");
  const branchSearchInput = document.querySelector(
    "[data-iplug-branch-query]"
  );
  const installButton = document.querySelector("[data-iplug-install]");
  const installStatus = document.querySelector("[data-iplug-status]");
  const installProgress = document.querySelector("[data-install-progress]");
  const installStage = document.querySelector("[data-install-stage]");
  const installCancel = document.querySelector("[data-install-cancel]");
  const installEyebrowEl = document.querySelector("[data-install-eyebrow]");
  const installTitleTextEl = document.querySelector("[data-install-title-text]");

  if (
    !officialSection ||
    !forkSection ||
    !listEl ||
    !searchInput ||
    !branchListEl ||
    !branchSection ||
    !branchSearchWrap ||
    !branchSearchInput ||
    !installButton ||
    !installStatus ||
    !installProgress ||
    !installStage ||
    !installCancel
  ) {
    return;
  }

  let forksData = null;
  let selectedFork = "";
  let selectedSource = "official";
  let branchMode = "master";
  let selectedBranch = "master";
  let currentBranches = [];
  const branchesCache = new Map();
  const defaultInstallEyebrow = installEyebrowEl?.textContent || "Installing";
  const defaultInstallTitle =
    installTitleTextEl?.textContent || "Setting up iPlug2";

  const resetInstallHeader = () => {
    if (installEyebrowEl) {
      installEyebrowEl.textContent = defaultInstallEyebrow;
    }
    if (installTitleTextEl) {
      installTitleTextEl.textContent = defaultInstallTitle;
    }
  };

  const setInstallStatus = (message, tone) => {
    if (!message) {
      installStatus.textContent = "";
      installStatus.hidden = true;
      installStatus.removeAttribute("data-tone");
      return;
    }
    installStatus.textContent = message;
    installStatus.hidden = false;
    if (tone) {
      installStatus.setAttribute("data-tone", tone);
    } else {
      installStatus.removeAttribute("data-tone");
    }
  };

  const setInstallingScreen = (active) => {
    document.body.classList.toggle("is-installing-run", active);
    if (active) {
      installProgress.style.width = "0%";
      installStage.textContent = "Preparing iPlug2...";
      installCancel.disabled = false;
    }
  };
  const openProjectEditor = async () => {
    if (window.ifactoryUI?.showProjectEditor) {
      await window.ifactoryUI.showProjectEditor("agent");
      if (window.ifactoryUI.refreshProjectItems) {
        await window.ifactoryUI.refreshProjectItems();
      }
    } else {
      document.body.classList.add("is-ai");
      document.body.dataset.aiView = "agent";
    }
    document.body.classList.remove("is-installing-run");
    document.body.classList.remove("is-installing");
  };

  const runDependenciesInstall = async (projectPath) => {
    if (!window.ifactory?.iplug?.installDependencies) {
      return;
    }
    document.body.classList.remove("is-installing");
    resetInstallHeader();
    setInstallStatus("Installing dependencies...", "");
    installButton.disabled = true;
    setInstallingScreen(true);
    try {
      const result = await window.ifactory.iplug.installDependencies({
        projectPath
      });
      if (result?.error) {
        const message = result.error === "cancelled"
          ? "Installation cancelled."
          : result.details
            ? `Installation failed: ${result.details}`
            : "Installation failed. Check your settings and try again.";
        setInstallStatus(message, result.error === "cancelled" ? "" : "error");
        return;
      }
      setInstallStatus("Dependencies installed.", "success");
      await openProjectEditor();
    } catch (error) {
      setInstallStatus("Installation failed. Check your settings and try again.", "error");
    } finally {
      setInstallingScreen(false);
      installButton.disabled = false;
    }
  };

  const updateProgress = (progress, stage) => {
    if (typeof progress === "number" && Number.isFinite(progress)) {
      const clamped = Math.max(0, Math.min(progress, 1));
      installProgress.style.width = `${Math.round(clamped * 100)}%`;
    }
    if (stage) {
      installStage.textContent = stage;
    }
  };

  const updateBranchVisibility = () => {
    const hasRepo =
      selectedSource === "official" ||
      (selectedSource === "fork" && Boolean(selectedFork));
    branchSection.hidden = !hasRepo;
    if (!hasRepo) {
      branchSearchWrap.hidden = true;
      branchListEl.hidden = true;
    }
    return hasRepo;
  };

  const setActiveSource = (source) => {
    selectedSource = source;
    sourceButtons.forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.iplugSource === source
      );
    });
    officialSection.hidden = source !== "official";
    forkSection.hidden = source !== "fork";
    if (source === "fork") {
      forksData = null;
      loadForks();
    }
    if (branchMode === "branch" && updateBranchVisibility()) {
      loadBranches();
    } else {
      updateBranchVisibility();
    }
  };

  const setActiveBranchMode = (mode) => {
    branchMode = mode;
    branchButtons.forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.iplugBranchMode === mode
      );
    });
    branchSearchWrap.hidden = mode !== "branch";
    branchListEl.hidden = mode !== "branch";
    if (mode === "master") {
      selectedBranch = "master";
      return;
    }
    if (updateBranchVisibility()) {
      loadBranches();
    }
  };

  const getSelectedRepoFullName = () => {
    if (selectedSource === "official") {
      return "iplug2/iplug2";
    }
    if (selectedSource === "fork") {
      return selectedFork;
    }
    return "";
  };

  const buildBadge = (label, className) => {
    const badge = document.createElement("span");
    badge.className = `fork-badge${className ? ` ${className}` : ""}`;
    badge.textContent = label;
    return badge;
  };

  const buildForkItem = (repo, isUser) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fork-item";
    button.dataset.fullName = repo.full_name || "";
    if (repo.full_name === selectedFork) {
      button.classList.add("is-selected");
    }

    const title = document.createElement("div");
    title.className = "fork-title";
    title.textContent = repo.full_name || repo.name || "Unknown fork";

    const meta = document.createElement("div");
    meta.className = "fork-meta";
    meta.textContent = repo.description || "No description available.";

    const badges = document.createElement("div");
    badges.className = "fork-badges";
    if (isUser) {
      badges.appendChild(buildBadge("Yours"));
    }
    if (repo.private) {
      badges.appendChild(buildBadge("Private", "is-private"));
    }

    button.appendChild(title);
    button.appendChild(meta);
    if (badges.children.length > 0) {
      button.appendChild(badges);
    }

    button.addEventListener("click", () => {
      selectedFork = repo.full_name || "";
      listEl.querySelectorAll(".fork-item").forEach((item) => {
        item.classList.remove("is-selected");
      });
      button.classList.add("is-selected");
      if (branchMode === "branch" && updateBranchVisibility()) {
        loadBranches();
      } else {
        updateBranchVisibility();
      }
    });

    return button;
  };

  const clearBranchList = (message) => {
    branchListEl.innerHTML = "";
    if (!message) {
      return;
    }
    const empty = document.createElement("div");
    empty.className = "fork-empty";
    empty.textContent = message;
    branchListEl.appendChild(empty);
  };

  const buildBranchItem = (branch) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fork-item branch-item";
    if (branch?.name === selectedBranch) {
      button.classList.add("is-selected");
    }

    const title = document.createElement("div");
    title.className = "fork-title";
    title.textContent = branch?.name || "Unknown branch";

    const meta = document.createElement("div");
    meta.className = "fork-meta";
    const sha = branch?.commit?.sha ? branch.commit.sha.slice(0, 7) : "";
    meta.textContent = sha ? `Commit ${sha}` : "Branch";

    button.appendChild(title);
    button.appendChild(meta);

    button.addEventListener("click", () => {
      selectedBranch = branch?.name || "";
      branchListEl.querySelectorAll(".branch-item").forEach((item) => {
        item.classList.remove("is-selected");
      });
      button.classList.add("is-selected");
    });

    return button;
  };

  const renderBranches = (branches) => {
    currentBranches = Array.isArray(branches) ? branches : [];
    const query = branchSearchInput.value.trim().toLowerCase();
    const filtered = currentBranches.filter((branch) =>
      (branch?.name || "").toLowerCase().includes(query)
    );
    const list = query ? filtered : currentBranches;

    if (query && list.length === 0) {
      clearBranchList("No branches match your search.");
      return;
    }

    if (list.length === 0) {
      clearBranchList("No branches found.");
      return;
    }

    if (!list.some((branch) => branch?.name === selectedBranch)) {
      selectedBranch = list[0]?.name || "";
    }

    branchListEl.innerHTML = "";
    list.forEach((branch) => {
      branchListEl.appendChild(buildBranchItem(branch));
    });
  };

  const loadBranches = async () => {
    if (branchMode !== "branch" || !updateBranchVisibility()) {
      return;
    }
    const fullName = getSelectedRepoFullName();
    if (!fullName) {
      clearBranchList("Select a fork to see branches.");
      return;
    }
    if (branchesCache.has(fullName)) {
      renderBranches(branchesCache.get(fullName));
      return;
    }

    clearBranchList("Loading branches...");
    try {
      const result = await window.ifactory.github.listRepoBranches(fullName);
      if (result?.error) {
        clearBranchList("Unable to load branches.");
        return;
      }
      const branches = Array.isArray(result.branches) ? result.branches : [];
      branchesCache.set(fullName, branches);
      renderBranches(branches);
    } catch (error) {
      clearBranchList("Unable to load branches.");
    }
  };

  const renderForks = () => {
    if (!forksData) {
      return;
    }

    const query = searchInput.value.trim().toLowerCase();
    const filter = (repo) => {
      const text = `${repo.full_name || ""} ${repo.description || ""}`.toLowerCase();
      return text.includes(query);
    };

    const userForks = forksData.userForks.filter(filter);
    const forks = forksData.forks.filter(filter);

    listEl.innerHTML = "";

    if (userForks.length === 0 && forks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fork-empty";
      empty.textContent = "No forks match your search.";
      listEl.appendChild(empty);
      return;
    }

    if (userForks.length > 0) {
      const label = document.createElement("div");
      label.className = "fork-group-label";
      label.textContent = "Your forks";
      listEl.appendChild(label);
      userForks.forEach((repo) => {
        listEl.appendChild(buildForkItem(repo, true));
      });
    }

    if (forks.length > 0) {
      const label = document.createElement("div");
      label.className = "fork-group-label";
      label.textContent = "Community forks";
      listEl.appendChild(label);
      forks.forEach((repo) => {
        listEl.appendChild(buildForkItem(repo, false));
      });
    }
  };

  const loadForks = async () => {
    if (forksData) {
      renderForks();
      return;
    }

    listEl.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "fork-empty";
    loading.textContent = "Loading forks...";
    listEl.appendChild(loading);

    try {
      const result = await window.ifactory.github.listIPlugForks();
      if (result?.error) {
        listEl.textContent = "Unable to load forks right now.";
        return;
      }
      let forks = Array.isArray(result.forks) ? result.forks : [];
      let userForks = Array.isArray(result.userForks) ? result.userForks : [];
      const username = (result.username || "").toLowerCase();
      if (username && userForks.length === 0 && forks.length > 0) {
        const isUserFork = (repo) =>
          repo?.owner?.login?.toLowerCase() === username;
        userForks = forks.filter(isUserFork);
        forks = forks.filter((repo) => !isUserFork(repo));
      }
      forksData = {
        forks,
        userForks
      };
      if (noteEl) {
        noteEl.hidden = Boolean(result.connected);
      }
      renderForks();
    } catch (error) {
      listEl.textContent = "Unable to load forks right now.";
    }
  };

  sourceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const source = button.dataset.iplugSource;
      if (source) {
        setActiveSource(source);
      }
    });
  });

  branchButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.iplugBranchMode;
      if (mode) {
        setActiveBranchMode(mode);
      }
    });
  });

  searchInput.addEventListener("input", renderForks);
  branchSearchInput.addEventListener("input", () => {
    renderBranches(currentBranches);
  });

  const handleInstall = async () => {
    if (!window.ifactory?.iplug?.install) {
      return;
    }
    const projectPath = document.body.dataset.projectPath || "";
    const repoFullName = getSelectedRepoFullName();
    const branch = branchMode === "master" ? "master" : selectedBranch;

    if (!projectPath) {
      setInstallStatus("Select a project folder first.", "warning");
      return;
    }
    if (!repoFullName) {
      setInstallStatus("Select a fork to continue.", "warning");
      return;
    }

    resetInstallHeader();
    setInstallStatus("Installing iPlug2...", "");
    installButton.disabled = true;
    setInstallingScreen(true);
    try {
      const result = await window.ifactory.iplug.install({
        projectPath,
        repoFullName,
        branch
      });
      if (result?.error) {
        const message =
          result.error === "github_required"
            ? "Private repository detected. Connect GitHub to continue."
            : result.error === "git_required"
              ? "Git is required to add iPlug2 as a submodule."
            : result.error === "cancelled"
              ? "Installation cancelled."
            : result.error === "already_exists"
              ? "iPlug2 already exists in this project."
              : result.details
                ? `Installation failed: ${result.details}`
                : "Installation failed. Check your settings and try again.";
        setInstallStatus(message, result.error === "cancelled" ? "" : "error");
        return;
      }
      setInstallStatus("iPlug2 installed.", "success");
      await openProjectEditor();
    } catch (error) {
      setInstallStatus("Installation failed. Check your settings and try again.", "error");
    } finally {
      setInstallingScreen(false);
      installButton.disabled = false;
    }
  };

  installCancel.addEventListener("click", async () => {
    if (!window.ifactory?.iplug?.cancel) {
      return;
    }
    installCancel.disabled = true;
    installStage.textContent = "Cancelling installation...";
    try {
      await window.ifactory.iplug.cancel();
    } catch (error) {
      console.error("Failed to cancel install", error);
    }
  });

  if (window.ifactory?.iplug?.onProgress) {
    window.ifactory.iplug.onProgress((payload) => {
      updateProgress(payload?.progress, payload?.stage);
    });
  }

  installButton.addEventListener("click", handleInstall);

  window.ifactoryInstall = {
    installDependencies: runDependenciesInstall,
    start: () => setInstallingScreen(true),
    stop: () => setInstallingScreen(false),
    setStatus: setInstallStatus,
    updateProgress,
    setHeader: (eyebrow, title) => {
      if (eyebrow && installEyebrowEl) {
        installEyebrowEl.textContent = eyebrow;
      }
      if (title && installTitleTextEl) {
        installTitleTextEl.textContent = title;
      }
    },
    resetHeader: resetInstallHeader
  };

  setActiveSource("official");
  setActiveBranchMode("master");
  updateBranchVisibility();
};

document.addEventListener("DOMContentLoaded", () => {
  scheduleReveals();
  hydrateAppMeta();
  setupGithubOAuth();
  setupWindowControls();
  setupCreateForm();
  setupInstallScreen();
  const ellipsis = document.querySelector("[data-ellipsis]");
  if (ellipsis) {
    const frames = [".", "..", "..."];
    let index = 0;
    window.setInterval(() => {
      ellipsis.textContent = frames[index];
      index = (index + 1) % frames.length;
    }, 400);
  }
});
