const loaderScreen = document.querySelector(".loader-screen");

if (loaderScreen) {
  document.body.classList.add("loading");
}

setTimeout(() => {
  loaderScreen?.classList.add("hidden");
  document.body.classList.remove("loading");
  document.querySelectorAll(".hero__title .highlight-wrap").forEach((el, index) => {
    el.style.setProperty("--highlight-delay", `${index * 180}ms`);
    el.classList.add("animate");
  });
}, 3800);
