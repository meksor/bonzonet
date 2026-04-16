const textEncoder = new TextEncoder()

const toBase64 = (bytes: Uint8Array): string => {
  let str = ''
  bytes.forEach((byte) => {
    str += String.fromCharCode(byte)
  })
  return btoa(str)
}

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

export type Identity = {
  publicKey: string
  privateKey: CryptoKey
}

export const generateIdentity = async (): Promise<Identity> => {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  )

  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey)
  return {
    publicKey: toBase64(new Uint8Array(publicKeyBuffer)),
    privateKey: keyPair.privateKey,
  }
}

export const hashText = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(text))
  return toBase64(new Uint8Array(digest))
}

export const signString = async (value: string, privateKey: CryptoKey): Promise<string> => {
  const signature = await crypto.subtle.sign('Ed25519', privateKey, textEncoder.encode(value))
  return toBase64(new Uint8Array(signature))
}

export const verifyString = async (
  value: string,
  signatureBase64: string,
  publicKeyBase64: string,
): Promise<boolean> => {
  try {
    const publicKey = await crypto.subtle.importKey(
      'raw',
      asArrayBuffer(fromBase64(publicKeyBase64)),
      { name: 'Ed25519' },
      false,
      ['verify'],
    )

    return await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      asArrayBuffer(fromBase64(signatureBase64)),
      textEncoder.encode(value),
    )
  } catch {
    return false
  }
}

export const confirmSignaturePayload = (
  round: number,
  actorPubKey: string,
  textHash: string,
  line: number,
  timestamp: number,
) => `confirm|${round}|${actorPubKey}|${textHash}|${line}|${timestamp}`

export const voteSignaturePayload = (
  round: number,
  voterPubKey: string,
  votedForPubKey: string,
  timestamp: number,
) => `vote|${round}|${voterPubKey}|${votedForPubKey}|${timestamp}`
