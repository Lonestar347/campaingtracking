// Storage abstraction for uploaded files (e.g. original KPI reports). Today:
// local file system. Later: SharePoint (Microsoft Graph) or blob storage.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface StorageProvider {
  /** Stores the file and returns its storage key. */
  put(data: Buffer, fileName: string, prefix?: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export class LocalFileStorage implements StorageProvider {
  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.rootDir, key);
    if (!full.startsWith(path.resolve(this.rootDir) + path.sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return full;
  }

  async put(data: Buffer, fileName: string, prefix = "misc"): Promise<string> {
    const safeName = path.basename(fileName).replace(/[^\w.\-]+/g, "_");
    const key = path.posix.join(prefix, `${randomUUID()}-${safeName}`);
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return key;
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

export const storage: StorageProvider = new LocalFileStorage(
  path.resolve(process.cwd(), process.env.STORAGE_DIR ?? "storage/uploads"),
);
