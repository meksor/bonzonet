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

const textEncoder = new TextEncoder()

const leadingZeroBits = (bytes: Uint8Array) => {
  let count = 0
  for (const byte of bytes) {
    if (byte === 0) {
      count += 8
      continue
    }

    for (let bit = 7; bit >= 0; bit -= 1) {
      if ((byte & (1 << bit)) === 0) {
        count += 1
      } else {
        return count
      }
    }
  }
  return count
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const minePow = async (request: PowMineRequest) => {
  const difficulty = Math.max(0, request.difficulty)
  const limit = Math.max(1, request.maxNonce)

  for (let nonce = 0; nonce < limit; nonce += 1) {
    const powTags = [...request.tags, ['nonce', String(nonce), String(difficulty)]]
    const preimage = JSON.stringify([0, request.pubkey, request.createdAt, request.kind, powTags, request.content])
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(preimage)))

    if (leadingZeroBits(digest) >= difficulty) {
      return {
        id: toHex(digest),
        nonce,
        tags: powTags,
      }
    }
  }

  throw new Error(`PoW search exhausted at nonce ${limit}`)
}

self.onmessage = async (event: MessageEvent<PowMineRequest>) => {
  const request = event.data

  try {
    const result = await minePow(request)
    const response: PowMineResponse = {
      requestId: request.requestId,
      ok: true,
      id: result.id,
      nonce: result.nonce,
      tags: result.tags,
    }
    self.postMessage(response)
  } catch (error) {
    const response: PowMineResponse = {
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown worker error',
    }
    self.postMessage(response)
  }
}
