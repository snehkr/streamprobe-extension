import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function StreamAnalysisTab({ events }: { events: any[] }) {
  const manifests = events.filter(e => e.requestType === 'hls_manifest' || e.requestType === 'dash_manifest');
  
  // Mock bitrate data over time for demonstration
  const mockData = Array.from({ length: 20 }).map((_, i) => ({
    time: i,
    bitrate: Math.random() * 5 + 2 // 2 to 7 Mbps
  }));

  return (
    <div className="grid grid-cols-12 gap-6 h-full pb-20">
      <div className="col-span-12 lg:col-span-7 space-y-6">
        {/* Bitrate Chart */}
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 h-[300px]">
          <h3 className="text-sm text-gray-400 font-medium mb-4">Estimated Bitrate</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mockData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="time" stroke="#666" />
              <YAxis stroke="#666" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                itemStyle={{ color: '#00f2fe' }}
              />
              <Line type="monotone" dataKey="bitrate" stroke="#00f2fe" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Video Information */}
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
          <h3 className="text-sm text-gray-400 font-medium mb-4">Active Playback Info</h3>
          {manifests.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-500 text-xs">Current URL</span>
                <p className="text-sm truncate" title={manifests[manifests.length - 1].url}>
                  {manifests[manifests.length - 1].url}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Protocol</span>
                <p className="text-sm">{manifests[manifests.length - 1].requestType}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No playback info available.</p>
          )}
        </div>
      </div>

      {/* Manifest Explorer */}
      <div className="col-span-12 lg:col-span-5 bg-dark-800 border border-dark-700 rounded-xl p-4 flex flex-col h-full max-h-[600px]">
        <h3 className="text-sm text-gray-400 font-medium mb-4">Manifest Explorer</h3>
        <div className="flex-1 overflow-y-auto pr-2">
          {manifests.length > 0 ? (
            <div className="space-y-4">
              {manifests.slice().reverse().map((m, i) => (
                <div key={i} className="bg-dark-900 border border-dark-700 rounded-lg p-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs bg-primary-500/20 text-primary-500 px-2 py-1 rounded">
                      {m.requestType === 'hls_manifest' ? 'HLS' : 'DASH'}
                    </span>
                    <span className="text-xs text-gray-500">{new Date(m.timestamp).toLocaleTimeString()}</span>
                  </div>
                  
                  {m.parsedManifest ? (
                    <div className="mt-3">
                      {m.parsedManifest.error ? (
                        <p className="text-xs text-accent-500">{m.parsedManifest.error}</p>
                      ) : (
                        <>
                          <div className="space-y-2 mb-3">
                            <div className="flex flex-wrap gap-3 text-xs text-gray-300">
                              <div><span className="text-gray-500">Type:</span> {m.parsedManifest.type}</div>
                              {m.parsedManifest.duration && <div><span className="text-gray-500">Duration:</span> {m.parsedManifest.duration}</div>}
                              <div><span className="text-gray-500">DRM:</span> {m.parsedManifest.hasDRM ? <span className="text-accent-500">Yes</span> : 'No'}</div>
                            </div>
                            
                            {m.parsedManifest.periods?.map((p: any, pIdx: number) => (
                              <div key={pIdx} className="border border-dark-600 rounded bg-dark-800 p-2">
                                <h4 className="text-[10px] font-bold text-gray-400 mb-2 uppercase">Period {p.id || pIdx + 1}</h4>
                                <div className="space-y-2">
                                  {p.adaptations?.map((a: any, aIdx: number) => {
                                     const type = a.contentType || (a.mimeType?.includes('video') ? 'video' : a.mimeType?.includes('audio') ? 'audio' : 'text');
                                     return (
                                       <div key={aIdx} className="bg-dark-900 rounded p-2 text-xs border border-dark-700">
                                         <div className="font-medium text-primary-400 mb-1">{type.toUpperCase()} Track {a.mimeType ? <span className="text-gray-500 text-[10px]">({a.mimeType})</span> : ''}</div>
                                         <div className="flex flex-wrap gap-2 mb-2">
                                           {a.representations?.map((r: any, rIdx: number) => (
                                             <span key={rIdx} className="bg-dark-800 border border-dark-700 px-2 py-1 rounded text-[10px] text-gray-300">
                                               {r.width && r.height ? <span className="text-white">{r.width}x{r.height} </span> : ''}
                                               {r.bandwidth > 0 ? `${Math.round(r.bandwidth / 1000)} kbps` : ''}
                                               {r.codecs && <span className="text-gray-500 ml-1">[{r.codecs}]</span>}
                                             </span>
                                           ))}
                                         </div>
                                         {a.contentProtections?.length > 0 && (
                                           <div className="border-t border-dark-700 pt-2 mt-2">
                                             <div className="text-[10px] text-accent-500 mb-1 font-medium">Content Protection</div>
                                             {a.contentProtections.map((cp: any, cpIdx: number) => (
                                               <div key={cpIdx} className="text-[10px] text-gray-400 flex justify-between items-center bg-dark-800 px-2 py-1 rounded mb-1">
                                                 <span>
                                                   <span className="text-white">{cp.value || 'Unknown'}</span> 
                                                   {cp.schemeIdUri ? ` (${cp.schemeIdUri.split(':').pop()})` : ''}
                                                 </span>
                                                 {cp.pssh && <span className="text-green-500 bg-green-500/10 px-1 rounded">Has PSSH</span>}
                                               </div>
                                             ))}
                                           </div>
                                         )}
                                       </div>
                                     );
                                  })}
                                </div>
                              </div>
                            ))}

                            {m.parsedManifest.streams?.length > 0 && (
                              <div className="border border-dark-600 rounded bg-dark-800 p-2">
                                <h4 className="text-[10px] font-bold text-gray-400 mb-2 uppercase">HLS Streams</h4>
                                <div className="space-y-2">
                                  {m.parsedManifest.streams.map((s: any, sIdx: number) => (
                                    <div key={sIdx} className="bg-dark-900 rounded p-2 text-xs border border-dark-700">
                                      <div className="flex flex-wrap gap-2">
                                        <span className="bg-dark-800 border border-dark-700 px-2 py-1 rounded text-[10px] text-gray-300">
                                          {s.resolution ? <span className="text-white">{s.resolution} </span> : ''}
                                          {s.bandwidth > 0 ? `${Math.round(s.bandwidth / 1000)} kbps` : ''}
                                          {s.codecs && <span className="text-gray-500 ml-1">[{s.codecs}]</span>}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {m.parsedManifest.keys?.length > 0 && (
                              <div className="border border-dark-600 rounded bg-dark-800 p-2 mt-2">
                                <h4 className="text-[10px] font-bold text-gray-400 mb-2 uppercase">Encryption Keys</h4>
                                <div className="space-y-1">
                                  {m.parsedManifest.keys.map((k: any, kIdx: number) => (
                                    <div key={kIdx} className="text-[10px] text-gray-400 flex justify-between items-center bg-dark-900 px-2 py-1 rounded border border-dark-700">
                                      <span>
                                        <span className="text-white">{k.METHOD || 'Unknown'}</span> 
                                        {k.KEYFORMAT ? ` (${k.KEYFORMAT})` : ''}
                                      </span>
                                      {k.URI?.startsWith('data:') && <span className="text-green-500 bg-green-500/10 px-1 rounded">Has PSSH</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <details>
                            <summary className="text-xs text-gray-400 cursor-pointer hover:text-white transition-colors outline-none select-none">View Raw JSON</summary>
                            <pre className="text-[10px] bg-dark-800 p-2 rounded overflow-x-auto text-gray-300 font-mono mt-2 max-h-60 overflow-y-auto border border-dark-700">
                              {JSON.stringify(m.parsedManifest, null, 2)}
                            </pre>
                          </details>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-2">Parsing...</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              Waiting for manifest requests...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
