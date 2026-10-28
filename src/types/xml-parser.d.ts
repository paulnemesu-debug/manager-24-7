/** The upstream declarations use their original package name; this is our pinned npm alias surface. */
declare module 'manager247-xml-parser' {
  export class DOMParser {
    constructor(options?: { onError?: (level: 'warning' | 'error' | 'fatalError', message: string) => void });
    parseFromString(source: string, mimeType: 'application/xml'): Document;
  }
}
