chrome.runtime.sendMessage({ type: "POPUP_STATE" }).then((s) => {
  if (s?.focusActive) document.getElementById("left").textContent = `${s.minutesLeft} minute${s.minutesLeft === 1 ? "" : "s"} left in this session.`;
});
document.getElementById("today").addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_APP", path: "today" }));
document.getElementById("back").addEventListener("click", () => (history.length > 1 ? history.back() : window.close()));
