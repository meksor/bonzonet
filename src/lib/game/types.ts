export type Role = 'host-player' | 'player' | 'audience'

export type Phase = 'lobby' | 'turn' | 'voting' | 'ended'

export type PlayerInfo = {
  pubKey: string
  name: string
  peerId: string
  isReady: boolean
  isOnline: boolean
}

export type ConfirmEntry = {
  id: string
  round: number
  actorPubKey: string
  actorName: string
  line: number
  text: string
  textHash: string
  signature: string
  timestamp: number
}

export type PresenceMessage = {
  pubKey: string
  name: string
  role: Role
  isReady: boolean
}

export type LiveEditMessage = {
  round: number
  actorPubKey: string
  actorName: string
  text: string
  line: number
  seq: number
}

export type ConfirmMessage = {
  entry: ConfirmEntry
}

export type VoteMessage = {
  round: number
  voterPubKey: string
  votedForPubKey: string
  signature: string
  timestamp: number
}

export type ControlMessage = {
  hostPubKey: string
  phase: Phase
  round: number
  activePlayerPubKey: string | null
  votingEndsAtMs: number | null
  turnEndsAtMs: number | null
  completedPlayerPubKeys: string[]
  charBudgetByPlayer: Record<string, number>
  audienceConnectedCount: number
}

export type SnapshotMessage = {
  hostPubKey: string | null
  phase: Phase
  round: number
  playersByPubKey: Record<string, PlayerInfo>
  confirmedShader: string
  liveShader: string
  activePlayerPubKey: string | null
  charBudgetByPlayer: Record<string, number>
  votesByRound: Record<number, Record<string, string>>
  completedPlayerPubKeys: string[]
  log: ConfirmEntry[]
  votingEndsAtMs: number | null
  turnEndsAtMs: number | null
  correspondenceMode: boolean
  turnLimitSeconds: number
  voteWindowSeconds: number
  minCharFloor: number
  charsPerPlayer: number
  audienceConnectedCount: number
}

export type BroadcastMessage = {
  hostPubKey: string
  hostName: string
  sharePlayerCode: boolean
  shareAudienceCode: boolean
  playerRoomKey: string
  audienceRoomKey: string
  phase: Phase
  round: number
  charsPerPlayer: number
  minCharFloor: number
  turnLimitSeconds: number
  voteWindowSeconds: number
  gracePeriodSeconds: number
  correspondenceMode: boolean
  timestamp: number
}

export type BroadcastListing = BroadcastMessage & {
  peerId: string
}
