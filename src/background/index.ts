/// <reference types="chrome"/>

console.log("StreamProbe Background Worker Initialized");

// Listen for network requests matching typical manifest and segment extensions
const FILTER = {
  urls: ["<all_urls>"]
};

// Connections from DevTools panels
const connections: Record<number, chrome.runtime.Port> = {};

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "streamprobe-panel") {
    console.log("Panel connected");
    let extensionListener = (message: any) => {
      // The original connection event doesn't include the tab ID of the
      // DevTools page, so we need to send it explicitly.
      if (message.name === "init") {
        connections[message.tabId] = port;
        console.log("Initialized connection for tab", message.tabId);
        return;
      }
    };

    port.onMessage.addListener(extensionListener);

    port.onDisconnect.addListener((p) => {
      p.onMessage.removeListener(extensionListener);
      
      const tabs = Object.keys(connections);
      for (let i=0, len=tabs.length; i < len; i++) {
        if (connections[parseInt(tabs[i])] === p) {
          delete connections[parseInt(tabs[i])];
          break;
        }
      }
    });
  }
});

function broadcastGlobal(tabId: number, message: any) {
  if (tabId && tabId in connections) {
    connections[tabId].postMessage(message);
  } else if (!tabId) {
    Object.values(connections).forEach(port => port.postMessage(message));
  }
  chrome.runtime.sendMessage(message).catch(() => {});
}

// Keep a history of intercepted requests for the popup
const requestHistory: any[] = [];
const MAX_HISTORY = 100;
let autoSaveEnabled = false;

chrome.storage.local.get(['autoSaveJSON'], (res) => {
  autoSaveEnabled = !!res.autoSaveJSON;
});

function triggerAutoSave() {
  if (autoSaveEnabled) {
    chrome.storage.local.set({ streamprobe_history: requestHistory });
  }
}

function addToHistory(req: any) {
  requestHistory.push(req);
  if (requestHistory.length > MAX_HISTORY) {
    requestHistory.shift();
  }
  triggerAutoSave();
}

// Add message listener for popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'get_history') {
    sendResponse({ history: requestHistory, autoSaveEnabled });
  } else if (message.type === 'toggle_autosave') {
    autoSaveEnabled = message.enabled;
    chrome.storage.local.set({ autoSaveJSON: autoSaveEnabled });
    if (autoSaveEnabled) triggerAutoSave();
    sendResponse({ success: true });
  } else if (message.type === 'clear_history') {
    requestHistory.length = 0;
    activeRequests.clear();
    triggerAutoSave();
    sendResponse({ success: true });
  } else if (message.type === 'mark_as_drm') {
    const { requestId } = message;
    const req = requestHistory.find(r => r.requestId === requestId);
    if (req) {
      req.requestType = 'drm_request';
      triggerAutoSave();
      broadcastGlobal(0, { type: 'network_event_update', data: req });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
  } else if (message.type === 'parse_manifest_from_devtools') {
    const { url, content } = message;
    const req = requestHistory.find(r => r.url === url && (r.requestType === 'hls_manifest' || r.requestType === 'dash_manifest'));
    if (req) {
      try {
        if (req.requestType === 'hls_manifest') {
          req.parsedManifest = parseM3U8(content, url);
        } else {
          req.parsedManifest = parseMPD(content);
        }
      } catch (e: any) {
        req.parsedManifest = { error: `Failed to parse from DevTools: ${e.message}` };
      }
      triggerAutoSave();
      broadcastGlobal(0, { type: 'network_event_update', data: req });
    }
    sendResponse({ success: true });
  }
  return true;
});

// Request lifecycle tracker
const activeRequests = new Map<string, any>();

// Helper to convert ArrayBuffer to Base64
function bufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// 1. Capture URL, Method, and Request Body
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return {};

    let bodyData = null;
    if (details.requestBody && details.requestBody.raw && details.requestBody.raw.length > 0) {
      if (details.requestBody.raw[0].bytes) {
        bodyData = bufferToBase64(details.requestBody.raw[0].bytes);
      }
    } else if (details.requestBody && details.requestBody.formData) {
      bodyData = JSON.stringify(details.requestBody.formData);
    }

    activeRequests.set(details.requestId, {
      requestId: details.requestId,
      url: details.url,
      method: details.method,
      timestamp: details.timeStamp,
      requestBody: bodyData,
      requestHeaders: [],
      responseHeaders: []
    });

    return {};
  },
  FILTER,
  ['requestBody']
);

// 2. Capture Request Headers
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const req = activeRequests.get(details.requestId);
    if (req) {
      req.requestHeaders = details.requestHeaders || [];
    }
    return {};
  },
  FILTER,
  ['requestHeaders']
);

// 3. Capture Response Headers
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const req = activeRequests.get(details.requestId);
    if (req) {
      req.responseHeaders = details.responseHeaders || [];
      req.statusCode = details.statusCode;
    }
    return {};
  },
  FILTER,
  ['responseHeaders']
);

// 4. Finalize and dispatch
import { parseM3U8 } from '../parsers/m3u8.ts';
import { parseMPD } from '../parsers/mpd.ts';

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;
    
    const req = activeRequests.get(details.requestId);
    if (!req) return; // if we didn't catch the start, ignore

    // Clean up
    activeRequests.delete(details.requestId);

    const urlLower = details.url.toLowerCase();
    let urlObj;
    try {
      urlObj = new URL(details.url);
    } catch {
      urlObj = { pathname: urlLower };
    }
    const pathname = urlObj.pathname.toLowerCase();
    let type = null;
    
    if (pathname.endsWith('.m3u8')) {
      type = 'hls_manifest';
    } else if (pathname.endsWith('.mpd')) {
      type = 'dash_manifest';
    } else if (
      urlLower.includes('widevine') || 
      urlLower.includes('playready') || 
      urlLower.includes('fairplay') ||
      urlLower.includes('drm') ||
      urlLower.includes('license') ||
      urlLower.includes('acquire') ||
      urlLower.includes('rightsmanager') ||
      urlLower.includes('getlicense') ||
      urlLower.includes('cenc') ||
      urlLower.match(/\/key(s|\/|$|\?)/)
    ) {
      type = 'drm_request';
    } else if (pathname.endsWith('.ts') || pathname.endsWith('.m4s') || pathname.endsWith('.mp4') || pathname.endsWith('.cmfv') || pathname.endsWith('.cmfa')) {
      type = 'media_segment'; 
    } else if (req.method === 'POST') {
      // Fallback: Unknown POST requests are often license requests in custom setups
      type = 'drm_request_potential';
    }

    if (type) {
      req.requestType = type;
      addToHistory(req);
      
      if (type !== 'media_segment') {
        console.log(`Detected ${type}:`, details.url);
      }

      if (type === 'hls_manifest' || type === 'dash_manifest') {
        const headers: Record<string, string> = {};
        if (req.requestHeaders) {
          req.requestHeaders.forEach((h: any) => {
            if (!['origin', 'referer', 'user-agent', 'sec-ch-ua', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest', 'cookie'].includes(h.name.toLowerCase())) {
              headers[h.name] = h.value;
            }
          });
        }
        
        fetch(details.url, { headers, credentials: 'include' })
          .then(async res => {
            const content = await res.text();
            if (!res.ok) {
              throw new Error(`HTTP ${res.status} ${res.statusText}`);
            }
            return content;
          })
          .then(content => {
            if (req.parsedManifest && !req.parsedManifest.error) {
              return; // Already parsed successfully by DevTools!
            }
            try {
              if (type === 'hls_manifest') {
                req.parsedManifest = parseM3U8(content, details.url);
              } else {
                req.parsedManifest = parseMPD(content);
              }
            } catch (e: any) {
              console.error('Failed to parse manifest', e);
              req.parsedManifest = { error: `Failed to parse: ${e.message}` };
            }
            // Update history with parsed manifest
            const idx = requestHistory.findIndex(r => r.requestId === req.requestId);
            if (idx !== -1) requestHistory[idx] = req;
            triggerAutoSave();
            broadcastGlobal(details.tabId, { type: 'network_event_update', data: req });
          })
          .catch(err => {
            console.error('Failed to fetch manifest for parsing', err);
            // Only overwrite if it hasn't been successfully parsed by DevTools already
            if (!req.parsedManifest || req.parsedManifest.error) {
              req.parsedManifest = { error: `Failed to fetch: ${err.message}` };
              const idx = requestHistory.findIndex(r => r.requestId === req.requestId);
              if (idx !== -1) requestHistory[idx] = req;
              triggerAutoSave();
              broadcastGlobal(details.tabId, { type: 'network_event_update', data: req });
            }
          });
      } else {
        broadcastGlobal(details.tabId, { type: 'network_event', data: req });
      }
    }
  },
  FILTER
);
