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

  if (!statusEl || !connectButton || !flowEl || !codeEl || !resetButton) {
    return;
  }

  let pollTimer = null;
  let verificationUri = "https://github.com/login/device";

  const setFlowVisible = (visible) => {
    flowEl.hidden = !visible;
  };

  const setSetupComplete = (complete) => {
    document.body.classList.toggle("is-setup-complete", complete);
  };

  const isSkipped = () => window.localStorage.getItem(skipKey) === "1";

  const setSkipped = (value) => {
    if (value) {
      window.localStorage.setItem(skipKey, "1");
    } else {
      window.localStorage.removeItem(skipKey);
    }
  };

  const applyGithubState = (settings) => {
    const github = settings?.integrations?.github;
    if (!github) {
      return;
    }

    const isConnected = Boolean(github.connected || github.tokenStored);
    statusEl.textContent = "Not connected";
    setFlowVisible(false);
    setSetupComplete(isConnected || isSkipped());
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
    });
  }

  loadGithub();
};

document.addEventListener("DOMContentLoaded", () => {
  scheduleReveals();
  hydrateAppMeta();
  setupGithubOAuth();
});
