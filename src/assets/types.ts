/** Logical bundled asset names, never filesystem paths or remote URLs. */
export interface RuntimeAssets {
 read(name: string): Promise<string>;
 readBinary(name: string): Promise<ArrayBuffer>;
 list(): string[];
}
