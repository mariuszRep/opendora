// Stub implementation - share functionality not yet implemented

export class ShareNext {
  static async create(id: string): Promise<{ url: string }> {
    // TODO: Implement share functionality
    return { url: `https://share.opendora.ai/${id}` }
  }

  static async remove(id: string): Promise<void> {
    // TODO: Implement unshare functionality
  }
}
