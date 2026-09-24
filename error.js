document.getElementById("msg").textContent =
  decodeURIComponent(location.hash.slice(1)) || "(no message)";
