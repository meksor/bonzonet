import { schnorr } from '@noble/secp256k1'
import {
  createRelayManager,
  createStrategy,
  fromJson,
  genId,
  getRelays,
  hashWith,
  libName,
  makeSocket,
  pauseRelayReconnection,
  resumeRelayReconnection,
  selfId,
  strToNum,
  toHex,
  toJson,
  type BaseRoomConfig,
  type JoinRoom,
  type RelayConfig,
  type SocketClient,
} from '@trystero-p2p/core'
import { defaultRelayUrls } from '@trystero-p2p/nostr'

type PowMessageCallback = (message: string) => void

type PowConfig = {
  enabled?: boolean
  maxDifficulty?: number
  maxNonce?: number
  fallbackRelayUrls?: string[]
  onStatus?: PowMessageCallback
}

export type NostrPowRoomConfig = BaseRoomConfig &
  RelayConfig & {
    pow?: PowConfig
  }

const relayManager = createRelayManager<SocketClient>((client) => client.socket)
const defaultRedundancy = 5
const tag = 'x'
const eventMsgType = 'EVENT'

const { secretKey, publicKey } = schnorr.keygen()
const pubkey = toHex(publicKey)

const subIdToTopic: Record<string, string> = {}
const msgHandlers: Record<string, (topic: string, data: string) => void> = {}
const topicKindCache: Record<string, number> = {}
const powRequiredBitsByRelay: Record<string, number> = {}
const roomConfigByRelay: Record<string, NostrPowRoomConfig> = {}

const debugNostr = (event: string, details?: unknown) => {
  // console.debug('[nostr]', event, details ?? null)
}

const relayKey = (url: string) => url.replace(/\/+$/, '')

const now = () => Math.floor(Date.now() / 1e3)
const topicToKind = (topic: string) => (topicKindCache[topic] ??= strToNum(topic, 10_000) + 20_000)

const parsePowDifficulty = (message: string) => {
  const strictMatch = message.match(/proof of work of at least\s+(\d+)\s+bits/i)
  if (strictMatch) return Number.parseInt(strictMatch[1] ?? '0', 10)

  const looseMatch = message.match(/pow[^\d]*(\d+)/i)
  if (looseMatch) return Number.parseInt(looseMatch[1] ?? '0', 10)

  return null
}

const hexToBytes = (hex: string) => {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`
  const bytes = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16)
  }
  return bytes
}

type PowMineRequest = {
  requestId: string
  pubkey: string
  createdAt: number
  kind: number
  tags: string[][]
  content: string
  difficulty: number
  maxNonce: number
}

type PowMineResponse =
  | {
      requestId: string
      ok: true
      id: string
      nonce: number
      tags: string[][]
    }
  | {
      requestId: string
      ok: false
      error: string
    }

const minePowInWorker = (request: PowMineRequest): Promise<{ id: string; tags: string[][] }> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pow.worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (event: MessageEvent<PowMineResponse>) => {
      const response = event.data
      if (response.requestId !== request.requestId) return

      worker.terminate()
      if (response.ok) {
        resolve({ id: response.id, tags: response.tags })
      } else {
        reject(new Error(response.error))
      }
    }

    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'PoW worker crashed'))
    }

    worker.postMessage(request)
  })

const serializeEvent = async (
  topic: string,
  content: string,
  difficulty: number,
  maxNonce: number,
): Promise<string> => {
  const createdAt = now()
  const kind = topicToKind(topic)
  const baseTags = [[tag, topic]]

  const powDifficulty = Math.max(0, difficulty)
  let id: string
  let digestBytes: Uint8Array
  let tags = baseTags

  if (powDifficulty > 0) {
    const mined = await minePowInWorker({
      requestId: genId(16),
      pubkey,
      createdAt,
      kind,
      tags: baseTags,
      content,
      difficulty: powDifficulty,
      maxNonce,
    })
    id = mined.id
    digestBytes = hexToBytes(mined.id)
    tags = mined.tags
  } else {
    const digest = await hashWith('SHA-256', toJson([0, pubkey, createdAt, kind, baseTags, content]))
    id = toHex(digest)
    digestBytes = digest
  }

  const sig = toHex(await schnorr.signAsync(digestBytes, secretKey))

  return toJson([
    eventMsgType,
    {
      kind,
      tags,
      created_at: createdAt,
      content,
      pubkey,
      id,
      sig,
    },
  ])
}

const subscribe = (subId: string, topic: string) => {
  subIdToTopic[subId] = topic
  return toJson([
    'REQ',
    subId,
    {
      kinds: [topicToKind(topic)],
      since: now(),
      ['#' + tag]: [topic],
    },
  ])
}

const unsubscribe = (subId: string) => {
  delete subIdToTopic[subId]
  return toJson(['CLOSE', subId])
}

const buildRelayList = (config: NostrPowRoomConfig) => {
  const primary = getRelays(config, defaultRelayUrls, defaultRedundancy, true)
  const fallback = config.pow?.fallbackRelayUrls ?? []
  const list = Array.from(new Set([...primary, ...fallback]))
  debugNostr('relay-list', {
    appId: config.appId,
    relayRedundancy: config.relayRedundancy ?? defaultRedundancy,
    configuredRelayCount: config.relayUrls?.length ?? null,
    finalRelayCount: list.length,
    relays: list,
  })
  return list
}

const reportPowStatus = (config: NostrPowRoomConfig, relayUrl: string, bits: number) => {
  config.pow?.onStatus?.(`Relay ${relayUrl} requires PoW (${bits} bits). Switching this relay to worker-mined events.`)
}

const relayDifficulty = (relayUrl: string, config: NostrPowRoomConfig) => {
  if (!config.pow?.enabled) return 0
  const known = powRequiredBitsByRelay[relayUrl] ?? 0
  const cap = config.pow.maxDifficulty ?? 24
  return Math.min(known, cap)
}

const sendEventToRelay = async (
  relay: { send: (data: string) => void; url: string },
  topic: string,
  content: string,
  config: NostrPowRoomConfig | undefined,
) => {
  if (!config) {
    debugNostr('send-skip-missing-config', { relayUrl: relay.url, topic })
    return
  }
  const difficulty = relayDifficulty(relay.url, config)
  const maxNonce = config.pow?.maxNonce ?? 1_000_000
  debugNostr('send-event', {
    relayUrl: relay.url,
    topic,
    contentLength: content.length,
    difficulty,
    maxNonce,
  })
  const serialized = await serializeEvent(topic, content, difficulty, maxNonce)
  relay.send(serialized)
}

const strategyJoinRoom: JoinRoom<NostrPowRoomConfig> = createStrategy({
  init: (config) =>
    buildRelayList(config).map((url) => {
      roomConfigByRelay[relayKey(url)] = config
      debugNostr('relay-init', { url })
      const client = relayManager.register(
        url,
        makeSocket(url, (data) => {
          const parsed = fromJson<unknown[]>(data)
          const msgType = parsed[0]
          const subId = parsed[1]
          const payload = parsed[2]
          const relayMsg = parsed[3]
          if (msgType !== eventMsgType) {
            const prefix = `${libName}: relay failure from ${client.url} - `
            if (msgType === 'NOTICE') {
              const notice = String(subId)
              const bits = parsePowDifficulty(notice)
              if (bits !== null) {
                const previousBits = powRequiredBitsByRelay[client.url] ?? 0
                if (bits > previousBits) {
                  powRequiredBitsByRelay[client.url] = bits
                  reportPowStatus(config, client.url, bits)
                }
              }
              console.warn(prefix + notice)
            } else if (msgType === 'OK' && !payload) {
              const message = String(relayMsg)
              const bits = parsePowDifficulty(message)
              if (bits !== null) {
                const previousBits = powRequiredBitsByRelay[client.url] ?? 0
                if (bits > previousBits) {
                  powRequiredBitsByRelay[client.url] = bits
                  reportPowStatus(config, client.url, bits)
                }
              }
              console.warn(prefix + message)
            }
            return
          }

          if (payload && typeof payload === 'object' && 'content' in payload) {
            const subKey = String(subId)
            debugNostr('relay-event', {
              relayUrl: client.url,
              subId: subKey,
              topic: subIdToTopic[subKey] ?? '',
            })
            msgHandlers[subKey]?.(subIdToTopic[subKey] ?? '', String(payload.content))
          }
        }),
      )
      client.ready.then(() => {
        debugNostr('relay-open', { url: client.url })
      })
      return client.ready
    }),
  subscribe: (client, rootTopic, selfTopic, onMessage) => {
    const rootSubId = genId(64)
    const selfSubId = genId(64)
    const config = roomConfigByRelay[relayKey(client.url)]

    debugNostr('subscribe', {
      relayUrl: client.url,
      rootTopic,
      selfTopic,
      rootSubId,
      selfSubId,
    })

    msgHandlers[rootSubId] = msgHandlers[selfSubId] = (topic, data) => {
      onMessage(topic, data, async (peerTopic, signal) => {
        await sendEventToRelay(client, peerTopic, signal, config)
      })
    }

    client.send(subscribe(rootSubId, rootTopic))
    client.send(subscribe(selfSubId, selfTopic))

    return () => {
      debugNostr('unsubscribe', {
        relayUrl: client.url,
        rootSubId,
        selfSubId,
      })
      client.send(unsubscribe(rootSubId))
      client.send(unsubscribe(selfSubId))
      delete msgHandlers[rootSubId]
      delete msgHandlers[selfSubId]
    }
  },
  announce: async (client, rootTopic) => {
    const config = roomConfigByRelay[relayKey(client.url)]
    debugNostr('announce', { relayUrl: client.url, rootTopic })
    await sendEventToRelay(client, rootTopic, toJson({ peerId: selfId }), config)
  },
})

export const joinRoom: JoinRoom<NostrPowRoomConfig> = (config, roomId, callbacks) =>
  strategyJoinRoom(config, roomId, callbacks)

export { pauseRelayReconnection, resumeRelayReconnection, selfId }
