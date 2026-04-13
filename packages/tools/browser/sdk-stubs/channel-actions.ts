// Stub for openclaw/plugin-sdk/channel-actions
export interface ChannelAction {
  type: string
  payload: any
}

export function createChannelAction(type: string, payload: any): ChannelAction {
  return { type, payload }
}
