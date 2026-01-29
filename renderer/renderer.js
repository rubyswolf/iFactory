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

const setupProjectManager = () => {
  if (!window.ifactory?.settings || !window.ifactory?.git) {
    return;
  }

  const gitSection = document.querySelector("[data-git-section]");
  const gitStatusEl = document.querySelector("[data-git-status]");
  const gitCheckButton = document.querySelector("[data-git-check]");
  const gitSkipButton = document.querySelector("[data-git-skip]");
  const gitInstructions = document.querySelector("[data-git-instructions]");
  const gitOpenButton = document.querySelector("[data-git-open]");
  const createButton = document.querySelector("[data-action-create]");
  const openProjectButton = document.querySelector("[data-action-open]");
  const backButtons = document.querySelectorAll("[data-action-back]");
  const createRepoToggle = document.querySelector("[data-create-repo]");
  const createSubmitButton = document.querySelector("[data-create-submit]");
  const createNameInput = document.querySelector("[data-create-name]");
  const createLocationInput = document.querySelector("[data-create-location]");
  const createFolderToggle = document.querySelector("[data-create-folder]");
  const installPath = document.querySelector("[data-install-path]");
  const createErrorEl = document.querySelector("[data-create-error]");
  const homeButtons = document.querySelectorAll("[data-action-home]");
  const agentNavButton = document.querySelector("[data-ai-nav=\"agent\"]");
  const doxygenNavButton = document.querySelector("[data-ai-nav=\"doxygen\"]");
  const createNavButton = document.querySelector("[data-ai-create]");
  const projectItemsEl = document.querySelector("[data-project-items]");
  const projectSidebar = document.querySelector(".project-sidebar");
  const resourceDialog = document.querySelector("[data-resource-dialog]");
  const resourceNameInput = document.querySelector("[data-resource-name]");
  const resourceAddButton = document.querySelector("[data-resource-add]");
  const resourceCancelButton = document.querySelector("[data-resource-cancel]");
  const resourceFileLabel = document.querySelector("[data-resource-file]");
  const resourceErrorEl = document.querySelector("[data-resource-error]");
  const resourceRemoveToggle = document.querySelector("[data-resource-remove]");
  const openDesktopButton = document.querySelector(
    "[data-open-github-desktop]"
  );
  const openCodeButton = document.querySelector("[data-open-code]");
  const doxygenStatusEl = document.querySelector("[data-doxygen-status]");
  const doxygenInstallButton = document.querySelector("[data-doxygen-install]");
  const doxygenReadyEl = document.querySelector("[data-doxygen-ready]");
  const doxygenInstructions = document.querySelector("[data-doxygen-instructions]");
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
    !gitSection ||
    !gitStatusEl ||
    !gitCheckButton ||
    !gitSkipButton ||
    !gitInstructions ||
    !gitOpenButton
  ) {
    return;
  }

  let currentProjectPath = "";
  let gitInstalled = false;
  let gitSkipped = false;
  let gitChecking = false;
  let templatesData = [];
  let selectedTemplate = "";
  let aiView = "agent";
  let activeProjectItem = "";
  let projectItems = [];
  let sidebarHoverLock = false;

  const sanitizeTemplateName = (value) => value.replace(/[^a-zA-Z0-9]/g, "");
  const getProjectPath = () =>
    currentProjectPath || document.body.dataset.projectPath || "";
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

  const updateSidebarActive = () => {
    if (agentNavButton) {
      agentNavButton.classList.toggle("is-active", aiView === "agent");
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
        button.classList.toggle("is-active", match);
      });
    }
  };

  const setAiView = (view) => {
    aiView = view;
    document.body.dataset.aiView = view;
    setAi(true);
    updateSidebarActive();
    if (view === "doxygen") {
      checkDoxygen();
    }
    closeResourceDialog();
  };

  const setActiveProjectItem = (name) => {
    activeProjectItem = name || "";
    updateSidebarActive();
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
  let pendingResourceTarget = "";
  let resourceDialogError = "";
  let resourceNameError = "";
  let resourceTypeSupported = false;

  const isFileDrag = (event) =>
    Array.from(event.dataTransfer?.types || []).includes("Files");
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

  const setSidebarDragHover = (active, lockOverride) => {
    if (!projectSidebar) {
      return;
    }
    if (typeof lockOverride === "boolean") {
      sidebarHoverLock = lockOverride;
    }
    if (!active && sidebarHoverLock) {
      return;
    }
    projectSidebar.classList.toggle("is-drag-hover", active);
    if (!active) {
      sidebarHoverLock = false;
    }
  };

  if (projectSidebar) {
    let sidebarDragDepth = 0;
    const isPointInsideSidebar = (event) => {
      const rect = projectSidebar.getBoundingClientRect();
      const x = event.clientX;
      const y = event.clientY;
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };
    const isPluginSidebarTarget = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return false;
      }
      const item = target.closest("[data-project-item]");
      if (!item) {
        return false;
      }
      return item.dataset.itemType === "plugin";
    };

    projectSidebar.addEventListener("dragenter", (event) => {
      if (!isFileDrag(event)) {
        return;
      }
      sidebarDragDepth += 1;
      setSidebarDragHover(true);
    });
    projectSidebar.addEventListener("dragover", (event) => {
      if (!isFileDrag(event)) {
        return;
      }
      if (isPluginSidebarTarget(event)) {
        event.preventDefault();
      }
      setSidebarDragHover(true);
    });
    projectSidebar.addEventListener("dragleave", (event) => {
      if (!isFileDrag(event)) {
        return;
      }
      sidebarDragDepth = Math.max(0, sidebarDragDepth - 1);
      if (sidebarDragDepth === 0 && !isPointInsideSidebar(event)) {
        setSidebarDragHover(false);
      }
    });
    projectSidebar.addEventListener("drop", (event) => {
      if (!isFileDrag(event)) {
        return;
      }
      sidebarDragDepth = 0;
      setSidebarDragHover(false);
    });

    document.addEventListener("dragover", (event) => {
      if (!isFileDrag(event)) {
        return;
      }
      if (isPluginSidebarTarget(event)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = event.shiftKey ? "move" : "copy";
      }
      if (isPointInsideSidebar(event)) {
        setSidebarDragHover(true);
      } else if (sidebarDragDepth === 0) {
        setSidebarDragHover(false);
      }
    });

    document.addEventListener("dragleave", (event) => {
      if (!isFileDrag(event)) {
        return;
      }
      if (sidebarDragDepth === 0 && !isPointInsideSidebar(event)) {
        setSidebarDragHover(false);
      }
    });

    document.addEventListener("dragenter", (event) => {
      if (!isFileDrag(event)) {
        return;
      }
      if (isPluginSidebarTarget(event)) {
        event.preventDefault();
      }
      if (isPointInsideSidebar(event)) {
        setSidebarDragHover(true);
      }
    });

    document.addEventListener("drop", (event) => {
      if (!isFileDrag(event)) {
        return;
      }
      if (isPluginSidebarTarget(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
      event.stopPropagation();
      sidebarDragDepth = 0;
      setSidebarDragHover(false);
    });
  }

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
    pendingResourceTarget = "";
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

  const openResourceDialog = ({
    filePath,
    fileName,
    errorMessage,
    supported,
    targetName,
    removeOriginal
  }) => {
    if (!resourceDialog) {
      return;
    }
    pendingResourceFile = filePath || "";
    pendingResourceTarget = targetName || "";
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
      resourceRemoveToggle.checked = Boolean(removeOriginal);
    }
    renderResourceError();
    updateResourceAddState();
    resourceDialog.hidden = false;
    resourceDialog.classList.add("is-active");
    if (resourceNameInput) {
      window.setTimeout(() => resourceNameInput.focus(), 0);
    }
  };

  const showProjectEditor = async (view = "agent") => {
    setAiView(view);
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

  const openSolutionForItem = async (name) => {
    setActiveProjectItem(name);
    const projectPath = getProjectPath();
    if (!projectPath || !name || !window.ifactory?.solution?.open) {
      setActiveProjectItem("");
      return;
    }
    try {
      const result = await window.ifactory.solution.open({
        projectPath,
        pluginName: name
      });
      if (result?.error) {
        console.error("Failed to open solution", result);
      }
      setActiveProjectItem("");
    } catch (error) {
      console.error("Failed to open solution", error);
      setActiveProjectItem("");
    }
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
      await openSolutionForItem(item.name);
    });

    if (item.type === "plugin") {
      let dragDepth = 0;
      const resetDragState = () => {
        dragDepth = 0;
        button.classList.remove("is-drop-target");
        setSidebarDragHover(false, false);
      };

      button.addEventListener("dragenter", (event) => {
        if (!isFileDrag(event)) {
          return;
        }
        event.preventDefault();
        dragDepth += 1;
        button.classList.add("is-drop-target");
        setSidebarDragHover(true, true);
      });

      button.addEventListener("dragover", (event) => {
        if (!isFileDrag(event)) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = event.shiftKey ? "move" : "copy";
        button.classList.add("is-drop-target");
        setSidebarDragHover(true, true);
      });

      button.addEventListener("dragleave", (event) => {
        if (!isFileDrag(event)) {
          return;
        }
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) {
          button.classList.remove("is-drop-target");
          setSidebarDragHover(false, false);
        }
      });

      button.addEventListener("drop", (event) => {
        if (!isFileDrag(event)) {
          return;
        }
        event.preventDefault();
        resetDragState();
        const files = Array.from(event.dataTransfer?.files || []);
        if (files.length !== 1) {
          openResourceDialog({
            filePath: "",
            fileName: "",
            supported: false,
            errorMessage: "Drop one file at a time.",
            targetName: item.name,
            removeOriginal: event.shiftKey
          });
          return;
        }
        const file = files[0];
        const supported = isSupportedResource(file.name);
        openResourceDialog({
          filePath: file.path || "",
          fileName: file.name || "",
          supported,
          errorMessage: supported ? "" : "Resource type not supported.",
          targetName: item.name,
          removeOriginal: event.shiftKey
        });
      });
    }

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

  const setSetupComplete = (complete) => {
    document.body.classList.toggle("is-setup-complete", complete);
    if (!complete) {
      document.body.classList.remove("is-creating");
      document.body.classList.remove("is-installing");
      document.body.classList.remove("is-ai");
      document.body.removeAttribute("data-ai-view");
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
    if (!currentProjectPath) {
      // no-op for CLI-only view
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
    setSetupComplete(true);
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
    if (createRepoToggle) {
      createRepoToggle.checked = gitInstalled;
      createRepoToggle.disabled = !gitInstalled;
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
    setSetupComplete(false);
    setCreating(false);
    setInstalling(false);
    setTemplates(false);
    setAi(false);
    setAiNeedsAgent(false);
    document.body.removeAttribute("data-ai-view");
    activeProjectItem = "";
    updateSetupState();
  };

  const loadSetup = async () => {
    try {
      const settings = await window.ifactory.settings.get();
      const gitState = settings?.dependencies?.git;
      const needsCheck = !gitState?.installed && !gitState?.skipped;
      if (needsCheck) {
        setGitChecking(true);
        gitSection.hidden = false;
        gitInstructions.hidden = true;
        gitStatusEl.textContent = "Checking Installation";
      } else {
        applyGitState(gitState);
      }
      if (needsCheck) {
        await checkGitInstallation();
      }
    } catch (error) {
      console.error("Failed to load Git settings", error);
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

  gitCheckButton.addEventListener("click", checkGitInstallation);
  gitSkipButton.addEventListener("click", skipGit);
  gitOpenButton.addEventListener("click", openGitInstaller);
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
  if (doxygenNavButton) {
    doxygenNavButton.addEventListener("click", () => {
      setAiView("doxygen");
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
      const projectPath = getProjectPath();
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
  if (openCodeButton) {
    openCodeButton.addEventListener("click", () => {
      const projectPath = getProjectPath();
      if (!projectPath || !window.ifactory?.openExternal) {
        return;
      }
      const normalized = projectPath.replace(/\\/g, "/");
      const uri = `vscode://file/${encodeURI(normalized)}`;
      window.ifactory.openExternal(uri);
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
      const projectPath = getProjectPath();
      const targetItem = pendingResourceTarget || activeProjectItem;
      if (!projectPath || !targetItem) {
        return;
      }
      if (!window.ifactory?.resource?.add) {
        return;
      }
      try {
        const result = await window.ifactory.resource.add({
          projectPath,
          pluginName: targetItem,
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

      try {
        const result = await window.ifactory.project.create({
          name,
          basePath,
          createFolder,
          createRepo
        });
        if (result?.error) {
          const message =
            result.error === "folder_exists"
              ? "That folder already exists. Choose a new name or location."
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
      const projectPath = getProjectPath();
      if (!selectedTemplate || !projectPath) {
        return;
      }
      const pluginName = templateNameInput?.value.trim() || "";
      const installApi = getInstallApi();
      if (!pluginName || !window.ifactory?.templates?.copy) {
        return;
      }
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
      await openSolutionForItem(pluginName);
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

  loadSetup();
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
  if (!window.ifactory?.iplug) {
    return;
  }

  const sourceButtons = document.querySelectorAll("[data-iplug-source]");
  const branchButtons = document.querySelectorAll("[data-iplug-branch-mode]");
  const officialSection = document.querySelector("[data-iplug-official]");
  const forkSection = document.querySelector("[data-iplug-forks]");
  const listEl = document.querySelector("[data-iplug-list]");
  const searchInput = document.querySelector("[data-iplug-search]");
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

  const buildForkItem = (repo) => {
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

    button.appendChild(title);
    button.appendChild(meta);

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

    const forks = forksData.forks.filter(filter);

    listEl.innerHTML = "";

    if (forks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fork-empty";
      empty.textContent = "No forks match your search.";
      listEl.appendChild(empty);
      return;
    }

    forks.forEach((repo) => {
      listEl.appendChild(buildForkItem(repo));
    });
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
      const forks = Array.isArray(result.forks) ? result.forks : [];
      forksData = {
        forks
      };
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
          result.error === "git_required"
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
  setupProjectManager();
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
