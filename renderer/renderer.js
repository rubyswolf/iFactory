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
  if (!window.ifactory?.settings || !window.ifactory?.github) {
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

  if (!statusEl || !connectButton || !flowEl || !codeEl || !resetButton) {
    return;
  }

  let pollTimer = null;
  let verificationUri = "https://github.com/login/device";
  let githubConnected = false;
  let currentProjectPath = "";

  const setFlowVisible = (visible) => {
    flowEl.hidden = !visible;
  };

  const setSetupComplete = (complete) => {
    document.body.classList.toggle("is-setup-complete", complete);
    if (!complete) {
      document.body.classList.remove("is-creating");
      document.body.classList.remove("is-installing");
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
    }
  };

  const setInstalling = (installing) => {
    document.body.classList.toggle("is-installing", installing);
    if (installing) {
      document.body.classList.remove("is-creating");
    }
  };

  const updateInstallPath = (pathValue) => {
    currentProjectPath = pathValue || "";
    if (installPath) {
      installPath.textContent = currentProjectPath || "Not set";
    }
  };

  const goToSetup = () => {
    setSkipped(false);
    setSetupComplete(false);
    setCreating(false);
    setInstalling(false);
    setFlowVisible(false);
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
    setSetupComplete(githubConnected || isSkipped());
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
      applyGithubState(settings);
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

  connectButton.addEventListener("click", startFlow);
  resetButton.addEventListener("click", disconnect);
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
    });
  }
  if (createButton) {
    createButton.addEventListener("click", () => {
      setCreating(true);
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
        const result = await window.ifactory.project.open({ path: folder });
        if (result?.error) {
          return;
        }
        updateInstallPath(result.path);
        if (result.needsIPlug) {
          setInstalling(true);
        }
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
      setInstalling(false);
    });
  });

  loadGithub();
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
    measureEl.textContent = locationInput.value || "";
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const left = paddingLeft + measureEl.offsetWidth;
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
  if (!window.ifactory?.github) {
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

  if (
    !officialSection ||
    !forkSection ||
    !listEl ||
    !searchInput ||
    !branchListEl ||
    !branchSection ||
    !branchSearchWrap ||
    !branchSearchInput
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
});
