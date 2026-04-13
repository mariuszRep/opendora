// Stub for openclaw/plugin-sdk/media-runtime
export interface MediaFile {
  path: string
  mimeType: string
  size: number
}

export async function saveMediaFile(data: Buffer, filename: string): Promise<MediaFile> {
  // Stub - would save to temp directory
  return {
    path: `/tmp/${filename}`,
    mimeType: "application/octet-stream",
    size: data.length,
  }
}
