import { useState } from 'react';
import { ShieldAlert, ShieldCheck, CheckCircle } from 'lucide-react';

export function DRMAnalysisTab({ events }: { events: any[] }) {
  const drmEvents = events.filter(e => e.requestType === 'drm_request' || e.requestType === 'drm_request_potential');
  const postEvents = events.filter(e => e.method.toUpperCase() === 'POST' && e.requestType !== 'drm_request');
  
  const [selectedPost, setSelectedPost] = useState<string>('');
  const [overrideStatus, setOverrideStatus] = useState<string>('');
  const [replayData, setReplayData] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  const psshBoxes: { url: string, pssh: string, type: string }[] = [];
  events.filter(e => e.parsedManifest).forEach(e => {
    if (e.requestType === 'dash_manifest' && e.parsedManifest.periods) {
      e.parsedManifest.periods.forEach((p: any) => {
        p.adaptations?.forEach((a: any) => {
          a.contentProtections?.forEach((cp: any) => {
            if (cp.pssh) {
              if (!psshBoxes.find(b => b.pssh === cp.pssh)) {
                psshBoxes.push({
                  url: e.url,
                  pssh: cp.pssh,
                  type: 'Widevine/PlayReady (CENC DASH)'
                });
              }
            }
          });
        });
      });
    } else if (e.requestType === 'hls_manifest' && e.parsedManifest.keys) {
      e.parsedManifest.keys.forEach((k: any) => {
        if (k.URI && k.URI.startsWith('data:text/plain;base64,')) {
          const pssh = k.URI.split(',')[1];
          if (pssh && !psshBoxes.find(b => b.pssh === pssh)) {
            psshBoxes.push({
              url: e.url,
              pssh: pssh,
              type: 'Widevine/PlayReady (CENC HLS)'
            });
          }
        }
      });
    }
  });

  const handleReplay = async (evt: any) => {
    setIsLoading(prev => ({ ...prev, [evt.requestId]: true }));
    try {
      const headers: Record<string, string> = {};
      if (evt.requestHeaders) {
        evt.requestHeaders.forEach((h: any) => {
          if (!['origin', 'referer', 'user-agent', 'sec-ch-ua', 'sec-fetch-mode'].includes(h.name.toLowerCase())) {
            headers[h.name] = h.value;
          }
        });
      }

      let body = undefined;
      if (evt.requestBody && evt.method === 'POST') {
        try {
          body = Uint8Array.from(atob(evt.requestBody), c => c.charCodeAt(0));
        } catch {
          body = evt.requestBody;
        }
      }

      const res = await fetch(evt.url, { method: evt.method, headers, body, credentials: 'include' });
      const text = await res.text();
      setReplayData(prev => ({ ...prev, [evt.requestId]: text }));
    } catch (err: any) {
      setReplayData(prev => ({ ...prev, [evt.requestId]: `Error: ${err.message}` }));
    } finally {
      setIsLoading(prev => ({ ...prev, [evt.requestId]: false }));
    }
  };

  const handleOverride = () => {
    if (!selectedPost) return;
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'mark_as_drm', requestId: selectedPost }, (res) => {
        if (res?.success) {
          setOverrideStatus('Successfully marked as DRM request!');
          setTimeout(() => setOverrideStatus(''), 3000);
          setSelectedPost('');
        }
      });
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-full pb-20">
      <div className="col-span-12 lg:col-span-8 bg-dark-800 border border-dark-700 rounded-xl p-4 overflow-y-auto">
        <h3 className="text-sm text-gray-400 font-medium mb-4">DRM License Requests</h3>
        
        {drmEvents.length > 0 ? (
          <div className="space-y-4">
            {drmEvents.slice().reverse().map((evt, i) => (
              <div key={i} className="bg-dark-900 border border-dark-700 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <ShieldAlert className="text-accent-500" size={20} />
                  <span className="font-medium text-white break-all">{evt.url}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs">
                  <div>
                    <span className="text-gray-500 block">Method</span>
                    <span className="text-white">{evt.method}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Status</span>
                    <span className={`${evt.statusCode >= 400 ? 'text-accent-500' : 'text-green-500'}`}>
                      {evt.statusCode || 'Pending'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Time</span>
                    <span className="text-white">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Probable DRM</span>
                    <span className="text-primary-500">
                      {evt.url.toLowerCase().includes('widevine') ? 'Widevine' : 
                       evt.url.toLowerCase().includes('playready') ? 'PlayReady' : 
                       evt.url.toLowerCase().includes('fairplay') ? 'FairPlay' : 'Unknown'}
                    </span>
                  </div>
                </div>
                <div className="mt-4">
                  <button 
                    onClick={() => handleReplay(evt)}
                    disabled={isLoading[evt.requestId]}
                    className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded transition-colors"
                  >
                    {isLoading[evt.requestId] ? 'Fetching...' : 'Fetch Response Payload'}
                  </button>
                </div>

                {replayData[evt.requestId] && (
                  <div className="mt-4 bg-dark-800 p-2 rounded text-xs border border-dark-700">
                    <div className="flex justify-between items-center mb-1">
                      <h4 className="text-primary-400 font-medium">Response Payload</h4>
                      <button onClick={() => setReplayData(prev => { const n = {...prev}; delete n[evt.requestId]; return n; })} className="text-[10px] text-gray-400 hover:text-white">Clear</button>
                    </div>
                    <div className="text-gray-300 break-all max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[10px]">
                      {replayData[evt.requestId]}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="h-[300px] flex flex-col items-center justify-center text-gray-500">
            <ShieldCheck size={48} className="mb-4 opacity-20" />
            <p>No DRM license requests intercepted yet.</p>
          </div>
        )}
      </div>

      <div className="col-span-12 lg:col-span-4 space-y-6">
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
          <h3 className="text-sm text-gray-400 font-medium mb-4">Manual DRM Override</h3>
          <p className="text-xs text-gray-500 mb-4">
            If auto-detection missed a DRM license URL, select a recent POST request below to manually mark it and fetch its response.
          </p>
          <div className="flex flex-col gap-3">
            <select 
              className="bg-dark-900 border border-dark-700 text-xs text-white p-2 rounded outline-none focus:border-primary-500"
              value={selectedPost}
              onChange={(e) => setSelectedPost(e.target.value)}
            >
              <option value="">-- Select a POST request --</option>
              {postEvents.slice().reverse().map(evt => (
                <option key={evt.requestId} value={evt.requestId}>
                  {new Date(evt.timestamp).toLocaleTimeString()} - {evt.url.substring(0, 40)}{evt.url.length > 40 ? '...' : ''}
                </option>
              ))}
            </select>
            <button 
              onClick={handleOverride}
              disabled={!selectedPost}
              className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs py-2 rounded transition-colors"
            >
              Mark as DRM License URL
            </button>
            {overrideStatus && (
              <div className="text-xs text-green-500 flex items-center gap-1 mt-1">
                <CheckCircle size={12} /> {overrideStatus}
              </div>
            )}
          </div>
        </div>

        <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
          <h3 className="text-sm text-gray-400 font-medium mb-4">Detected PSSH Boxes</h3>
          <p className="text-xs text-gray-500 italic mb-4">
            PSSH extraction requires parsing media segments or looking into manifest files. 
            Check Stream Analysis tab for parsed manifest data which may contain PSSH.
          </p>
          {psshBoxes.length > 0 ? (
            <div className="space-y-3">
              {psshBoxes.map((box, idx) => (
                <div key={idx} className="border border-dark-600 rounded-lg p-3 bg-dark-900">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] text-primary-500 font-medium">{box.type}</span>
                    <button 
                      onClick={() => navigator.clipboard.writeText(box.pssh)}
                      className="text-[10px] text-gray-400 hover:text-white"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="text-xs text-gray-300 font-mono break-all max-h-32 overflow-y-auto whitespace-pre-wrap selection:bg-primary-500/30">
                    {box.pssh}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-dark-600 rounded-lg p-8 text-center text-dark-600">
              No PSSH boxes extracted.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
