export interface MPDManifest {
  type: string; // 'static' or 'dynamic'
  duration?: string;
  minBufferTime?: string;
  periods: MPDPeriod[];
  hasDRM: boolean;
}

export interface MPDPeriod {
  id: string;
  adaptations: MPDAdaptationSet[];
}

export interface MPDAdaptationSet {
  id: string;
  contentType: string; // 'video' or 'audio'
  mimeType: string;
  representations: MPDRepresentation[];
  contentProtections: any[];
}

export interface MPDRepresentation {
  id: string;
  bandwidth: number;
  codecs?: string;
  width?: number;
  height?: number;
}

export function parseMPD(content: string): MPDManifest {
  if (!content.includes('<MPD')) {
    throw new Error('Invalid MPD manifest');
  }

  const getAttr = (str: string, attr: string) => {
    const match = new RegExp(`${attr}=["']([^"']+)["']`).exec(str);
    return match ? match[1] : undefined;
  };

  const getTags = (str: string, tag: string) => {
    const regex = new RegExp(`<${tag}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g');
    const tags = [];
    let match;
    while ((match = regex.exec(str)) !== null) {
      tags.push(match[0]);
    }
    return tags;
  };

  const mpdMatch = /<MPD[^>]*>/.exec(content);
  const mpdTag = mpdMatch ? mpdMatch[0] : '';

  const manifest: MPDManifest = {
    type: getAttr(mpdTag, 'type') || 'static',
    duration: getAttr(mpdTag, 'mediaPresentationDuration') || undefined,
    minBufferTime: getAttr(mpdTag, 'minBufferTime') || undefined,
    periods: [],
    hasDRM: content.includes('<ContentProtection')
  };

  const periods = getTags(content, 'Period');
  periods.forEach(periodStr => {
    const periodTagMatch = /<Period[^>]*>/.exec(periodStr);
    const periodTag = periodTagMatch ? periodTagMatch[0] : '';

    const p: MPDPeriod = {
      id: getAttr(periodTag, 'id') || '',
      adaptations: []
    };

    const adaptationSets = getTags(periodStr, 'AdaptationSet');
    adaptationSets.forEach(asStr => {
      const asTagMatch = /<AdaptationSet[^>]*>/.exec(asStr);
      const asTag = asTagMatch ? asTagMatch[0] : '';

      const adaptations: MPDAdaptationSet = {
        id: getAttr(asTag, 'id') || '',
        contentType: getAttr(asTag, 'contentType') || '',
        mimeType: getAttr(asTag, 'mimeType') || '',
        representations: [],
        contentProtections: []
      };

      const contentProtections = getTags(asStr, 'ContentProtection');
      contentProtections.forEach(cpStr => {
        const cpTagMatch = /<ContentProtection[^>]*>/.exec(cpStr);
        const cpTag = cpTagMatch ? cpTagMatch[0] : '';
        
        // Extract PSSH if available
        const psshMatch = /<cenc:pssh[^>]*>([\s\S]*?)<\/cenc:pssh>/.exec(cpStr);
        const pssh = psshMatch ? psshMatch[1].trim() : null;

        adaptations.contentProtections.push({
          schemeIdUri: getAttr(cpTag, 'schemeIdUri') || null,
          value: getAttr(cpTag, 'value') || null,
          pssh: pssh
        });
      });

      const representations = getTags(asStr, 'Representation');
      representations.forEach(repStr => {
        const repTagMatch = /<Representation[^>]*>/.exec(repStr);
        const repTag = repTagMatch ? repTagMatch[0] : '';
        const bandwidth = getAttr(repTag, 'bandwidth');
        const width = getAttr(repTag, 'width');
        const height = getAttr(repTag, 'height');

        adaptations.representations.push({
          id: getAttr(repTag, 'id') || '',
          bandwidth: bandwidth ? parseInt(bandwidth, 10) : 0,
          codecs: getAttr(repTag, 'codecs') || undefined,
          width: width ? parseInt(width, 10) : undefined,
          height: height ? parseInt(height, 10) : undefined,
        });
      });

      p.adaptations.push(adaptations);
    });

    manifest.periods.push(p);
  });

  return manifest;
}
