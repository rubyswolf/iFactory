const scheduleReveals = () => {
  const reveals = document.querySelectorAll(".reveal");
  reveals.forEach((element, index) => {
    window.setTimeout(() => {
      element.classList.add("is-visible");
    }, 120 * index);
  });
};

const hydrateAppMeta = () => {
  if (!window.ifactory) {
    return;
  }

  const versionEl = document.querySelector("[data-app-version]");
  if (versionEl) {
    versionEl.textContent = `v${window.ifactory.version}`;
  }

  const descriptionEl = document.querySelector("[data-app-description]");
  if (descriptionEl && window.ifactory.description) {
    descriptionEl.textContent = window.ifactory.description;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  scheduleReveals();
  hydrateAppMeta();
});
