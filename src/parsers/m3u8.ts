export interface M3U8Stream {
  bandwidth: number;
  resolution?: string;
  codecs?: string;
  url: string;
}

export interface M3U8Manifest {
  isMaster: boolean;
  streams: M3U8Stream[];
  targetDuration?: number;
  isLive: boolean;
  keys: any[];
}

export function parseM3U8(content: string, baseUrl: string): M3U8Manifest {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const manifest: M3U8Manifest = {
    isMaster: false,
    streams: [],
    isLive: !content.includes('#EXT-X-ENDLIST'),
    keys: []
  };

  if (!lines[0].includes('#EXTM3U')) {
    throw new Error('Invalid M3U8 manifest');
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      manifest.isMaster = true;
      const attributes = parseAttributes(line.substring(18));
      const url = resolveUrl(baseUrl, lines[i + 1]);
      
      manifest.streams.push({
        bandwidth: parseInt(attributes['BANDWIDTH'] || '0', 10),
        resolution: attributes['RESOLUTION'],
        codecs: attributes['CODECS'],
        url
      });
      i++; // Skip next line as it's the URL
    } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      manifest.targetDuration = parseInt(line.split(':')[1], 10);
    } else if (line.startsWith('#EXT-X-KEY:') || line.startsWith('#EXT-X-SESSION-KEY:')) {
      manifest.keys.push(parseAttributes(line.substring(line.indexOf(':') + 1)));
    }
  }

  return manifest;
}

function parseAttributes(attrString: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /([A-Z0-9\-]+)=("[^"]*"|[^,]*)/g;
  let match;
  
  while ((match = regex.exec(attrString)) !== null) {
    result[match[1]] = match[2].replace(/"/g, '');
  }
  
  return result;
}

function resolveUrl(baseUrl: string, url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}
