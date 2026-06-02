import logoPath from '../assets/logo.png';

chrome.devtools.panels.create(
  "StreamProbe",
  logoPath,
  "panel.html",
  (panel) => {
    console.log("StreamProbe panel created", panel);
  }
);
