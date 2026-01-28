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
  const createErrorEl = document.querySelector("[data-create-error]");
  const homeButtons = document.querySelectorAll("[data-action-home]");
  const agentNavButton = document.querySelector("[data-ai-nav=\"agent\"]");
  const gitNavButton = document.querySelector("[data-ai-nav=\"git\"]");
  const doxygenNavButton = document.querySelector("[data-ai-nav=\"doxygen\"]");
  const createNavButton = document.querySelector("[data-ai-create]");
  const projectItemsEl = document.querySelector("[data-project-items]");
  const openSolutionButtons = document.querySelectorAll("[data-open-solution]");
  const runView = document.querySelector('.ai-view[data-ai-view="run"]');
  const dropOverlay = document.querySelector("[data-drop-overlay]");
  const resourceDialog = document.querySelector("[data-resource-dialog]");
  const resourceNameInput = document.querySelector("[data-resource-name]");
  const resourceAddButton = document.querySelector("[data-resource-add]");
  const resourceCancelButton = document.querySelector("[data-resource-cancel]");
  const resourceFileLabel = document.querySelector("[data-resource-file]");
  const resourceErrorEl = document.querySelector("[data-resource-error]");
  const resourceRemoveToggle = document.querySelector("[data-resource-remove]");
  const agentStatusEl = document.querySelector("[data-agent-status]");
  const promptPanel = document.querySelector("[data-ai-panel=\"prompt\"]");
  const promptDock = document.querySelector("[data-prompt-dock]");
  const promptBar = promptDock?.querySelector(".prompt-bar");
  const promptInput = document.querySelector("[data-ai-prompt]");
  const promptSendButton = document.querySelector(".prompt-send");
  const chatListEl = document.querySelector("[data-ai-chat-list]");
  if (window.ifactory?.agent?.onPing) {
    window.ifactory.agent.onPing(() => {
      if (window.ifactory?.agent?.ping) {
        window.ifactory.agent.ping();
      }
    });
  }
  const gitRepoNameEl = document.querySelector("[data-git-repo-name]");
  const gitRepoPathEl = document.querySelector("[data-git-repo-path]");
  const gitBodyEl = document.querySelector("[data-git-body]");
  const gitEmptyEl = document.querySelector("[data-git-empty]");
  const gitChangesListEl = document.querySelector("[data-git-changes]");
  const gitChangesEmptyEl = document.querySelector("[data-git-changes-empty]");
  const gitChangesCountEl = document.querySelector("[data-git-count]");
  const gitFilterInput = document.querySelector("[data-git-filter]");
  const gitSummaryInput = document.querySelector("[data-git-summary]");
  const gitDescriptionInput = document.querySelector("[data-git-description]");
  const gitCommitButton = document.querySelector(".git-commit-button");
  const openDesktopButton = document.querySelector(
    "[data-open-github-desktop]"
  );
  const doxygenStatusEl = document.querySelector("[data-doxygen-status]");
  const doxygenInstallButton = document.querySelector("[data-doxygen-install]");
  const doxygenReadyEl = document.querySelector("[data-doxygen-ready]");
  const doxygenInstructions = document.querySelector("[data-doxygen-instructions]");
  const buildStatusEl = document.querySelector("[data-build-status]");
  const buildCheckButton = document.querySelector("[data-build-check]");
  const buildOpenButton = document.querySelector("[data-build-open]");
  const buildPanelCheck = document.querySelector(
    "[data-build-panel=\"check\"]"
  );
  const buildRunButton = document.querySelector("[data-build-run]");
  const buildRunIcon = document.querySelector("[data-run-icon]");
  const buildRunLabel = document.querySelector("[data-run-label]");
  const buildConsole = document.querySelector("[data-build-console]");
  const buildOutputEl = document.querySelector("[data-build-output]");
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
  let buildRunning = false;
  let aiView = "agent";
  let activeProjectItem = "";
  let projectItems = [];
  let gitChanges = [];
  let refreshPromptInput = null;
  let chatMessages = [];
  let chatProjectPath = "";
  let codexBusy = false;
  let gitSelected = new Set();
  let initialChatScrollDone = false;

  const sanitizeTemplateName = (value) => value.replace(/[^a-zA-Z0-9]/g, "");
  const scrollChatToBottom = (defer = true) => {
    if (!chatListEl) {
      return;
    }
    const doScroll = () => {
      chatListEl.scrollTop = chatListEl.scrollHeight;
    };
    if (defer) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(doScroll);
      });
    } else {
      doScroll();
    }
  };
  const scheduleChatScroll = () => {
    scrollChatToBottom(true);
    window.setTimeout(() => {
      scrollChatToBottom(false);
    }, 120);
  };
  const scheduleInitialChatScroll = () => {
    if (!chatListEl || initialChatScrollDone) {
      return;
    }
    initialChatScrollDone = true;
    const observer = new ResizeObserver(() => {
      scrollChatToBottom(false);
    });
    observer.observe(chatListEl);
    scheduleChatScroll();
    window.setTimeout(() => {
      scrollChatToBottom(false);
    }, 300);
    window.setTimeout(() => {
      scrollChatToBottom(false);
      observer.disconnect();
    }, 900);
  };

  const updateTemplateContinue = () => {
    if (!templateContinueButton) {
      return;
    }
    const nameValue = templateNameInput?.value.trim() || "";
    templateContinueButton.disabled = !selectedTemplate || !nameValue;
  };

  const updateCreateSubmit = () => {
    if (!createSubmitButton) {
      return;
    }
    const nameValue = createNameInput?.value.trim() || "";
    const baseValue = createLocationInput?.value.trim() || "";
    createSubmitButton.disabled = !nameValue || !baseValue;
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
    if (gitNavButton) {
      gitNavButton.classList.toggle("is-active", aiView === "git");
    }
    if (doxygenNavButton) {
      doxygenNavButton.classList.toggle("is-active", aiView === "doxygen");
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
          (aiView === "get-started" || aiView === "run") && match
        );
      });
    }
  };

  const setAiView = (view) => {
    aiView = view;
    document.body.dataset.aiView = view;
    setAi(true);
    updateSidebarActive();
    if (view === "agent" && typeof refreshPromptInput === "function") {
      refreshPromptInput();
      if (promptInput) {
        window.setTimeout(() => {
          promptInput.focus();
        }, 0);
      }
      const projectPath =
        currentProjectPath || document.body.dataset.projectPath || "";
      if (projectPath && projectPath !== chatProjectPath) {
        loadChatSession(projectPath);
      }
      scheduleChatScroll();
      scheduleInitialChatScroll();
    }
    if (view === "get-started") {
      if (buildToolsInstalled) {
        goToRunScreen();
      } else {
        setBuildPanels();
        checkBuildTools();
      }
    }
    if (view === "git") {
      loadGitStatus();
    }
    if (view === "doxygen") {
      checkDoxygen();
    }
    updateOpenSolutionButtons();
    if (view !== "run") {
      updateDropOverlay(false);
      closeResourceDialog();
    }
  };

  const setActiveProjectItem = (name) => {
    activeProjectItem = name || "";
    updateSidebarActive();
    updateOpenSolutionButtons();
  };

  const getActiveProjectItemType = () => {
    const match = projectItems.find((item) => item.name === activeProjectItem);
    return match?.type || "plugin";
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

  const updateOpenSolutionButtons = () => {
    if (!openSolutionButtons.length) {
      return;
    }
    const isVisibleView =
      document.body.dataset.aiView === "get-started" ||
      document.body.dataset.aiView === "run";
    const isAvailable = Boolean(activeProjectItem) && isVisibleView;
    openSolutionButtons.forEach((button) => {
      if (!button) {
        return;
      }
      button.hidden = !isAvailable;
      button.disabled = !activeProjectItem;
    });
  };

  let doxygenInstalled = false;
  let doxygenChecking = false;

  const applyDoxygenState = (state) => {
    doxygenInstalled = Boolean(state?.installed);
    if (doxygenStatusEl) {
      if (doxygenChecking) {
        doxygenStatusEl.textContent = "Checking for Doxygen...";
      } else if (doxygenInstalled) {
        doxygenStatusEl.textContent = "Installed";
      } else {
        doxygenStatusEl.textContent = "Not installed";
      }
    }
    if (doxygenInstallButton) {
      doxygenInstallButton.disabled = doxygenChecking || doxygenInstalled;
    }
    if (doxygenInstructions) {
      doxygenInstructions.hidden = doxygenInstalled;
    }
    if (doxygenReadyEl) {
      doxygenReadyEl.hidden = !doxygenInstalled;
    }
  };

  const checkDoxygen = async () => {
    if (!window.ifactory?.doxygen?.check) {
      applyDoxygenState({ installed: false });
      return;
    }
    doxygenChecking = true;
    applyDoxygenState({ installed: false });
    try {
      const result = await window.ifactory.doxygen.check();
      doxygenChecking = false;
      applyDoxygenState(result);
    } catch (error) {
      doxygenChecking = false;
      applyDoxygenState({ installed: false });
    }
  };

  let pendingResourceFile = "";
  let resourceDialogError = "";
  let resourceNameError = "";
  let resourceTypeSupported = false;

  const updateDropOverlay = (active) => {
    if (!dropOverlay) {
      return;
    }
    dropOverlay.hidden = !active;
    dropOverlay.classList.toggle("is-active", active);
  };

  const normalizeResourceInput = (value) => {
    const raw = value || "";
    const invalid = /[^a-zA-Z0-9 _]/.test(raw);
    const cleaned = raw.replace(/[^a-zA-Z0-9 _]/g, "");
    const upper = cleaned.toUpperCase();
    const underscored = upper.replace(/\s+/g, "_");
    const normalized = underscored.replace(/_+/g, "_");
    return { value: normalized, invalid };
  };

  const renderResourceError = () => {
    if (!resourceErrorEl) {
      return;
    }
    const message = resourceDialogError || resourceNameError;
    if (!message) {
      resourceErrorEl.textContent = "";
      resourceErrorEl.hidden = true;
      return;
    }
    resourceErrorEl.textContent = message;
    resourceErrorEl.hidden = false;
  };

  const updateResourceAddState = () => {
    if (!resourceAddButton || !resourceNameInput) {
      return;
    }
    const normalized = normalizeResourceInput(resourceNameInput.value);
    if (resourceNameInput.value !== normalized.value) {
      resourceNameInput.value = normalized.value;
    }
    resourceNameError = normalized.invalid
      ? "Use only letters, numbers, spaces, or underscores."
      : "";
    renderResourceError();
    const canAdd =
      Boolean(pendingResourceFile) &&
      resourceTypeSupported &&
      Boolean(normalized.value.trim()) &&
      !resourceDialogError &&
      !resourceNameError;
    resourceAddButton.disabled = !canAdd;
  };

  const closeResourceDialog = () => {
    if (!resourceDialog) {
      return;
    }
    resourceDialog.classList.remove("is-active");
    resourceDialog.hidden = true;
    pendingResourceFile = "";
    resourceDialogError = "";
    resourceNameError = "";
    resourceTypeSupported = false;
    if (resourceNameInput) {
      resourceNameInput.value = "";
    }
    if (resourceRemoveToggle) {
      resourceRemoveToggle.checked = false;
    }
    if (resourceFileLabel) {
      resourceFileLabel.textContent = "";
    }
    renderResourceError();
    updateResourceAddState();
  };

  const openResourceDialog = ({ filePath, fileName, errorMessage, supported }) => {
    if (!resourceDialog) {
      return;
    }
    pendingResourceFile = filePath || "";
    resourceDialogError = errorMessage || "";
    resourceNameError = "";
    resourceTypeSupported = Boolean(supported);
    if (resourceFileLabel) {
      resourceFileLabel.textContent = fileName
        ? `File: ${fileName}`
        : "No file selected.";
    }
    if (resourceNameInput) {
      resourceNameInput.value = "";
    }
    if (resourceRemoveToggle) {
      resourceRemoveToggle.checked = false;
    }
    renderResourceError();
    updateResourceAddState();
    resourceDialog.hidden = false;
    resourceDialog.classList.add("is-active");
    if (resourceNameInput) {
      window.setTimeout(() => resourceNameInput.focus(), 0);
    }
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
    if (!buildPanelCheck) {
      return;
    }
    buildPanelCheck.hidden = false;
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

  const setBuildRunning = (running) => {
    buildRunning = running;
    if (buildRunButton) {
      buildRunButton.classList.toggle("is-running", running);
    }
    if (buildRunIcon) {
      buildRunIcon.src = running ? "../icons/stop.svg" : "../icons/run.svg";
    }
    if (buildRunLabel) {
      buildRunLabel.textContent = running ? "Stop" : "Run";
    }
  };

  const appendBuildOutput = (text) => {
    if (!buildOutputEl || !buildConsole) {
      return;
    }
    buildConsole.hidden = false;
    buildOutputEl.textContent += text;
    buildConsole.scrollTop = buildConsole.scrollHeight;
  };

  const resetBuildOutput = () => {
    if (!buildOutputEl || !buildConsole) {
      return;
    }
    buildOutputEl.textContent = "";
    buildConsole.hidden = true;
  };

  const waitFrame = () =>
    new Promise((resolve) => window.requestAnimationFrame(resolve));

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

  const startBuildRun = async () => {
    if (!window.ifactory?.build?.run) {
      return;
    }
    const projectPath = currentProjectPath || document.body.dataset.projectPath || "";
    if (!projectPath || !activeProjectItem) {
      appendBuildOutput("Select a plugin to run.\n");
      return;
    }
    const itemType = getActiveProjectItemType();
    resetBuildOutput();
    setBuildRunning(true);
    await waitFrame();
    buildConsole.hidden = false;
    const result = await window.ifactory.build.run({
      projectPath,
      pluginName: activeProjectItem,
      itemType,
      configuration: "Debug",
      platform: "x64"
    });
    if (result?.error) {
      appendBuildOutput(`Error: ${result.error}\n`);
      setBuildRunning(false);
    }
  };

  const stopBuildRun = async () => {
    if (!window.ifactory?.build?.stop) {
      return;
    }
    await window.ifactory.build.stop();
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

  const updateGitRepoHeader = () => {
    if (!gitRepoNameEl || !gitRepoPathEl) {
      return;
    }
    if (!currentProjectPath) {
      gitRepoNameEl.textContent = "No repository";
      gitRepoPathEl.textContent = "Open a project to see its repository";
      return;
    }
    const parts = currentProjectPath.split(/[/\\]/).filter(Boolean);
    const name = parts[parts.length - 1] || currentProjectPath;
    gitRepoNameEl.textContent = name;
    gitRepoPathEl.textContent = currentProjectPath;
  };

  const runPromptSendTransition = () => {
    if (!promptPanel || !promptSendButton || !promptDock) {
      return;
    }
    if (promptPanel.classList.contains("is-sent")) {
      return;
    }
    promptPanel.classList.add("is-sent");
    promptDock.classList.add("is-sent");
    window.setTimeout(() => {
      promptPanel.classList.add("is-hidden");
    }, 260);
  };

  const extractToolCalls = (text) => {
    if (!text) {
      return { clean: "", tools: [] };
    }
    const tools = [];
    const cleaned = text.replace(/\[\[tool:([a-z0-9_-]+)\]\]/gi, (match, name) => {
      tools.push(String(name).toLowerCase());
      return "";
    }).replace(/\n{3,}/g, "\n\n").trim();
    return { clean: cleaned, tools };
  };

  const handleToolCalls = (tools) => {
    if (!Array.isArray(tools) || tools.length === 0) {
      return;
    }
    if (tools.includes("ping") && window.ifactory?.agent?.ping) {
      try {
        window.ifactory.agent.ping();
      } catch (error) {
        // ignore ping errors
      }
    }
  };

  const createChatBubble = (role, tone) => {
    if (!chatListEl) {
      return null;
    }
    const bubble = document.createElement("div");
    bubble.className = "ai-chat-bubble";
    if (role === "assistant") {
      bubble.classList.add("ai-chat-bubble--assistant");
    }
    if (tone) {
      bubble.classList.add(`ai-chat-bubble--${tone}`);
    }
    chatListEl.appendChild(bubble);
    chatListEl.scrollTop = chatListEl.scrollHeight;
    return bubble;
  };

  const createActivityBubble = () => {
    const bubble = createChatBubble("assistant");
    if (!bubble) {
      return null;
    }
    bubble.classList.add("ai-chat-bubble--activity");

    const title = document.createElement("div");
    title.className = "ai-chat-activity__title";
    title.textContent = "Working";

    const makeRow = (labelText, valueText) => {
      const row = document.createElement("div");
      row.className = "ai-chat-activity__row";
      const label = document.createElement("span");
      label.className = "ai-chat-activity__label";
      label.textContent = labelText;
      const value = document.createElement("span");
      value.className = "ai-chat-activity__value";
      value.textContent = valueText;
      row.append(label, value);
      return { row, value };
    };

    const thoughts = makeRow("Thoughts", "Thinking...");
    const commands = makeRow("Commands", "Waiting...");
    const edits = makeRow("Edits", "None yet.");

    bubble.append(title, thoughts.row, commands.row, edits.row);
    bubble.dataset.activity = "live";
    bubble._activity = {
      thoughts: thoughts.value,
      commands: commands.value,
      edits: edits.value
    };
    return bubble;
  };

  const updateActivityBubble = (bubble, updates = {}) => {
    if (!bubble || !bubble._activity) {
      return;
    }
    const { thoughts, commands, edits } = updates;
    if (typeof thoughts === "string") {
      bubble._activity.thoughts.textContent = thoughts;
    }
    if (typeof commands === "string") {
      bubble._activity.commands.textContent = commands;
    }
    if (typeof edits === "string") {
      bubble._activity.edits.textContent = edits;
    }
  };

  const clearActivityBubble = (bubble) => {
    if (!bubble) {
      return;
    }
    bubble.classList.add("is-complete");
    window.setTimeout(() => {
      if (bubble.parentElement) {
        bubble.remove();
      }
    }, 260);
  };

  const renderAssistantMarkdown = (bubble, text) => {
    if (!bubble) {
      return;
    }
    bubble.innerHTML = "";
    const blocks = String(text || "").split(/```/);
    const appendInlineContent = (parent, value) => {
      const parts = String(value || "")
        .split(/(`[^`]+`)/g)
        .filter(Boolean);
      parts.forEach((part) => {
        const inlineMatch = part.match(/^`([^`]+)`$/);
        if (inlineMatch) {
          const code = document.createElement("code");
          code.className = "inline-code";
          code.textContent = inlineMatch[1];
          parent.appendChild(code);
        } else {
          parent.appendChild(document.createTextNode(part));
        }
      });
    };
    const appendParagraph = (lines) => {
      if (!lines.length) {
        return;
      }
      const p = document.createElement("p");
      appendInlineContent(p, lines.join(" ").trim());
      bubble.appendChild(p);
    };
    const renderTextBlock = (segment) => {
      const lines = segment.split(/\r?\n/);
      let buffer = [];
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
          appendParagraph(buffer);
          buffer = [];
          i += 1;
          continue;
        }
        const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
        if (ulMatch) {
          appendParagraph(buffer);
          buffer = [];
          const ul = document.createElement("ul");
          while (i < lines.length) {
            const match = lines[i].match(/^\s*[-*+]\s+(.*)$/);
            if (!match) {
              break;
            }
            const li = document.createElement("li");
            appendInlineContent(li, match[1]);
            ul.appendChild(li);
            i += 1;
          }
          bubble.appendChild(ul);
          continue;
        }
        const olMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);
        if (olMatch) {
          appendParagraph(buffer);
          buffer = [];
          const ol = document.createElement("ol");
          while (i < lines.length) {
            const match = lines[i].match(/^\s*\d+[.)]\s+(.*)$/);
            if (!match) {
              break;
            }
            const li = document.createElement("li");
            appendInlineContent(li, match[1]);
            ol.appendChild(li);
            i += 1;
          }
          bubble.appendChild(ol);
          continue;
        }
        buffer.push(line.trim());
        i += 1;
      }
      appendParagraph(buffer);
    };

    blocks.forEach((block, index) => {
      if (index % 2 === 1) {
        const lines = block.replace(/^\n/, "").split(/\r?\n/);
        const hasLang =
          lines.length > 1 && /^[a-z0-9_-]+$/i.test(lines[0].trim());
        const codeText = hasLang ? lines.slice(1).join("\n") : block;
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = codeText.replace(/^\n/, "");
        pre.appendChild(code);
        bubble.appendChild(pre);
      } else {
        renderTextBlock(block);
      }
    });
  };

  const persistChatMessage = async (message, save = true) => {
    chatMessages.push(message);
    if (save && window.ifactory?.session?.append && chatProjectPath) {
      try {
        await window.ifactory.session.append({
          path: chatProjectPath,
          message
        });
      } catch (error) {
        // ignore persistence errors
      }
    }
  };

  const appendChatMessage = async (text, role = "user", { save = true, tone } = {}) => {
    if (!chatListEl || !text) {
      return;
    }
    const bubble = createChatBubble(role, tone);
    if (!bubble) {
      return;
    }
    if (role === "assistant" && tone !== "error") {
      renderAssistantMarkdown(bubble, text);
    } else {
      bubble.textContent = text;
    }
    const message = {
      role,
      content: text,
      createdAt: new Date().toISOString()
    };
    if (tone === "error") {
      message.error = true;
    }
    await persistChatMessage(message, save);
  };

  const streamAssistantMessage = (text) =>
    new Promise((resolve) => {
      if (!text) {
        resolve();
        return;
      }
      const bubble = createChatBubble("assistant");
      if (!bubble) {
        resolve();
        return;
      }
      bubble.classList.add("is-streaming");
      let index = 0;
      const step = 2;
      const tick = () => {
        index = Math.min(text.length, index + step);
        bubble.textContent = text.slice(0, index);
        chatListEl.scrollTop = chatListEl.scrollHeight;
        if (index < text.length) {
          window.requestAnimationFrame(tick);
        } else {
          bubble.classList.remove("is-streaming");
          renderAssistantMarkdown(bubble, text);
          persistChatMessage(
            {
              role: "assistant",
              content: text,
              createdAt: new Date().toISOString()
            },
            true
          ).finally(resolve);
        }
      };
      tick();
    });

  const renderChatHistory = (messages) => {
    if (!chatListEl) {
      return;
    }
    chatListEl.innerHTML = "";
    chatMessages = Array.isArray(messages) ? messages : [];
    let lastBubble = null;
    chatMessages.forEach((message) => {
      const bubble = document.createElement("div");
      bubble.className = "ai-chat-bubble";
      if (message.role === "assistant") {
        bubble.classList.add("ai-chat-bubble--assistant");
      }
      if (message.error) {
        bubble.classList.add("ai-chat-bubble--error");
      }
      if (message.role === "assistant" && !message.error) {
        renderAssistantMarkdown(bubble, message.content || "");
      } else {
        bubble.textContent = message.content || "";
      }
      chatListEl.appendChild(bubble);
      lastBubble = bubble;
    });
    if (lastBubble && typeof lastBubble.scrollIntoView === "function") {
      lastBubble.scrollIntoView({ block: "end" });
    } else {
      chatListEl.scrollTop = chatListEl.scrollHeight;
    }
  };

  const loadChatSession = async (projectPath) => {
    if (!window.ifactory?.session?.load || !projectPath) {
      return;
    }
    try {
      const result = await window.ifactory.session.load({ path: projectPath });
      if (result?.error) {
        return;
      }
      chatProjectPath = projectPath;
      const sessionMessages = result?.session?.messages || [];
    renderChatHistory(sessionMessages);
    scheduleChatScroll();
    if (promptPanel && promptDock) {
      if (sessionMessages.length > 0) {
        promptPanel.classList.add("is-sent");
        promptPanel.classList.add("is-hidden");
        promptDock.classList.add("is-sent");
        scheduleChatScroll();
      } else {
        promptPanel.classList.remove("is-sent", "is-hidden");
        promptDock.classList.remove("is-sent");
      }
    }
    } catch (error) {
      // ignore load errors
    }
  };

  const ensureChatProjectPath = () => {
    const projectPath =
      currentProjectPath || document.body.dataset.projectPath || "";
    if (projectPath) {
      chatProjectPath = projectPath;
    }
    return projectPath;
  };

  const setCodexBusy = (busy) => {
    codexBusy = busy;
    if (promptSendButton) {
      const value = promptInput?.value.trim() || "";
      promptSendButton.disabled = busy || !value;
    }
  };

  const getGitStatusInfo = (status) => {
    switch (status) {
      case "A":
        return { label: "A", className: "git-file-status--new" };
      case "D":
        return { label: "D", className: "git-file-status--del" };
      case "R":
        return { label: "R", className: "git-file-status--ren" };
      case "C":
        return { label: "C", className: "git-file-status--ren" };
      case "U":
        return { label: "U", className: "git-file-status--conflict" };
      case "?":
        return { label: "U", className: "git-file-status--new" };
      case "M":
      default:
        return { label: "M", className: "git-file-status--mod" };
    }
  };

  const updateCommitButton = () => {
    if (!gitCommitButton) {
      return;
    }
    const summary = gitSummaryInput?.value.trim() || "";
    const hasSelection = gitSelected.size > 0;
    gitCommitButton.disabled = !summary || !hasSelection;
  };

  const renderGitChanges = () => {
    if (!gitChangesListEl || !gitChangesEmptyEl) {
      return;
    }
    const query = (gitFilterInput?.value || "").trim().toLowerCase();
    const filtered = query
      ? gitChanges.filter((change) =>
          change.path.toLowerCase().includes(query)
        )
      : gitChanges;

    gitChangesListEl.innerHTML = "";
    const emptyMessage = gitChanges.length
      ? "No matching files."
      : "No local changes yet.";
    gitChangesEmptyEl.textContent = emptyMessage;
    gitChangesEmptyEl.hidden = filtered.length > 0;
    if (gitChangesCountEl) {
      gitChangesCountEl.textContent = String(gitChanges.length);
    }
    filtered.forEach((change) => {
      const row = document.createElement("div");
      row.className = "git-file-item";

      const checkWrap = document.createElement("label");
      checkWrap.className = "git-file-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = gitSelected.has(change.path);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          gitSelected.add(change.path);
        } else {
          gitSelected.delete(change.path);
        }
        updateCommitButton();
      });
      checkWrap.appendChild(checkbox);

      const name = document.createElement("span");
      name.className = "git-file-name";
      name.textContent = change.path;

      const statusInfo = getGitStatusInfo(change.status);
      const status = document.createElement("span");
      status.className = `git-file-status ${statusInfo.className}`;
      status.textContent = statusInfo.label;

      row.appendChild(checkWrap);
      row.appendChild(name);
      row.appendChild(status);
      gitChangesListEl.appendChild(row);
    });
  };

  const loadGitStatus = async () => {
    if (!window.ifactory?.git?.status) {
      gitChanges = [];
      renderGitChanges();
      return;
    }
    const projectPath =
      currentProjectPath || document.body.dataset.projectPath || "";
    if (!projectPath) {
      gitChanges = [];
      renderGitChanges();
      return;
    }
    try {
      const result = await window.ifactory.git.status({ path: projectPath });
      if (result?.error) {
        gitChanges = [];
        renderGitChanges();
        return;
      }
      gitChanges = Array.isArray(result?.changes) ? result.changes : [];
      gitSelected = new Set(gitChanges.map((change) => change.path));
      renderGitChanges();
    } catch (error) {
      gitChanges = [];
      gitSelected = new Set();
      renderGitChanges();
    }
    updateCommitButton();
  };

  const setGitRepoState = (isRepo) => {
    if (!gitBodyEl || !gitEmptyEl) {
      return;
    }
    gitBodyEl.hidden = !isRepo;
    gitEmptyEl.hidden = isRepo;
    if (isRepo) {
      loadGitStatus();
    } else {
      gitChanges = [];
      gitSelected = new Set();
      renderGitChanges();
      updateCommitButton();
    }
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
      setGitRepoState(false);
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
      document.body.classList.remove("is-installing-run");
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
    updateGitRepoHeader();
    if (!currentProjectPath) {
      chatProjectPath = "";
      renderChatHistory([]);
    }
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
      setGitRepoState(Boolean(result?.isGitRepo));
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
      setBuildPanels();
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
  if (gitNavButton) {
    gitNavButton.addEventListener("click", () => {
      setAiView("git");
    });
  }
  if (doxygenNavButton) {
    doxygenNavButton.addEventListener("click", () => {
      setAiView("doxygen");
    });
  }
  if (gitFilterInput) {
    gitFilterInput.addEventListener("input", () => {
      renderGitChanges();
    });
  }
  if (gitSummaryInput) {
    gitSummaryInput.addEventListener("input", () => {
      updateCommitButton();
    });
  }
  if (gitCommitButton) {
    gitCommitButton.addEventListener("click", async () => {
      if (!window.ifactory?.git?.commit) {
        return;
      }
      const summary = gitSummaryInput?.value.trim() || "";
      if (!summary || gitSelected.size === 0) {
        updateCommitButton();
        return;
      }
      const projectPath =
        currentProjectPath || document.body.dataset.projectPath || "";
      if (!projectPath) {
        return;
      }
      const description = gitDescriptionInput?.value.trim() || "";
      const result = await window.ifactory.git.commit({
        path: projectPath,
        summary,
        description,
        files: Array.from(gitSelected)
      });
      if (!result?.error) {
        if (gitSummaryInput) {
          gitSummaryInput.value = "";
        }
        if (gitDescriptionInput) {
          gitDescriptionInput.value = "";
        }
        await loadGitStatus();
      }
      updateCommitButton();
    });
  }
  if (doxygenInstallButton) {
    doxygenInstallButton.addEventListener("click", async () => {
      if (!window.ifactory?.doxygen?.install) {
        return;
      }
      const installApi = getInstallApi();
      installApi.setHeader?.("Installing", "Setting up Doxygen");
      installApi.setStatus?.("");
      installApi.start?.();
      window.ifactoryInstall?.setCancelDisabled?.(true);
      try {
        const result = await window.ifactory.doxygen.install();
        if (result?.error) {
          const message = result.details
            ? `Installation failed: ${result.details}`
            : "Installation failed. Check your settings and try again.";
          installApi.setStatus?.(message, "error");
          return;
        }
        installApi.setStatus?.("Doxygen installed.", "success");
        doxygenInstalled = true;
        applyDoxygenState({ installed: true });
      } catch (error) {
        installApi.setStatus?.("Installation failed. Check your settings and try again.", "error");
      } finally {
        installApi.stop?.();
        window.ifactoryInstall?.setCancelDisabled?.(false);
        window.ifactoryInstall?.resetHeader?.();
      }
    });
  }
  if (openDesktopButton) {
    openDesktopButton.addEventListener("click", async () => {
      const projectPath =
        currentProjectPath || document.body.dataset.projectPath || "";
      if (!projectPath || !window.ifactory?.githubDesktop?.open) {
        return;
      }
      try {
        await window.ifactory.githubDesktop.open({ path: projectPath });
      } catch (error) {
        console.error("Failed to open GitHub Desktop", error);
      }
    });
  }
  const sendPrompt = async (text) => {
    ensureChatProjectPath();
    setCodexBusy(true);
    await appendChatMessage(text, "user");
    runPromptSendTransition();
    const activityBubble = createActivityBubble();
    updateActivityBubble(activityBubble, {
      thoughts: "Drafting a response...",
      commands: "Running Codex CLI...",
      edits: "No edits yet."
    });
    const projectPath = ensureChatProjectPath();
    const history = chatMessages.slice(-20).map((message) => ({
      role: message.role,
      content: message.content
    }));
    if (!window.ifactory?.codex?.chat || !projectPath) {
      clearActivityBubble(activityBubble);
      await appendChatMessage(
        "Codex is not available. Install Codex CLI to continue.",
        "assistant",
        { tone: "error" }
      );
      setCodexBusy(false);
      return;
    }
    const result = await window.ifactory.codex.chat({
      path: projectPath,
      message: text,
      history
    });
    clearActivityBubble(activityBubble);
    if (result?.reply) {
      const parsed = extractToolCalls(result.reply);
      handleToolCalls(parsed.tools);
      if (parsed.clean) {
        await streamAssistantMessage(parsed.clean);
      }
    } else {
      await appendChatMessage(
        result?.error === "codex_missing"
          ? "Codex CLI was not found. Install it to continue."
          : result?.details
            ? result.details
            : "Unable to reach Codex right now.",
        "assistant",
        { tone: "error" }
      );
    }
    setCodexBusy(false);
  };

  if (promptSendButton) {
    promptSendButton.addEventListener("click", () => {
      if (promptInput && !promptInput.value.trim()) {
        return;
      }
      if (promptInput) {
        const text = promptInput.value.trim();
        promptInput.value = "";
        sendPrompt(text);
      }
    });
  }
  if (promptInput && promptSendButton) {
    const updatePromptSendState = () => {
      promptSendButton.disabled = codexBusy || !promptInput.value.trim();
    };
    const updatePromptHeight = () => {
      const style = window.getComputedStyle(promptInput);
      const lineHeight = Number.parseFloat(style.lineHeight) || 24;
      const maxHeight = lineHeight * 8;
      promptInput.style.height = "auto";
      const nextHeight = Math.min(promptInput.scrollHeight, maxHeight);
      promptInput.style.height = `${Math.max(nextHeight, lineHeight)}px`;
      promptInput.style.overflowY =
        promptInput.scrollHeight > maxHeight ? "auto" : "hidden";
      if (promptBar) {
        promptBar.classList.toggle(
          "is-multiline",
          promptInput.scrollHeight > lineHeight * 1.2
        );
      }
    };
    promptInput.addEventListener("input", updatePromptSendState);
    promptInput.addEventListener("input", updatePromptHeight);
    promptInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!promptSendButton.disabled) {
          const text = promptInput.value.trim();
          promptInput.value = "";
          updatePromptSendState();
          sendPrompt(text);
        }
      }
    });
    updatePromptSendState();
    updatePromptHeight();
    refreshPromptInput = () => {
      updatePromptSendState();
      updatePromptHeight();
    };
  }
  if (buildRunButton) {
    buildRunButton.addEventListener("click", async () => {
      if (buildRunning) {
        await stopBuildRun();
      } else {
        await startBuildRun();
      }
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
  if (openSolutionButtons.length) {
    openSolutionButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const projectPath =
          currentProjectPath || document.body.dataset.projectPath || "";
        if (!projectPath || !activeProjectItem) {
          return;
        }
        if (!window.ifactory?.solution?.open) {
          return;
        }
        try {
          const result = await window.ifactory.solution.open({
            projectPath,
            pluginName: activeProjectItem
          });
          if (result?.error) {
            console.error("Failed to open solution", result);
          }
        } catch (error) {
          console.error("Failed to open solution", error);
        }
      });
    });
  }
  if (resourceNameInput) {
    resourceNameInput.addEventListener("input", () => {
      updateResourceAddState();
    });
    resourceNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (resourceAddButton && !resourceAddButton.disabled) {
          resourceAddButton.click();
        }
      }
    });
  }
  if (resourceCancelButton) {
    resourceCancelButton.addEventListener("click", () => {
      closeResourceDialog();
    });
  }
  if (resourceAddButton) {
    resourceAddButton.addEventListener("click", async () => {
      if (!pendingResourceFile || resourceAddButton.disabled) {
        return;
      }
      const projectPath =
        currentProjectPath || document.body.dataset.projectPath || "";
      if (!projectPath || !activeProjectItem) {
        return;
      }
      if (!window.ifactory?.resource?.add) {
        return;
      }
      try {
        const result = await window.ifactory.resource.add({
          projectPath,
          pluginName: activeProjectItem,
          filePath: pendingResourceFile,
          resourceName: resourceNameInput?.value || "",
          removeOriginal: Boolean(resourceRemoveToggle?.checked)
        });
        if (result?.error) {
          const message =
            result.error === "unsupported_type"
              ? "Resource type not supported."
              : result.error === "file_not_found"
                ? "File not found."
                : result.error === "plugin_not_found"
                  ? "Plugin not found."
                  : "Unable to add resource.";
          if (result.error === "invalid_name") {
            resourceNameError = "Use only letters, numbers, spaces, or underscores.";
          } else {
            resourceDialogError = message;
          }
          renderResourceError();
          updateResourceAddState();
          return;
        }
        closeResourceDialog();
      } catch (error) {
        resourceDialogError = "Unable to add resource.";
        renderResourceError();
        updateResourceAddState();
      }
    });
  }
  if (runView) {
    let dragDepth = 0;
    const isFileDrag = (event) =>
      Array.from(event.dataTransfer?.types || []).includes("Files");
    const canDrop = () =>
      document.body.dataset.aiView === "run" &&
      getActiveProjectItemType() === "plugin";
    const getExtension = (fileName) => {
      const index = fileName.lastIndexOf(".");
      if (index === -1) {
        return "";
      }
      return fileName.slice(index).toLowerCase();
    };
    const isSupportedResource = (fileName) => {
      const ext = getExtension(fileName);
      return ext === ".svg" || ext === ".png" || ext === ".ttf";
    };

    runView.addEventListener("dragenter", (event) => {
      if (!canDrop() || !isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      dragDepth += 1;
      updateDropOverlay(true);
    });
    runView.addEventListener("dragover", (event) => {
      if (!canDrop() || !isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      updateDropOverlay(true);
    });
    runView.addEventListener("dragleave", (event) => {
      if (!canDrop() || !isFileDrag(event)) {
        return;
      }
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        updateDropOverlay(false);
      }
    });
    runView.addEventListener("drop", (event) => {
      if (!canDrop() || !isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      dragDepth = 0;
      updateDropOverlay(false);
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length !== 1) {
        openResourceDialog({
          filePath: "",
          fileName: "",
          supported: false,
          errorMessage: "Drop one file at a time."
        });
        return;
      }
      const file = files[0];
      const supported = isSupportedResource(file.name);
      openResourceDialog({
        filePath: file.path || "",
        fileName: file.name || "",
        supported,
        errorMessage: supported ? "" : "Resource type not supported."
      });
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
      if (createErrorEl) {
        createErrorEl.hidden = true;
        createErrorEl.textContent = "";
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
          const message =
            result.error === "folder_exists"
              ? "That folder already exists. Choose a new name or location."
              : result.error === "github_not_connected"
                ? "Connect GitHub before creating a repository."
                : result.error === "git_required"
                  ? "Install Git before creating a repository."
                  : result.error === "missing_fields"
                    ? "Enter a project name and location first."
                    : "Unable to create the project. Check your settings and try again.";
          if (createErrorEl) {
            createErrorEl.textContent = message;
            createErrorEl.hidden = false;
          }
          console.error("Failed to create project", result.error);
          return;
        }
        if (result?.repoWarning && createErrorEl) {
          const warning =
            result.repoWarning === "repo_exists"
              ? "A GitHub repo with that name already exists. The workspace was created locally."
              : "GitHub repo could not be created. The workspace was created locally.";
          createErrorEl.textContent = warning;
          createErrorEl.hidden = false;
        }
        updateInstallPath(result.path);
        setInstalling(true);
        await loadRecents();
      } catch (error) {
        console.error("Failed to create project", error);
      }
    });
  }
  if (createNameInput) {
    createNameInput.addEventListener("input", updateCreateSubmit);
  }
  if (createLocationInput) {
    createLocationInput.addEventListener("input", updateCreateSubmit);
  }
  updateCreateSubmit();
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
      if (createErrorEl) {
        createErrorEl.hidden = true;
        createErrorEl.textContent = "";
      }
      setCreating(false);
    });
  });
  homeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (createErrorEl) {
        createErrorEl.hidden = true;
        createErrorEl.textContent = "";
      }
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

  if (window.ifactory?.project?.onItemsUpdated) {
    window.ifactory.project.onItemsUpdated(async (payload) => {
      if (!payload) {
        return;
      }
      const projectPath = payload.projectPath || "";
      if (!projectPath || projectPath !== currentProjectPath) {
        return;
      }
      await loadProjectItems(currentProjectPath);
    });
  }

  if (window.ifactory?.build?.onOutput) {
    window.ifactory.build.onOutput((payload) => {
      if (!payload) {
        return;
      }
      if (payload.text) {
        appendBuildOutput(payload.text);
      }
      if (payload.error) {
        appendBuildOutput(`Error: ${payload.error}\n`);
      }
    });
  }
  if (window.ifactory?.build?.onState) {
    window.ifactory.build.onState((payload) => {
      const state = payload?.state;
      if (!state) {
        return;
      }
      if (state === "building" || state === "running") {
        setBuildRunning(true);
        if (payload?.message) {
          appendBuildOutput(`${payload.message}\n`);
        }
        return;
      }
      if (payload?.message) {
        appendBuildOutput(`${payload.message}\n`);
      }
      if (state === "stopped" || state === "error" || state === "complete") {
        setBuildRunning(false);
      }
    });
  }

  updateGitRepoHeader();
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
        locationInput.dispatchEvent(new Event("input", { bubbles: true }));
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
  if (window.ifactory?.doxygen?.onProgress) {
    window.ifactory.doxygen.onProgress((payload) => {
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
    resetHeader: resetInstallHeader,
    setCancelDisabled: (disabled) => {
      if (installCancel) {
        installCancel.disabled = Boolean(disabled);
      }
    }
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
