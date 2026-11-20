const settingsDialog = document.getElementById("settings-dialog");
const reduceMotionToggle = document.getElementById("setting-motion");
const highContrastToggle = document.getElementById("setting-contrast");

document.getElementById("settings-open").addEventListener("click", () => {
  settingsDialog.showModal();
});

for (const [toggle, setting, className] of [
  [reduceMotionToggle, "apex-reduce-motion", "reduce-motion"],
  [highContrastToggle, "apex-high-contrast", "high-contrast"]
]) {
  toggle.checked = localStorage.getItem(setting) === "true";
  document.body.classList.toggle(className, toggle.checked);
  toggle.addEventListener("change", () => {
    localStorage.setItem(setting, String(toggle.checked));
    document.body.classList.toggle(className, toggle.checked);
  });
}

settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});

const navigationLinks = [...document.querySelectorAll('.main-nav a[href^="#"]')];
const observedSections = navigationLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of navigationLinks) {
        const selected = link.hash === `#${entry.target.id}`;
        link.classList.toggle("active", selected);
        if (selected) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    }
  }, { rootMargin: "-25% 0px -65% 0px" });
  observedSections.forEach((section) => observer.observe(section));
}

