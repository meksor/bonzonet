import { derived, get, writable, type Readable, type Writable } from 'svelte/store'
import { joinRoom, type NostrPowRoomConfig } from './nostrPow'
import {
  confirmSignaturePayload,
  generateIdentity,
  hashText,
  signString,
  verifyString,
  voteSignaturePayload,
  type Identity,
} from './crypto'
import { computeCharBudgets, countVotes } from './scoring'
import { validateFragmentShader } from './shaderCompile'
import type {
  ConfirmEntry,
  ConfirmMessage,
  ControlMessage,
  LiveEditMessage,
  Phase,
  PlayerInfo,
  PresenceMessage,
  Role,
  SnapshotMessage,
  VoteMessage,
} from './types'

const FALLBACK_SHADER = `precision mediump float;
uniform float time;
uniform vec2 resolution;
void main(out vec4 color, in vec2 coord) {
  vec2 uv = coord / resolution;
  color = vec4(uv.x, uv.y, sin(time) * 0.5 + 0.5, 1.0);
}`

const RELAY_URLS = [
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
  'wss://relay.mostr.pub',
  'wss://relay.snort.social',
]

const POW_FALLBACK_RELAY_URLS = ['wss://nos.lol']

const TRYSTERO_CONFIG = {
  appId: 'bonzonet',
  relayUrls: RELAY_URLS,
  relayRedundancy: 3,
  pow: {
    enabled: true,
    maxDifficulty: 24,
    maxNonce: 1_000_000,
    fallbackRelayUrls: POW_FALLBACK_RELAY_URLS,
  },
}

type ActionTuple<T> = [
  (payload: T, targetPeerId?: string) => void,
  (handler: (payload: T, peerId: string) => void) => void,
  unknown,
]

export interface GameState {
  identity: Writable<Identity | null>
  setupError: Writable<string>
  role: Writable<Role>
  playerName: Writable<string>
  playerRoomKey: Writable<string>
  audienceRoomKey: Writable<string>
  statusMessage: Writable<string>
  isConnected: Writable<boolean>

  phase: Writable<Phase>
  round: Writable<number>
  hostPubKey: Writable<string | null>
  activePlayerPubKey: Writable<string | null>
  completedPlayerPubKeys: Writable<string[]>
  turnEndsAtMs: Writable<number | null>
  votingEndsAtMs: Writable<number | null>
  nowMs: Writable<number>

  charsPerPlayer: Writable<number>
  minCharFloor: Writable<number>
  turnLimitSeconds: Writable<number>
  voteWindowSeconds: Writable<number>
  gracePeriodSeconds: Writable<number>
  correspondenceMode: Writable<boolean>

  confirmedShader: Writable<string>
  shaderSource: Writable<string>
  compileError: Writable<string>
  lastLine: Writable<number>

  playersByPubKey: Writable<Record<string, PlayerInfo>>
  peerIdToPubKey: Writable<Record<string, string>>
  charBudgetByPlayer: Writable<Record<string, number>>
  votesByRound: Writable<Record<number, Record<string, string>>>
  confirmLog: Writable<ConfirmEntry[]>
  localReady: Writable<boolean>
  graceForPubKey: Writable<string | null>
  graceDeadlineMs: Writable<number | null>

  playerPubKeys: Readable<string[]>
  currentVotes: Readable<Record<string, string>>
  canEdit: Readable<boolean>
  canVote: Readable<boolean>
  activeBudget: Readable<number>

  init: () => Promise<void>
  destroy: () => void
  connect: () => Promise<void>
  disconnect: () => void
  ensureConnected: () => Promise<void>

  prepareHostSession: () => void
  preparePlayerSession: (playerCode: string) => boolean
  prepareAudienceSession: (audienceCode: string) => boolean

  setPlayerName: (name: string) => void
  setPlayerRoomKey: (key: string) => void
  setAudienceRoomKey: (key: string) => void
  setCharsPerPlayer: (value: number) => void
  setMinCharFloor: (value: number) => void
  setTurnLimitSeconds: (value: number) => void
  setVoteWindowSeconds: (value: number) => void
  setGracePeriodSeconds: (value: number) => void
  setCorrespondenceMode: (value: boolean) => void

  toggleReady: () => void
  startGame: () => void
  endGame: () => void
  setVote: (votedForPubKey: string) => Promise<void>
  onConfirm: (event: CustomEvent<{ text: string; line: number }>) => Promise<void>
  onLiveChange: (event: CustomEvent<{ text: string; line: number }>) => void
  onCompileError: (event: CustomEvent<string>) => void

  short: (value: string) => string
  remainingSeconds: (until: number | null, referenceNowMs?: number) => string
}

const createGameState = (): GameState => {
  const identity = writable<Identity | null>(null)
  const setupError = writable('')
  const role = writable<Role>('host-player')
  const playerName = writable(`player-${crypto.randomUUID().slice(0, 4)}`)
  const playerRoomKey = writable(`players-${crypto.randomUUID().slice(0, 8)}`)
  const audienceRoomKey = writable(`aud-${crypto.randomUUID().slice(0, 8)}`)
  const statusMessage = writable('Disconnected')
  const isConnected = writable(false)

  const phase = writable<Phase>('lobby')
  const round = writable(1)
  const hostPubKey = writable<string | null>(null)
  const activePlayerPubKey = writable<string | null>(null)
  const completedPlayerPubKeys = writable<string[]>([])
  const turnEndsAtMs = writable<number | null>(null)
  const votingEndsAtMs = writable<number | null>(null)
  const nowMs = writable(Date.now())

  const charsPerPlayer = writable(200)
  const minCharFloor = writable(20)
  const turnLimitSeconds = writable(60)
  const voteWindowSeconds = writable(15)
  const gracePeriodSeconds = writable(30)
  const correspondenceMode = writable(false)

  const confirmedShader = writable(FALLBACK_SHADER)
  const shaderSource = writable(FALLBACK_SHADER)
  const compileError = writable('')
  const lastLine = writable(1)

  const playersByPubKey = writable<Record<string, PlayerInfo>>({})
  const peerIdToPubKey = writable<Record<string, string>>({})
  const charBudgetByPlayer = writable<Record<string, number>>({})
  const votesByRound = writable<Record<number, Record<string, string>>>({})
  const confirmLog = writable<ConfirmEntry[]>([])
  const localReady = writable(false)

  const graceForPubKey = writable<string | null>(null)
  const graceDeadlineMs = writable<number | null>(null)

  const playerPubKeys = derived(playersByPubKey, ($players) => Object.keys($players))
  const currentVotes = derived([votesByRound, round], ([$votesByRound, $round]) => $votesByRound[$round] ?? {})

  const myPubKey = () => get(identity)?.publicKey ?? ''
  const amHost = () => get(role) === 'host-player'
  const amPlayer = () => get(role) === 'host-player' || get(role) === 'player'

  const canEdit = derived(
    [isConnected, role, phase, activePlayerPubKey, identity],
    ([$isConnected, $role, $phase, $activePlayerPubKey, $identity]) =>
      $isConnected &&
      ($role === 'host-player' || $role === 'player') &&
      $phase === 'turn' &&
      !!$identity &&
      $activePlayerPubKey === $identity.publicKey,
  )

  const canVote = derived(
    [isConnected, role, phase, votingEndsAtMs, nowMs],
    ([$isConnected, $role, $phase, $votingEndsAtMs, $nowMs]) => {
      if (!$isConnected || $role !== 'audience') return false
      if ($phase === 'ended') return false
      if ($phase === 'voting' && $votingEndsAtMs !== null && $nowMs > $votingEndsAtMs) return false
      return true
    },
  )

  const activeBudget = derived(
    [charBudgetByPlayer, charsPerPlayer, identity],
    ([$budgetByPlayer, $charsPerPlayer, $identity]) => {
      if (!$identity) return $charsPerPlayer
      return $budgetByPlayer[$identity.publicKey] ?? $charsPerPlayer
    },
  )

  const short = (value: string) => `${value.slice(0, 8)}...${value.slice(-6)}`
  const remainingSeconds = (until: number | null, referenceNowMs = get(nowMs)) => {
    if (until === null) return '--'
    return Math.max(0, Math.ceil((until - referenceNowMs) / 1000)).toString()
  }

  const upsertPlayer = (pubKey: string, data: Partial<PlayerInfo>) => {
    playersByPubKey.update((current) => {
      const existing = current[pubKey]
      return {
        ...current,
        [pubKey]: {
          pubKey,
          name: data.name ?? existing?.name ?? short(pubKey),
          peerId: data.peerId ?? existing?.peerId ?? '',
          isReady: data.isReady ?? existing?.isReady ?? false,
          isOnline: data.isOnline ?? existing?.isOnline ?? false,
        },
      }
    })
  }

  const getVoteMap = (targetRound: number) => get(votesByRound)[targetRound] ?? {}

  const resetGameState = () => {
    phase.set('lobby')
    round.set(1)
    hostPubKey.set(amHost() ? myPubKey() : null)
    activePlayerPubKey.set(null)
    completedPlayerPubKeys.set([])
    turnEndsAtMs.set(null)
    votingEndsAtMs.set(null)
    confirmedShader.set(FALLBACK_SHADER)
    shaderSource.set(FALLBACK_SHADER)
    compileError.set('')
    charBudgetByPlayer.set({})
    votesByRound.set({})
    confirmLog.set([])
    graceForPubKey.set(null)
    graceDeadlineMs.set(null)
    lastLine.set(1)
  }

  const randomChoice = (values: string[]) => values[Math.floor(Math.random() * values.length)]

  const debugSend = (channel: string, payload: unknown, targetPeerId?: string) => {
    console.debug('[send]', channel, { targetPeerId: targetPeerId ?? null, payload })
  }

  const debugReceive = (channel: string, payload: unknown, peerId?: string) => {
    console.debug('[recv]', channel, { peerId: peerId ?? null, payload })
  }

  const debugFlow = (event: string, details?: unknown) => {
    console.debug('[flow]', event, details ?? null)
  }

  let ticker: number | null = null
  let initialized = false
  let resolvingTurnTimeout = false

  let playerRoom: ReturnType<typeof joinRoom> | null = null
  let audienceRoom: ReturnType<typeof joinRoom> | null = null

  let sendPresencePlayer: ((payload: PresenceMessage, targetPeerId?: string) => void) | null = null
  let sendLivePlayer: ((payload: LiveEditMessage, targetPeerId?: string) => void) | null = null
  let sendConfirmPlayer: ((payload: ConfirmMessage, targetPeerId?: string) => void) | null = null
  let sendControlPlayer: ((payload: ControlMessage, targetPeerId?: string) => void) | null = null
  let sendSnapshotPlayer: ((payload: SnapshotMessage, targetPeerId?: string) => void) | null = null

  let sendLiveAudience: ((payload: LiveEditMessage, targetPeerId?: string) => void) | null = null
  let sendControlAudience: ((payload: ControlMessage, targetPeerId?: string) => void) | null = null
  let sendSnapshotAudience: ((payload: SnapshotMessage, targetPeerId?: string) => void) | null = null
  let sendVoteAudience: ((payload: VoteMessage, targetPeerId?: string) => void) | null = null

  let presenceRetryTimers: number[] = []
  let presenceHeartbeat: number | null = null

  const clearPresenceTimers = () => {
    presenceRetryTimers.forEach((timerId) => clearTimeout(timerId))
    presenceRetryTimers = []
    if (presenceHeartbeat !== null) {
      clearInterval(presenceHeartbeat)
      presenceHeartbeat = null
    }
  }

  const buildPresencePayload = (): PresenceMessage => ({
    pubKey: myPubKey(),
    name: get(playerName),
    role: get(role),
    isReady: get(localReady),
  })

  const sendPresenceMessage = (reason: string, targetPeerId?: string) => {
    if (!amPlayer() || !sendPresencePlayer) return
    const payload = buildPresencePayload()
    debugFlow('presence:send', { reason, targetPeerId: targetPeerId ?? null, payload })
    debugSend('player:presence', payload, targetPeerId)
    sendPresencePlayer(payload, targetPeerId)
  }

  const schedulePresenceRetries = () => {
    clearPresenceTimers()

    ;[250, 1000, 2500].forEach((delayMs) => {
      const timerId = window.setTimeout(() => {
        if (!get(isConnected)) return
        sendPresenceMessage('retry-burst')
      }, delayMs)
      presenceRetryTimers.push(timerId)
    })

    presenceHeartbeat = window.setInterval(() => {
      if (!get(isConnected)) return
      sendPresenceMessage('heartbeat')
    }, 8000)
  }

  const buildSnapshot = (): SnapshotMessage => ({
    hostPubKey: get(hostPubKey),
    phase: get(phase),
    round: get(round),
    playersByPubKey: get(playersByPubKey),
    confirmedShader: get(confirmedShader),
    liveShader: get(shaderSource),
    activePlayerPubKey: get(activePlayerPubKey),
    charBudgetByPlayer: get(charBudgetByPlayer),
    votesByRound: get(votesByRound),
    completedPlayerPubKeys: get(completedPlayerPubKeys),
    log: get(confirmLog),
    votingEndsAtMs: get(votingEndsAtMs),
    turnEndsAtMs: get(turnEndsAtMs),
    correspondenceMode: get(correspondenceMode),
    turnLimitSeconds: get(turnLimitSeconds),
    voteWindowSeconds: get(voteWindowSeconds),
    minCharFloor: get(minCharFloor),
    charsPerPlayer: get(charsPerPlayer),
  })

  const applySnapshot = (payload: SnapshotMessage) => {
    const currentHost = get(hostPubKey)
    // Once host is known, only accept snapshots that are explicitly attributed to that host.
    if (currentHost && payload.hostPubKey !== currentHost) return
    if (!currentHost && payload.hostPubKey) hostPubKey.set(payload.hostPubKey)

    phase.set(payload.phase)
    round.set(payload.round)
    playersByPubKey.set(payload.playersByPubKey)
    confirmedShader.set(payload.confirmedShader)
    shaderSource.set(payload.liveShader)
    activePlayerPubKey.set(payload.activePlayerPubKey)
    charBudgetByPlayer.set(payload.charBudgetByPlayer)
    votesByRound.set(payload.votesByRound)
    completedPlayerPubKeys.set(payload.completedPlayerPubKeys)
    confirmLog.set(payload.log)
    votingEndsAtMs.set(payload.votingEndsAtMs)
    turnEndsAtMs.set(payload.turnEndsAtMs)
    correspondenceMode.set(payload.correspondenceMode)
    turnLimitSeconds.set(payload.turnLimitSeconds)
    voteWindowSeconds.set(payload.voteWindowSeconds)
    minCharFloor.set(payload.minCharFloor)
    charsPerPlayer.set(payload.charsPerPlayer)
  }

  const applyControl = (payload: ControlMessage) => {
    const currentHost = get(hostPubKey)
    if (currentHost && payload.hostPubKey !== currentHost) return
    if (!currentHost) hostPubKey.set(payload.hostPubKey)

    phase.set(payload.phase)
    round.set(payload.round)
    activePlayerPubKey.set(payload.activePlayerPubKey)
    votingEndsAtMs.set(payload.votingEndsAtMs)
    turnEndsAtMs.set(payload.turnEndsAtMs)
    completedPlayerPubKeys.set(payload.completedPlayerPubKeys)
    charBudgetByPlayer.set(payload.charBudgetByPlayer)
  }

  const broadcastSnapshot = () => {
    const snapshot = buildSnapshot()
    debugSend('player:snapshot', snapshot)
    sendSnapshotPlayer?.(snapshot)
    debugSend('audience:snapshot-stream', snapshot)
    sendSnapshotAudience?.(snapshot)
  }

  const broadcastControl = () => {
    const hostKey = get(hostPubKey)
    if (!hostKey || !sendControlPlayer) return

    const payload: ControlMessage = {
      hostPubKey: hostKey,
      phase: get(phase),
      round: get(round),
      activePlayerPubKey: get(activePlayerPubKey),
      votingEndsAtMs: get(votingEndsAtMs),
      turnEndsAtMs: get(turnEndsAtMs),
      completedPlayerPubKeys: get(completedPlayerPubKeys),
      charBudgetByPlayer: get(charBudgetByPlayer),
    }

    debugSend('player:control', payload)
    sendControlPlayer(payload)
    debugSend('audience:control-stream', payload)
    sendControlAudience?.(payload)
  }

  const startTurnTimer = () => {
    if (get(correspondenceMode)) {
      turnEndsAtMs.set(null)
      return
    }
    turnEndsAtMs.set(Date.now() + get(turnLimitSeconds) * 1000)
  }

  const startVotingWindow = () => {
    phase.set('voting')
    activePlayerPubKey.set(null)
    turnEndsAtMs.set(null)
    votingEndsAtMs.set(Date.now() + get(voteWindowSeconds) * 1000)
    broadcastControl()
    broadcastSnapshot()
  }

  const beginNextRound = () => {
    const players = get(playerPubKeys)
    if (players.length === 0) return

    const currentRound = get(round)
    const voteCounts = countVotes(getVoteMap(currentRound), players)
    charBudgetByPlayer.set(
      computeCharBudgets(voteCounts, players, get(charsPerPlayer), get(minCharFloor)),
    )

    round.update((value) => value + 1)
    completedPlayerPubKeys.set([])
    phase.set('turn')
    activePlayerPubKey.set(randomChoice(players))
    startTurnTimer()
    votingEndsAtMs.set(null)
    shaderSource.set(get(confirmedShader))
    broadcastControl()
    broadcastSnapshot()
  }

  const advanceAfterConfirmedTurn = () => {
    const players = get(playerPubKeys)
    if (players.length === 0) return

    const completed = get(completedPlayerPubKeys)
    const pending = players.filter((pubKey) => !completed.includes(pubKey))
    if (pending.length === 0) {
      startVotingWindow()
      return
    }

    phase.set('turn')
    activePlayerPubKey.set(randomChoice(pending))
    startTurnTimer()
    broadcastControl()
    broadcastSnapshot()
  }

  const applyLiveEdit = (payload: LiveEditMessage) => {
    if (payload.round !== get(round)) return
    if (get(phase) !== 'turn') return
    if (get(activePlayerPubKey) !== payload.actorPubKey) return
    shaderSource.set(payload.text)
    lastLine.set(payload.line)
    compileError.set('')

    // Host rebroadcasts player-room live edits to audience-room subscribers.
    if (amHost()) {
      sendLiveAudience?.(payload)
    }
  }

  const applyVote = async (payload: VoteMessage) => {
    const players = get(playerPubKeys)
    if (players.includes(payload.voterPubKey)) return
    if (!players.includes(payload.votedForPubKey)) return
    if (payload.round !== get(round)) return

    if (get(phase) === 'voting') {
      const endsAt = get(votingEndsAtMs)
      if (endsAt !== null && Date.now() > endsAt) return
    }

    const isValid = await verifyString(
      voteSignaturePayload(payload.round, payload.voterPubKey, payload.votedForPubKey, payload.timestamp),
      payload.signature,
      payload.voterPubKey,
    )
    if (!isValid) return

    votesByRound.update((current) => {
      const roundVotes = current[payload.round] ?? {}
      return {
        ...current,
        [payload.round]: {
          ...roundVotes,
          [payload.voterPubKey]: payload.votedForPubKey,
        },
      }
    })

    if (amHost()) {
      broadcastSnapshot()
    }
  }

  const applyConfirmedEntry = async (entry: ConfirmEntry) => {
    if (get(confirmLog).some((existing) => existing.id === entry.id)) return
    if (entry.round !== get(round)) return
    if (get(phase) !== 'turn') return
    if (get(activePlayerPubKey) !== entry.actorPubKey) return

    const signatureValid = await verifyString(
      confirmSignaturePayload(entry.round, entry.actorPubKey, entry.textHash, entry.line, entry.timestamp),
      entry.signature,
      entry.actorPubKey,
    )
    if (!signatureValid) return

    const checkHash = await hashText(entry.text)
    if (checkHash !== entry.textHash) return

    const compile = validateFragmentShader(entry.text)
    if (!compile.ok) return

    confirmLog.update((current) => [...current, entry])
    confirmedShader.set(entry.text)
    shaderSource.set(entry.text)
    compileError.set('')

    completedPlayerPubKeys.update((current) =>
      current.includes(entry.actorPubKey) ? current : [...current, entry.actorPubKey],
    )

    if (amHost()) {
      graceForPubKey.set(null)
      graceDeadlineMs.set(null)
      advanceAfterConfirmedTurn()
    }
  }

  const setupPlayerRoom = (roomConfig: NostrPowRoomConfig) => {
    if (!amPlayer()) {
      debugFlow('setupPlayerRoom:skip-not-player', { role: get(role) })
      return
    }

    const key = get(playerRoomKey).trim()
    if (!key) {
      debugFlow('setupPlayerRoom:missing-key')
      statusMessage.set('Player room key is required.')
      return
    }

    debugFlow('setupPlayerRoom:joining', {
      key,
      relayRedundancy: roomConfig.relayRedundancy,
      relayCount: roomConfig.relayUrls?.length ?? null,
      role: get(role),
    })

    playerRoom = joinRoom(roomConfig, key)
    debugFlow('setupPlayerRoom:joined', { key })

    const [sendPresence, getPresence] = playerRoom.makeAction('presence') as ActionTuple<PresenceMessage>
    const [sendLive, getLive] = playerRoom.makeAction('live-edit') as ActionTuple<LiveEditMessage>
    const [sendConfirm, getConfirm] = playerRoom.makeAction('confirm') as ActionTuple<ConfirmMessage>
    const [sendControl, getControl] = playerRoom.makeAction('control') as ActionTuple<ControlMessage>
    const [sendSnapshot, getSnapshot] = playerRoom.makeAction('snapshot') as ActionTuple<SnapshotMessage>

    sendPresencePlayer = sendPresence
    sendLivePlayer = sendLive
    sendConfirmPlayer = sendConfirm
    sendControlPlayer = sendControl
    sendSnapshotPlayer = sendSnapshot

    getPresence((payload, peerId) => {
      debugReceive('player:presence', payload, peerId)
      peerIdToPubKey.update((current) => ({ ...current, [peerId]: payload.pubKey }))

      upsertPlayer(payload.pubKey, {
        name: payload.name,
        peerId,
        isReady: payload.isReady,
        isOnline: true,
      })

      if (get(graceForPubKey) === payload.pubKey) {
        graceForPubKey.set(null)
        graceDeadlineMs.set(null)
      }
    })

    getLive((payload) => {
      debugReceive('player:live-edit', payload)
      applyLiveEdit(payload)
    })

    getConfirm(async (payload) => {
      debugReceive('player:confirm', payload)
      await applyConfirmedEntry(payload.entry)
    })

    getControl((payload) => {
      debugReceive('player:control', payload)
      applyControl(payload)
    })

    getSnapshot((payload) => {
      debugReceive('player:snapshot', payload)
      applySnapshot(payload)
    })

    playerRoom.onPeerJoin((peerId) => {
      console.debug('[peer-join]', 'player-room', { peerId })
      sendPresenceMessage('peer-join-targeted', peerId)
      if (amHost()) {
        const snapshot = buildSnapshot()
        debugSend('player:snapshot', snapshot, peerId)
        sendSnapshotPlayer?.(snapshot, peerId)
      }
    })

    playerRoom.onPeerLeave((peerId) => {
      console.debug('[peer-leave]', 'player-room', { peerId })
      const pubKey = get(peerIdToPubKey)[peerId]
      if (!pubKey) return

      peerIdToPubKey.update((current) => {
        const { [peerId]: _, ...rest } = current
        return rest
      })

      upsertPlayer(pubKey, { isOnline: false })

      if (amHost() && get(phase) === 'turn' && get(activePlayerPubKey) === pubKey) {
        graceForPubKey.set(pubKey)
        graceDeadlineMs.set(Date.now() + get(gracePeriodSeconds) * 1000)
      }
    })
  }

  const setupAudienceRoom = (roomConfig: NostrPowRoomConfig) => {
    const currentRole = get(role)
    if (!amHost() && currentRole !== 'audience') {
      debugFlow('setupAudienceRoom:skip-not-host-or-audience', { role: currentRole })
      return
    }

    const key = get(audienceRoomKey).trim()
    if (!key) {
      debugFlow('setupAudienceRoom:missing-key')
      return
    }

    debugFlow('setupAudienceRoom:joining', {
      key,
      relayRedundancy: roomConfig.relayRedundancy,
      relayCount: roomConfig.relayUrls?.length ?? null,
      role: currentRole,
    })

    audienceRoom = joinRoom(roomConfig, key)
    debugFlow('setupAudienceRoom:joined', { key })

    const [sendLive, getLive] = audienceRoom.makeAction('live-stream') as ActionTuple<LiveEditMessage>
    const [sendControl, getControl] = audienceRoom.makeAction('control-stream') as ActionTuple<ControlMessage>
    const [sendSnapshot, getSnapshot] = audienceRoom.makeAction('snapshot-stream') as ActionTuple<SnapshotMessage>
    const [sendVote, getVote] = audienceRoom.makeAction('vote') as ActionTuple<VoteMessage>

    sendLiveAudience = sendLive
    sendControlAudience = sendControl
    sendSnapshotAudience = sendSnapshot
    sendVoteAudience = sendVote

    getLive((payload) => {
      debugReceive('audience:live-stream', payload)
      applyLiveEdit(payload)
    })

    getControl((payload) => {
      debugReceive('audience:control-stream', payload)
      applyControl(payload)
    })

    getSnapshot((payload) => {
      debugReceive('audience:snapshot-stream', payload)
      applySnapshot(payload)
    })

    getVote(async (payload) => {
      debugReceive('audience:vote', payload)
      await applyVote(payload)
    })

    audienceRoom.onPeerJoin((peerId) => {
      console.debug('[peer-join]', 'audience-room', { peerId })
      const snapshot = buildSnapshot()
      debugSend('audience:snapshot-stream', snapshot, peerId)
      sendSnapshotAudience?.(snapshot, peerId)
      const controlPayload: ControlMessage = {
        hostPubKey: get(hostPubKey) ?? '',
        phase: get(phase),
        round: get(round),
        activePlayerPubKey: get(activePlayerPubKey),
        votingEndsAtMs: get(votingEndsAtMs),
        turnEndsAtMs: get(turnEndsAtMs),
        completedPlayerPubKeys: get(completedPlayerPubKeys),
        charBudgetByPlayer: get(charBudgetByPlayer),
      }
      debugSend('audience:control-stream', controlPayload, peerId)
      sendControlAudience?.(controlPayload, peerId)
    })
  }

  const connect = async () => {
    const id = get(identity)
    if (!id) {
      debugFlow('connect:aborted-no-identity')
      return
    }
    debugFlow('connect:begin', {
      role: get(role),
      playerRoomKey: get(playerRoomKey).trim(),
      audienceRoomKey: get(audienceRoomKey).trim(),
      localReady: get(localReady),
      publicKey: id.publicKey,
    })
    disconnect()

    resetGameState()

    if (amPlayer()) {
      upsertPlayer(myPubKey(), {
        name: get(playerName),
        peerId: 'local',
        isReady: get(localReady),
        isOnline: true,
      })
    }

    const roomConfig: NostrPowRoomConfig = {
      ...TRYSTERO_CONFIG,
      pow: {
        ...TRYSTERO_CONFIG.pow,
        onStatus: (message: string) => {
          statusMessage.set(message)
        },
      },
    }

    setupPlayerRoom(roomConfig)
    setupAudienceRoom(roomConfig)

    debugFlow('connect:rooms-configured', {
      hasPlayerRoom: !!playerRoom,
      hasAudienceRoom: !!audienceRoom,
      canSendPresence: !!sendPresencePlayer,
      canSendLivePlayer: !!sendLivePlayer,
      canSendLiveAudience: !!sendLiveAudience,
      canSendControlPlayer: !!sendControlPlayer,
      canSendControlAudience: !!sendControlAudience,
    })

    isConnected.set(true)
    statusMessage.set(`Connected as ${get(role)}`)
    debugFlow('connect:connected', { role: get(role) })

    if (amPlayer()) {
      sendPresenceMessage('connect-initial')
      schedulePresenceRetries()
    }

    if (amHost()) {
      hostPubKey.set(myPubKey())
      debugFlow('connect:set-host-pubkey', { hostPubKey: myPubKey() })
    }
  }

  const disconnect = () => {
    debugFlow('disconnect:begin', {
      hadPlayerRoom: !!playerRoom,
      hadAudienceRoom: !!audienceRoom,
    })
    playerRoom?.leave()
    audienceRoom?.leave()
    playerRoom = null
    audienceRoom = null

    sendPresencePlayer = null
    sendLivePlayer = null
    sendConfirmPlayer = null
    sendControlPlayer = null
    sendSnapshotPlayer = null

    sendLiveAudience = null
    sendControlAudience = null
    sendSnapshotAudience = null
    sendVoteAudience = null

    clearPresenceTimers()

    isConnected.set(false)
    statusMessage.set('Disconnected')
    playersByPubKey.set({})
    peerIdToPubKey.set({})
    debugFlow('disconnect:done')
  }

  const ensureConnected = async () => {
    if (get(isConnected)) {
      debugFlow('ensureConnected:already-connected')
      return
    }
    debugFlow('ensureConnected:connecting')
    await connect()
  }

  const toggleReady = () => {
    if (!amPlayer()) return

    localReady.update((current) => !current)
    upsertPlayer(myPubKey(), {
      name: get(playerName),
      peerId: 'local',
      isReady: get(localReady),
      isOnline: true,
    })

    sendPresenceMessage('toggle-ready')
  }

  const startGame = () => {
    if (!amHost() || !get(identity)) return
    debugFlow('startGame:attempt')
    const players = get(playerPubKeys).filter((pubKey) => get(playersByPubKey)[pubKey].isReady)
    if (players.length < 2) {
      debugFlow('startGame:blocked-not-enough-ready-players', {
        readyPlayers: players,
        allPlayers: Object.entries(get(playersByPubKey)).map(([pubKey, info]) => ({
          pubKey,
          isReady: info.isReady,
          isOnline: info.isOnline,
          peerId: info.peerId,
        })),
      })
      statusMessage.set('Need at least two ready players to start.')
      return
    }

    debugFlow('startGame:starting', { readyPlayers: players })

    phase.set('turn')
    round.set(1)
    completedPlayerPubKeys.set([])
    votesByRound.set({})
    confirmLog.set([])
    confirmedShader.set(FALLBACK_SHADER)
    shaderSource.set(FALLBACK_SHADER)
    hostPubKey.set(myPubKey())
    charBudgetByPlayer.set(
      players.reduce<Record<string, number>>((acc, pubKey) => {
        acc[pubKey] = Math.max(get(minCharFloor), get(charsPerPlayer))
        return acc
      }, {}),
    )
    activePlayerPubKey.set(randomChoice(players))
    startTurnTimer()
    votingEndsAtMs.set(null)
    compileError.set('')
    graceForPubKey.set(null)
    graceDeadlineMs.set(null)
    broadcastControl()
    broadcastSnapshot()
  }

  const endGame = () => {
    if (!amHost()) return
    phase.set('ended')
    activePlayerPubKey.set(null)
    turnEndsAtMs.set(null)
    votingEndsAtMs.set(null)
    broadcastControl()
    broadcastSnapshot()
  }

  const setVote = async (votedForPubKey: string) => {
    if (!get(identity) || !sendVoteAudience || !get(canVote)) return

    const id = get(identity)
    if (!id) return

    const timestamp = Date.now()
    const payloadString = voteSignaturePayload(get(round), id.publicKey, votedForPubKey, timestamp)
    const signature = await signString(payloadString, id.privateKey)

    const payload: VoteMessage = {
      round: get(round),
      voterPubKey: id.publicKey,
      votedForPubKey,
      signature,
      timestamp,
    }

    sendVoteAudience(payload)
    debugSend('audience:vote', payload)
    await applyVote(payload)
  }

  const onConfirm = async (event: CustomEvent<{ text: string; line: number }>) => {
    if (!get(identity) || !sendConfirmPlayer || !get(canEdit)) return

    const id = get(identity)
    if (!id) return

    const candidate = event.detail.text
    const validation = validateFragmentShader(candidate)
    if (!validation.ok) {
      compileError.set(validation.error)
      return
    }

    const timestamp = Date.now()
    const textHash = await hashText(candidate)
    const signature = await signString(
      confirmSignaturePayload(get(round), id.publicKey, textHash, event.detail.line, timestamp),
      id.privateKey,
    )

    const entry: ConfirmEntry = {
      id: `${get(round)}-${id.publicKey}-${timestamp}`,
      round: get(round),
      actorPubKey: id.publicKey,
      actorName: get(playerName),
      line: event.detail.line,
      text: candidate,
      textHash,
      signature,
      timestamp,
    }

    await applyConfirmedEntry(entry)
    debugSend('player:confirm', { entry })
    sendConfirmPlayer({ entry })
    const snapshot = buildSnapshot()
    debugSend('audience:snapshot-stream', snapshot)
    sendSnapshotAudience?.(snapshot)
  }

  const onLiveChange = (event: CustomEvent<{ text: string; line: number }>) => {
    if (!get(canEdit) || !sendLivePlayer) return

    shaderSource.set(event.detail.text)
    lastLine.set(event.detail.line)
    compileError.set('')

    const payload: LiveEditMessage = {
      round: get(round),
      actorPubKey: myPubKey(),
      actorName: get(playerName),
      text: event.detail.text,
      line: event.detail.line,
      seq: Date.now(),
    }

    debugSend('player:live-edit', payload)
    sendLivePlayer(payload)
    debugSend('audience:live-stream', payload)
    sendLiveAudience?.(payload)
  }

  const onCompileError = (event: CustomEvent<string>) => {
    compileError.set(event.detail)
  }

  const forfeitActivePlayer = () => {
    if (!amHost()) return

    const active = get(activePlayerPubKey)
    if (!active) return

    completedPlayerPubKeys.update((current) => (current.includes(active) ? current : [...current, active]))
    graceForPubKey.set(null)
    graceDeadlineMs.set(null)
    advanceAfterConfirmedTurn()
  }

  const resolveTimedOutTurn = async () => {
    if (!amHost()) return
    if (resolvingTurnTimeout) return
    if (get(phase) !== 'turn') return

    const active = get(activePlayerPubKey)
    if (!active) return

    resolvingTurnTimeout = true

    try {
      const startedRound = get(round)
      const candidate = get(shaderSource)
      const validation = validateFragmentShader(candidate)

      if (get(phase) !== 'turn' || get(activePlayerPubKey) !== active || get(round) !== startedRound) {
        return
      }

      if (validation.ok) {
        const timestamp = Date.now()
        const entry: ConfirmEntry = {
          id: `timeout-${startedRound}-${active}-${timestamp}`,
          round: startedRound,
          actorPubKey: active,
          actorName: get(playersByPubKey)[active]?.name ?? short(active),
          line: get(lastLine),
          text: candidate,
          textHash: await hashText(candidate),
          signature: 'timeout-auto-confirm',
          timestamp,
        }

        confirmLog.update((current) => [...current, entry])
        confirmedShader.set(candidate)
        shaderSource.set(candidate)
        compileError.set('')
      } else {
        shaderSource.set(get(confirmedShader))
        compileError.set(validation.error)
      }

      completedPlayerPubKeys.update((current) => (current.includes(active) ? current : [...current, active]))
      graceForPubKey.set(null)
      graceDeadlineMs.set(null)
      advanceAfterConfirmedTurn()
    } finally {
      resolvingTurnTimeout = false
    }
  }

  const init = async () => {
    if (initialized) return
    initialized = true

    try {
      identity.set(await generateIdentity())
    } catch {
      setupError.set('WebCrypto Ed25519 is not available in this browser.')
      return
    }

    ticker = window.setInterval(() => {
      nowMs.set(Date.now())

      if (!amHost()) return
      if (!get(isConnected)) return

      const now = Date.now()
      const currentPhase = get(phase)
      const turnEnds = get(turnEndsAtMs)
      const voteEnds = get(votingEndsAtMs)
      const graceEnds = get(graceDeadlineMs)

      if (currentPhase === 'turn' && turnEnds !== null && now > turnEnds) {
        void resolveTimedOutTurn()
      }

      if (currentPhase === 'voting' && voteEnds !== null && now > voteEnds) {
        beginNextRound()
      }

      if (graceEnds !== null && now > graceEnds && get(graceForPubKey)) {
        forfeitActivePlayer()
      }
    }, 500)
  }

  const destroy = () => {
    if (ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
    disconnect()
    clearPresenceTimers()
    initialized = false
  }

  const prepareHostSession = () => {
    role.set('host-player')
    localReady.set(true)
    if (!get(playerRoomKey).trim()) {
      playerRoomKey.set(`players-${crypto.randomUUID().slice(0, 8)}`)
    }
    if (!get(audienceRoomKey).trim()) {
      audienceRoomKey.set(`aud-${crypto.randomUUID().slice(0, 8)}`)
    }
  }

  const preparePlayerSession = (playerCode: string) => {
    const code = playerCode.trim()
    if (!code) {
      statusMessage.set('Player code is required to join as player.')
      return false
    }

    role.set('player')
    playerRoomKey.set(code)
    localReady.set(true)
    return true
  }

  const prepareAudienceSession = (audienceCode: string) => {
    const code = audienceCode.trim()
    if (!code) {
      statusMessage.set('Audience code is required to join as audience.')
      return false
    }

    role.set('audience')
    audienceRoomKey.set(code)
    localReady.set(false)
    return true
  }

  const setPlayerName = (name: string) => playerName.set(name)
  const setPlayerRoomKey = (key: string) => playerRoomKey.set(key)
  const setAudienceRoomKey = (key: string) => audienceRoomKey.set(key)
  const setCharsPerPlayer = (value: number) => charsPerPlayer.set(Number.isFinite(value) ? value : 1)
  const setMinCharFloor = (value: number) => minCharFloor.set(Number.isFinite(value) ? value : 0)
  const setTurnLimitSeconds = (value: number) => turnLimitSeconds.set(Number.isFinite(value) ? value : 1)
  const setVoteWindowSeconds = (value: number) => voteWindowSeconds.set(Number.isFinite(value) ? value : 1)
  const setGracePeriodSeconds = (value: number) => gracePeriodSeconds.set(Number.isFinite(value) ? value : 1)
  const setCorrespondenceMode = (value: boolean) => correspondenceMode.set(value)

  return {
    identity,
    setupError,
    role,
    playerName,
    playerRoomKey,
    audienceRoomKey,
    statusMessage,
    isConnected,

    phase,
    round,
    hostPubKey,
    activePlayerPubKey,
    completedPlayerPubKeys,
    turnEndsAtMs,
    votingEndsAtMs,
    nowMs,

    charsPerPlayer,
    minCharFloor,
    turnLimitSeconds,
    voteWindowSeconds,
    gracePeriodSeconds,
    correspondenceMode,

    confirmedShader,
    shaderSource,
    compileError,
    lastLine,

    playersByPubKey,
    peerIdToPubKey,
    charBudgetByPlayer,
    votesByRound,
    confirmLog,
    localReady,
    graceForPubKey,
    graceDeadlineMs,

    playerPubKeys,
    currentVotes,
    canEdit,
    canVote,
    activeBudget,

    init,
    destroy,
    connect,
    disconnect,
    ensureConnected,

    prepareHostSession,
    preparePlayerSession,
    prepareAudienceSession,

    setPlayerName,
    setPlayerRoomKey,
    setAudienceRoomKey,
    setCharsPerPlayer,
    setMinCharFloor,
    setTurnLimitSeconds,
    setVoteWindowSeconds,
    setGracePeriodSeconds,
    setCorrespondenceMode,

    toggleReady,
    startGame,
    endGame,
    setVote,
    onConfirm,
    onLiveChange,
    onCompileError,

    short,
    remainingSeconds,
  }
}

export const gameState = createGameState()
