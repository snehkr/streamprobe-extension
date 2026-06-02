export const DRM_SYSTEMS = {
  WIDEVINE: 'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed',
  PLAYREADY: '9a04f079-9840-4286-ab92-e65be0885f95',
  FAIRPLAY: '94ce86fb-07cb-4edba4cb-8e4a78c1bdf7',
  CLEARKEY: 'e2719d58-a985-b3c9-781a-b030af78d30e'
};

export interface DRMInfo {
  system: string;
  uuid: string;
  psshBase64?: string;
  initData?: Uint8Array;
}

export function identifyDRMSystem(uuid: string): string {
  const normalizedUuid = uuid.toLowerCase().replace(/-/g, '');
  
  if (normalizedUuid.includes(DRM_SYSTEMS.WIDEVINE.replace(/-/g, ''))) return 'Widevine';
  if (normalizedUuid.includes(DRM_SYSTEMS.PLAYREADY.replace(/-/g, ''))) return 'PlayReady';
  if (normalizedUuid.includes(DRM_SYSTEMS.FAIRPLAY.replace(/-/g, ''))) return 'FairPlay';
  if (normalizedUuid.includes(DRM_SYSTEMS.CLEARKEY.replace(/-/g, ''))) return 'ClearKey';
  
  return 'Unknown';
}

export function extractPsshBoxes(initSegmentBuffer: ArrayBuffer): DRMInfo[] {
  // A simplified PSSH box extractor for ISO BMFF (mp4) initialization segments.
  // In a real production system, this would use a complete MP4 box parser.
  const dataView = new DataView(initSegmentBuffer);
  const infos: DRMInfo[] = [];
  let offset = 0;

  try {
    while (offset < dataView.byteLength) {
      const size = dataView.getUint32(offset);
      if (size === 0) break;
      
      const type = String.fromCharCode(
        dataView.getUint8(offset + 4),
        dataView.getUint8(offset + 5),
        dataView.getUint8(offset + 6),
        dataView.getUint8(offset + 7)
      );

      if (type === 'pssh') {
        // PSSH Box found
        // const version = dataView.getUint8(offset + 8);
        const uuidOffset = offset + 12;
        const uuidHex: string[] = [];
        
        for (let i = 0; i < 16; i++) {
          let hex = dataView.getUint8(uuidOffset + i).toString(16);
          if (hex.length === 1) hex = '0' + hex;
          uuidHex.push(hex);
        }
        
        const uuid = `${uuidHex.slice(0, 4).join('')}-${uuidHex.slice(4, 6).join('')}-${uuidHex.slice(6, 8).join('')}-${uuidHex.slice(8, 10).join('')}-${uuidHex.slice(10, 16).join('')}`;
        
        const psshData = new Uint8Array(initSegmentBuffer.slice(offset, offset + size));
        // simple base64 encode
        let binary = '';
        for (let i = 0; i < psshData.byteLength; i++) {
            binary += String.fromCharCode(psshData[i]);
        }
        
        infos.push({
          system: identifyDRMSystem(uuid),
          uuid,
          initData: psshData,
          psshBase64: typeof btoa !== 'undefined' ? btoa(binary) : ''
        });
      }

      // If it's a moov or trak box, we need to dig inside it. But for simplicity,
      // a robust parser like mp4box.js would be used in production.
      // This is a naive top-level parser.
      if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl') {
        offset += 8; // Step inside the box
      } else {
        offset += size; // Skip the box
      }
    }
  } catch (e) {
    console.error('Error parsing MP4 for PSSH:', e);
  }

  return infos;
}
