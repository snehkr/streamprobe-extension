import { useState, useEffect } from 'react'
import { Activity, ShieldAlert, AlertCircle } from 'lucide-react'
import './App.css'

function App() {
  const [events, setEvents] = useState<any[]>([])
  const [autoSave, setAutoSave] = useState(false)

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'get_history' }, (response) => {
        if (response) {
          if (response.history) setEvents(response.history)
          if (response.autoSaveEnabled !== undefined) setAutoSave(response.autoSaveEnabled)
        }
      })

      const listener = (msg: any) => {
        if (msg.type === 'network_event_update' || msg.type === 'network_event') {
          setEvents(prev => {
            const newEvents = [...prev];
            const idx = newEvents.findIndex(e => e.requestId === msg.data.requestId);
            if (idx !== -1) newEvents[idx] = msg.data;
            else newEvents.push(msg.data);
            return newEvents.slice(-100);
          });
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, [])

  const toggleAutoSave = () => {
    const nextVal = !autoSave;
    setAutoSave(nextVal);
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'toggle_autosave', enabled: nextVal });
    }
  }

  const streams = events.filter(e => e.requestType === 'hls_manifest' || e.requestType === 'dash_manifest')
  const drmRequests = events.filter(e => e.requestType === 'drm_request' || e.requestType === 'drm_request_potential')

  return (
    <div className="bg-dark-900 text-white p-4 min-w-[350px] min-h-[400px]">
      <header className="mb-4 pb-2 border-b border-dark-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-500 to-primary-600">
            StreamProbe
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-gray-500">Auto-Save JSON</span>
            <button 
              onClick={toggleAutoSave}
              className={`w-6 h-3 rounded-full transition-colors relative ${autoSave ? 'bg-primary-500' : 'bg-dark-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-white transition-transform ${autoSave ? 'translate-x-3' : ''}`} />
            </button>
          </div>
        </div>
        <span className="text-xs bg-dark-800 px-2 py-1 rounded text-gray-400">
          {events.length} Events
        </span>
      </header>

      <div className="space-y-4">
        {/* Streams Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-2">
            <Activity size={16} className="text-primary-500" />
            Recent Streams
          </h2>
          {streams.length > 0 ? (
            <div className="space-y-2">
              {streams.slice(-3).reverse().map((stream, idx) => {
                let psshCount = 0;
                let vCount = 0;
                let aCount = 0;
                if (stream.parsedManifest && stream.parsedManifest.periods) {
                  stream.parsedManifest.periods.forEach((p: any) => {
                    p.adaptations?.forEach((a: any) => {
                      if (a.mimeType?.includes('video') || a.contentType === 'video') vCount++;
                      if (a.mimeType?.includes('audio') || a.contentType === 'audio') aCount++;
                      a.contentProtections?.forEach((cp: any) => {
                        if (cp.pssh) psshCount++;
                      });
                    });
                  });
                } else if (stream.parsedManifest && stream.parsedManifest.streams) {
                  vCount = stream.parsedManifest.streams.length;
                  stream.parsedManifest.keys?.forEach((k: any) => {
                    if (k.URI?.startsWith('data:')) psshCount++;
                  });
                }
                
                return (
                  <div key={idx} className="bg-dark-800 p-2 rounded border border-dark-700 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium text-primary-400">{stream.requestType === 'hls_manifest' ? 'HLS' : 'DASH'}</span>
                      <span className="text-gray-500">{new Date(stream.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="truncate text-gray-300 mb-1" title={stream.url}>{stream.url}</div>
                    {stream.parsedManifest && !stream.parsedManifest.error && (
                      <div className="text-[10px] text-gray-400 bg-dark-900 rounded p-1 flex gap-2">
                        <span>Video: {vCount}</span>
                        <span>Audio: {aCount}</span>
                        {psshCount > 0 && <span className="text-green-500">PSSH: {psshCount}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic bg-dark-800/50 p-2 rounded">No streams detected yet</div>
          )}
        </div>

        {/* DRM Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-2">
            <ShieldAlert size={16} className="text-accent-500" />
            Recent DRM Requests
          </h2>
          {drmRequests.length > 0 ? (
            <div className="space-y-2">
              {drmRequests.slice(-3).reverse().map((drm, idx) => {
                let drmType = 'Unknown DRM';
                const urlLower = drm.url.toLowerCase();
                if (urlLower.includes('widevine')) drmType = 'Widevine';
                else if (urlLower.includes('playready')) drmType = 'PlayReady';
                else if (urlLower.includes('fairplay')) drmType = 'FairPlay';

                return (
                  <div key={idx} className="bg-dark-800 p-2 rounded border border-dark-700 text-xs">
                     <div className="flex justify-between mb-1">
                      <span className="font-medium text-accent-400">{drmType}</span>
                      <span className="text-gray-500">{new Date(drm.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="truncate text-gray-300" title={drm.url}>{drm.url}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic bg-dark-800/50 p-2 rounded">No DRM requests detected yet</div>
          )}
        </div>
      </div>

      <div className="mt-6 text-center">
        <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
          <AlertCircle size={12} />
          Open DevTools (F12) for full analysis
        </p>
      </div>
    </div>
  )
}

export default App
