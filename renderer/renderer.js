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
  const backButtons = document.querySelectorAll("[data-action-back]");
  const createRepoToggle = document.querySelector("[data-create-repo]");

  if (!statusEl || !connectButton || !flowEl || !codeEl || !resetButton) {
    return;
  }

  let pollTimer = null;
  let verificationUri = "https://github.com/login/device";
  let githubConnected = false;

  const setFlowVisible = (visible) => {
    flowEl.hidden = !visible;
  };

  const setSetupComplete = (complete) => {
    document.body.classList.toggle("is-setup-complete", complete);
    if (!complete) {
      document.body.classList.remove("is-creating");
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
  };

  const goToSetup = () => {
    setSkipped(false);
    setSetupComplete(false);
    setCreating(false);
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
    if (createRepoToggle) {
      createRepoToggle.checked = githubConnected;
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
  if (cloneButton) {
    cloneButton.addEventListener("click", () => {
      if (!githubConnected) {
        goToSetup();
      }
    });
  }
  if (createRepoToggle) {
    createRepoToggle.addEventListener("change", () => {
      if (createRepoToggle.checked && !githubConnected) {
        createRepoToggle.checked = false;
        goToSetup();
      }
    });
  }
  backButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCreating(false);
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

document.addEventListener("DOMContentLoaded", () => {
  scheduleReveals();
  hydrateAppMeta();
  setupGithubOAuth();
  setupWindowControls();
  setupCreateForm();
});
