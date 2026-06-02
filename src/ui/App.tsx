import React, { useState, useEffect } from 'react';
import { Activity, ShieldAlert, Network, LayoutDashboard } from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import { StreamAnalysisTab } from './StreamAnalysisTab.tsx';
import { DRMAnalysisTab } from './DRMAnalysisTab.tsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [networkEvents, setNetworkEvents] = useState<any[]>([]);
  const [autoSave, setAutoSave] = useState(false);
  
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.devtools) {
      const port = chrome.runtime.connect({ name: "streamprobe-panel" });
      
      port.postMessage({
        name: "init",
        tabId: chrome.devtools.inspectedWindow.tabId
      });

      port.onMessage.addListener((msg) => {
        if (msg.type === 'network_event' || msg.type === 'network_event_update') {
          setNetworkEvents(prev => {
            const newEvents = [...prev];
            const idx = newEvents.findIndex(e => e.requestId === msg.data.requestId);
            if (idx !== -1) newEvents[idx] = msg.data;
            else newEvents.push(msg.data);
            return newEvents;
          });
        }
      });

      chrome.runtime.sendMessage({ type: 'get_history' }, (res) => {
        if (res) {
          if (res.autoSaveEnabled !== undefined) setAutoSave(res.autoSaveEnabled);
          if (res.history) setNetworkEvents(res.history);
        }
      });

      const navListener = () => {
        setNetworkEvents([]);
        chrome.runtime.sendMessage({ type: 'clear_history' });
      };
      chrome.devtools.network.onNavigated.addListener(navListener);

      const requestFinishedListener = (request: any) => {
        const urlLower = request.request.url.toLowerCase();
        let urlObj;
        try {
          urlObj = new URL(request.request.url);
        } catch {
          urlObj = { pathname: urlLower };
        }
        
        if (urlObj.pathname.endsWith('.m3u8') || urlObj.pathname.endsWith('.mpd')) {
          request.getContent((content: string, _encoding: string) => {
            if (content) {
              chrome.runtime.sendMessage({ 
                type: 'parse_manifest_from_devtools', 
                url: request.request.url,
                content: content 
              });
            }
          });
        }
      };
      chrome.devtools.network.onRequestFinished.addListener(requestFinishedListener);

      return () => {
        port.disconnect();
        chrome.devtools.network.onNavigated.removeListener(navListener);
        chrome.devtools.network.onRequestFinished.removeListener(requestFinishedListener);
      };
    }
  }, []);

  const toggleAutoSave = () => {
    const nextVal = !autoSave;
    setAutoSave(nextVal);
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'toggle_autosave', enabled: nextVal });
    }
  };

  const activeStreamsCount = networkEvents.filter(e => e.requestType === 'hls_manifest' || e.requestType === 'dash_manifest').length;
  const drmRequestsCount = networkEvents.filter(e => e.requestType === 'drm_request').length;
  const segmentEvents = networkEvents.filter(e => e.requestType === 'media_segment');
  const segmentErrorsCount = segmentEvents.filter(e => e.statusCode >= 400).length;

  return (
    <div className="flex h-screen bg-dark-900 text-white overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-16 bg-dark-800 flex flex-col items-center py-4 border-r border-dark-700">
        <div className="text-primary-500 mb-8 font-bold text-xl cursor-default" title="StreamProbe">SP</div>
        
        <nav className="flex flex-col gap-4">
          <NavIcon 
            icon={<LayoutDashboard size={20} />} 
            isActive={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            title="Dashboard" 
          />
          <NavIcon 
            icon={<Activity size={20} />} 
            isActive={activeTab === 'streams'} 
            onClick={() => setActiveTab('streams')} 
            title="Stream Analysis" 
          />
          <NavIcon 
            icon={<ShieldAlert size={20} />} 
            isActive={activeTab === 'drm'} 
            onClick={() => setActiveTab('drm')} 
            title="DRM Analysis" 
          />
          <NavIcon 
            icon={<Network size={20} />} 
            isActive={activeTab === 'network'} 
            onClick={() => setActiveTab('network')} 
            title="Network" 
          />
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 overflow-y-auto">
        <header className="mb-6 flex justify-between items-center pb-4 border-b border-dark-800">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-500 to-primary-600">
              StreamProbe
            </h1>
            <p className="text-sm text-gray-400">Advanced OTT Debugging Platform</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 mr-2">
              <span className="text-xs text-gray-400">Auto-Save JSON</span>
              <button 
                onClick={toggleAutoSave}
                className={`w-8 h-4 rounded-full transition-colors relative ${autoSave ? 'bg-primary-500' : 'bg-dark-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${autoSave ? 'translate-x-4' : ''}`} />
              </button>
            </div>
            <button 
              onClick={() => {
                setNetworkEvents([]);
                if (typeof chrome !== 'undefined' && chrome.runtime) {
                  chrome.runtime.sendMessage({ type: 'clear_history' });
                }
              }}
              className="text-xs bg-dark-800 hover:bg-dark-700 px-3 py-1 rounded border border-dark-600 transition-colors cursor-pointer text-accent-500 hover:text-accent-400"
            >
              Clear
            </button>
            <button 
              onClick={() => {
                const blob = new Blob([JSON.stringify(networkEvents, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `streamprobe-export-${new Date().toISOString()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-xs bg-dark-800 hover:bg-dark-700 px-3 py-1 rounded border border-dark-600 transition-colors cursor-pointer"
            >
              Export JSON
            </button>
            <span className="flex items-center gap-2 text-xs bg-dark-800 px-3 py-1 rounded-full border border-dark-700">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Recording
            </span>
          </div>
        </header>
        
        {/* Content based on tab */}
        <div className="h-full pb-20 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === 'dashboard' && <DashboardTab activeStreams={activeStreamsCount} drmRequests={drmRequestsCount} events={networkEvents} segmentErrors={segmentErrorsCount} totalSegments={segmentEvents.length} />}
              {activeTab === 'streams' && <StreamAnalysisTab events={networkEvents} />}
              {activeTab === 'drm' && <DRMAnalysisTab events={networkEvents} />}
              {activeTab === 'network' && <NetworkTab events={networkEvents} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavIcon({ icon, isActive, onClick, title }: { icon: React.ReactNode, isActive: boolean, onClick: () => void, title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-3 rounded-xl transition-all duration-200 ${
        isActive 
          ? 'bg-primary-500/10 text-primary-500 border border-primary-500/20 shadow-[0_0_15px_rgba(0,242,254,0.15)]' 
          : 'text-gray-400 hover:text-white hover:bg-dark-700'
      }`}
    >
      {icon}
    </button>
  );
}

function NetworkTab({ events }: { events: any[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replayData, setReplayData] = useState<Record<string, string>>({});

  const handleReplay = async (evt: any) => {
    try {
      const headers: Record<string, string> = {};
      if (evt.requestHeaders) {
        evt.requestHeaders.forEach((h: any) => {
          // Exclude unsafe headers
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
    }
  };

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden h-full flex flex-col">
       <div className="overflow-y-auto flex-1">
         <table className="w-full text-left text-sm">
           <thead className="bg-dark-700 text-gray-400 sticky top-0 shadow-sm z-10">
             <tr>
               <th className="px-4 py-2">Timestamp</th>
               <th className="px-4 py-2">Type</th>
               <th className="px-4 py-2">Method</th>
               <th className="px-4 py-2">Status</th>
               <th className="px-4 py-2 w-1/2">URL</th>
               <th className="px-4 py-2 text-right">Actions</th>
             </tr>
           </thead>
           <tbody>
             {events.slice().reverse().map((evt) => (
               <React.Fragment key={evt.requestId}>
                 <tr 
                   className={`border-b border-dark-700 hover:bg-dark-700/50 transition-colors cursor-pointer ${expandedId === evt.requestId ? 'bg-dark-700/30' : ''}`}
                   onClick={() => setExpandedId(expandedId === evt.requestId ? null : evt.requestId)}
                 >
                   <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{new Date(evt.timestamp).toLocaleTimeString()}</td>
                   <td className="px-4 py-2">
                     <span className={`px-2 py-1 rounded text-xs whitespace-nowrap ${evt.requestType === 'drm_request_potential' ? 'bg-accent-500/20 text-accent-500' : 'bg-primary-500/20 text-primary-500'}`}>
                       {evt.requestType}
                     </span>
                   </td>
                   <td className="px-4 py-2">{evt.method}</td>
                   <td className={`px-4 py-2 ${evt.statusCode >= 400 ? 'text-accent-500' : ''}`}>{evt.statusCode || 'N/A'}</td>
                   <td className="px-4 py-2 truncate max-w-[300px]" title={evt.url}>{evt.url}</td>
                   <td className="px-4 py-2 text-right">
                     <button 
                       onClick={(e) => { e.stopPropagation(); handleReplay(evt); setExpandedId(evt.requestId); }}
                       className="text-[10px] bg-primary-600 hover:bg-primary-500 text-white px-2 py-1 rounded transition-colors mr-2"
                     >
                       Replay
                     </button>
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         navigator.clipboard.writeText(JSON.stringify(evt, null, 2));
                       }}
                       className="text-[10px] bg-dark-700 hover:bg-dark-600 px-2 py-1 rounded transition-colors"
                     >
                       Copy
                     </button>
                   </td>
                 </tr>
                 {expandedId === evt.requestId && (
                   <tr className="bg-dark-900 border-b border-dark-700">
                     <td colSpan={6} className="p-4">
                       <div className="grid grid-cols-2 gap-4">
                         <div>
                           <h4 className="text-xs text-gray-400 font-medium mb-2">Request Headers</h4>
                           <div className="bg-dark-800 p-2 rounded text-xs overflow-x-auto max-h-40 overflow-y-auto border border-dark-700">
                             {evt.requestHeaders?.map((h: any, i: number) => <div key={i}><span className="text-primary-500">{h.name}:</span> {h.value}</div>)}
                             {!evt.requestHeaders?.length && <span className="text-gray-500">No headers captured</span>}
                           </div>
                         </div>
                         <div>
                           <h4 className="text-xs text-gray-400 font-medium mb-2">Response Headers</h4>
                           <div className="bg-dark-800 p-2 rounded text-xs overflow-x-auto max-h-40 overflow-y-auto border border-dark-700">
                             {evt.responseHeaders?.map((h: any, i: number) => <div key={i}><span className="text-primary-500">{h.name}:</span> {h.value}</div>)}
                             {!evt.responseHeaders?.length && <span className="text-gray-500">No headers captured</span>}
                           </div>
                         </div>
                         {evt.requestBody && (
                           <div className="col-span-2">
                             <h4 className="text-xs text-gray-400 font-medium mb-2">Request Body (Base64)</h4>
                             <div className="bg-dark-800 p-2 rounded text-xs overflow-x-auto break-all border border-dark-700 text-gray-300">
                               {evt.requestBody}
                             </div>
                           </div>
                         )}
                         {replayData[evt.requestId] && (
                           <div className="col-span-2 mt-2">
                             <div className="flex justify-between items-center mb-2">
                               <h4 className="text-xs text-accent-500 font-medium">Replay Response Payload</h4>
                               <button onClick={() => setReplayData(prev => { const n = {...prev}; delete n[evt.requestId]; return n; })} className="text-[10px] text-gray-400 hover:text-white">Clear</button>
                             </div>
                             <div className="bg-dark-800 p-2 rounded text-xs overflow-x-auto max-h-60 overflow-y-auto border border-accent-500/30 text-gray-300 whitespace-pre-wrap">
                               {replayData[evt.requestId]}
                             </div>
                           </div>
                         )}
                       </div>
                     </td>
                   </tr>
                 )}
               </React.Fragment>
             ))}
             {events.length === 0 && (
               <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No requests intercepted yet.</td></tr>
             )}
           </tbody>
         </table>
       </div>
    </div>
  );
}

function DashboardTab({ activeStreams, drmRequests, events, segmentErrors, totalSegments }: { activeStreams: number, drmRequests: number, events: any[], segmentErrors: number, totalSegments: number }) {
  const latestManifest = [...events].reverse().find(e => e.requestType === 'hls_manifest' || e.requestType === 'dash_manifest');
  const healthScore = totalSegments === 0 ? 100 : Math.max(0, 100 - (segmentErrors / totalSegments) * 100);

  return (
    <div className="grid grid-cols-12 gap-6 h-full pb-20">
      {/* Overview Cards */}
      <div className="col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Streams" value={activeStreams.toString()} />
        <StatCard title="Segments Loaded" value={totalSegments.toString()} />
        <StatCard title="DRM Requests" value={drmRequests.toString()} />
        <StatCard title="Segment Errors" value={segmentErrors.toString()} alert={segmentErrors > 0} />
      </div>
      
      {/* Main Charts Area */}
      <div className="col-span-12 lg:col-span-8 bg-dark-800 border border-dark-700 rounded-xl p-4 min-h-[300px]">
        <h3 className="text-sm text-gray-400 font-medium mb-4">Stream Health Score</h3>
        <div className="w-full h-full flex flex-col items-center justify-center pt-8 pb-12">
          <div className="relative flex items-center justify-center w-48 h-48 rounded-full border-8 border-dark-700">
            <div className={`absolute inset-0 rounded-full border-8 ${healthScore > 90 ? 'border-green-500' : healthScore > 70 ? 'border-yellow-500' : 'border-accent-500'}`} style={{ clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)' }}></div>
            <div className="text-center">
              <div className={`text-4xl font-bold ${healthScore > 90 ? 'text-green-500' : healthScore > 70 ? 'text-yellow-500' : 'text-accent-500'}`}>{healthScore.toFixed(0)}%</div>
              <div className="text-xs text-gray-400 mt-1">Health</div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="col-span-12 lg:col-span-4 bg-dark-800 border border-dark-700 rounded-xl p-4 min-h-[300px]">
        <h3 className="text-sm text-gray-400 font-medium mb-4">Stream Properties</h3>
        {latestManifest ? (
          <div className="text-sm text-gray-300 break-words">
            <p><strong className="text-white">Type:</strong> {latestManifest.requestType === 'hls_manifest' ? 'HLS' : 'DASH'}</p>
            <p className="mt-2"><strong className="text-white">Manifest URL:</strong></p>
            <p className="bg-dark-900 p-2 rounded mt-1 text-[10px] border border-dark-700 text-gray-400">{latestManifest.url}</p>
            
            {latestManifest.parsedManifest?.isLive !== undefined && (
              <p className="mt-4"><strong className="text-white">Live:</strong> {latestManifest.parsedManifest.isLive ? 'Yes' : 'VOD'}</p>
            )}
            {latestManifest.parsedManifest?.targetDuration && (
              <p className="mt-2"><strong className="text-white">Target Duration:</strong> {latestManifest.parsedManifest.targetDuration}s</p>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-dark-600 border border-dashed border-dark-600 rounded-lg">
            No active stream detected
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, alert = false }: { title: string, value: string | number, alert?: boolean }) {
  return (
    <div className={`bg-dark-800 border rounded-xl p-4 ${alert ? 'border-accent-500/30' : 'border-dark-700'}`}>
      <h4 className="text-xs text-gray-400 mb-1">{title}</h4>
      <div className={`text-2xl font-mono ${alert ? 'text-accent-500' : 'text-white'}`}>{value}</div>
    </div>
  );
}
