# Bonzonet

A real-time, peer-to-peer shader duel game where players take turns editing a shared GLSL fragment shader while an audience votes to influence gameplay.

## Play it

[... on GH Pages](https://meksor.github.io/bonzonet/)

1. A **host** creates a game room and shares two codes: one for **players**, one for the **audience**.
2. Players connect using the player code and take turns editing a shared fragment shader within a character budget.
3. The **audience** connects using the audience code and votes for their favorite player each round.
4. Votes shift each player's character budget — popular players get more characters to work with, while others get fewer (down to a configurable minimum floor).
5. The shader runs live on a WebGL canvas, so everyone sees the visual result in real time.

## Developing

### Prerequisites

- **Node.js** ≥ 22
- **npm** ≥ 10
- A modern browser with **WebGL** and **WebCrypto Ed25519** support (Chrome 113+, Edge 113+, Firefox 126+, Safari 17+)

### Install & Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and you're in.

### Build for Production

```bash
npm run build
npm run preview   # preview the production build locally
```

### Type Checking

```bash
npm run check
```

## Deployment

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically deploys to **GitHub Pages** whenever a new release is published.

## Architecture Overview

```
src/
├── lib/
│   ├── components/    # Reusable Svelte UI components
│   │   ├── ShaderView.svelte       # WebGL canvas that renders the shader
│   │   ├── ShaderEditor.svelte     # CodeMirror WGSL editor with locked regions
│   │   ├── ShaderStage.svelte      # Combines viewer + editor overlay
│   │   ├── GameStateBanner.svelte  # Live score strip + voting buttons
│   │   ├── GameInfo.svelte         # Phase/round/timer status grid
│   │   ├── HostControls.svelte     # Host room keys + game settings
│   │   ├── PlayerControls.svelte   # Player connection + ready toggle
│   │   ├── AudienceControls.svelte # Audience connection panel
│   │   └── PlayerList.svelte       # Player roster with status indicators
│   └── game/
│       ├── state.ts          # Central game state (Svelte stores + all game logic)
│       ├── types.ts          # TypeScript type definitions for all messages
│       ├── crypto.ts         # Ed25519 identity, signing, and verification
│       ├── scoring.ts        # Vote counting and character budget calculation
│       ├── shaderCompile.ts  # WebGL shader compilation and validation
│       ├── nostrPow.ts       # Custom Nostr/Trystero strategy with PoW support
│       └── pow.worker.ts     # Web Worker for Proof-of-Work mining
├── pages/
│   ├── Home.svelte           # Landing page with host/join options
│   ├── HostPage.svelte       # Host view
│   ├── PlayerPage.svelte     # Player view
│   └── AudiencePage.svelte   # Audience view
├── App.svelte                # SPA router
└── main.ts                   # Entry point
```

## Cryptography

Bonzonet uses the **Web Crypto API** (`crypto.subtle`).

### Identity

On startup, each client generates an ephemeral **Ed25519** key pair via `crypto.subtle.generateKey()`. The public key (base64-encoded) serves as the client's identity for the session. Private keys never leave the client and are not persisted.

### Signing & Verification

Two game actions require cryptographic signatures:

- **Shader confirmations**: When a player confirms their turn, the message includes a signature over a canonical payload: `confirm|{round}|{actorPubKey}|{sha256(shaderText)}|{line}|{timestamp}`. This binds the shader text (by hash), the author, the round, and the insertion line together so that other peers can verify authenticity without trusting the relay.

- **Votes**: Each audience vote is signed over: `vote|{round}|{voterPubKey}|{votedForPubKey}|{timestamp}`. This prevents vote forgery, in theory a relay or malicious peer cannot cast votes on behalf of another audience member.

All signatures use Ed25519 via `crypto.subtle.sign()` / `crypto.subtle.verify()`. The signature and public key are transmitted as base64 strings. Receiving peers import the sender's public key and verify the signature before accepting the message.

## Peer-to-Peer Infrastructure

### Transport: Nostr Relays via Trystero

Bonzonet is fully peer-to-peer with **no dedicated game server**. P2P connectivity is achieved through **Nostr relays** using a custom [Trystero](https://github.com/dmotz/trystero) strategy (`nostrPow.ts`).

- Peers discover each other by subscribing to a shared "room topic" on multiple Nostr relays. The room topic is derived from the room key that the host shares.
- Messages are published as Nostr events with specific `kind` values computed from the topic name, and tagged so that subscribers can filter for relevant messages.
- The system connects to multiple relays simultaneously (configurable redundancy, default 3) for resilience against individual relay failures.

### Room Architecture

The game uses **two separate P2P rooms**:

| Room | Participants | Purpose |
|------|-------------|---------|
| **Player room** | Host + Players | Presence, live edits, shader confirmations, control messages, state snapshots |
| **Audience room** | Host + Audience | Live edit stream, control/snapshot stream, votes |

The host bridges the two rooms: it relays live edits and game state from the player room to the audience room, and receives votes from the audience room. Players and audience members never directly communicate.

### Message Channels

Within each room, Trystero's `makeAction()` creates named channels:

- `presence` — Player heartbeats (name, ready state, online status)
- `live-edit` / `live-stream` — Real-time shader text as the active player types
- `confirm` — Signed shader confirmations
- `control` / `control-stream` — Game phase transitions (round, timers, active player)
- `snapshot` / `snapshot-stream` — Full game state (sent on peer join and after significant events)
- `vote` — Signed audience votes

### Proof of Work (PoW)

Some Nostr relays require Proof-of-Work to prevent spam. The custom Nostr strategy includes automatic PoW support:

- When a relay rejects a message with a PoW requirement (detected by parsing `NOTICE` and `OK` responses), the required difficulty is recorded.
- Subsequent messages to that relay are mined in a **Web Worker** (`pow.worker.ts`) to avoid blocking the UI thread.
- The worker iterates nonces until it finds an event ID (SHA-256 hash) with the required number of leading zero bits.
- PoW difficulty is capped at a configurable maximum (default: 24 bits) with a nonce search limit (default: 1,000,000 attempts).
- PoW support is currently **disabled** by default in the config and can be enabled by setting `pow.enabled: true`.

### Presence & Reconnection

- Players send presence heartbeats every 8 seconds.
- On connect, a burst of presence messages is sent at 250ms, 1s, and 2.5s intervals to handle relay propagation delays.
- When a player disconnects mid-turn, the host starts a configurable **grace period** (default: 30s). If the player doesn't reconnect in time, their turn is forfeited.

## Security Considerations

### Threat Model

Bonzonet is a casual game with no financial stakes. The security model is designed to prevent casual cheating and provide integrity guarantees, not to withstand a determined attacker with control over relay infrastructure.

### What Is Protected

- **Vote integrity**: Votes are Ed25519-signed, so a relay or eavesdropper cannot forge votes. Each vote binds the voter's identity, the round, and the target player.
- **Shader confirmation integrity**: Confirmed shaders are signed and hash-verified. A peer cannot retroactively alter a confirmed shader or attribute it to someone else.
- **Signature verification**: All receiving peers independently verify signatures before accepting confirmations or votes. Invalid signatures are silently dropped.

### Known Limitations & Trust Assumptions

- **The host is trusted.** The host controls game flow (phase transitions, timers, turn order, round advancement). A malicious host could skip players, end the game prematurely, or manipulate timing. There is no consensus mechanism — the host is the single authority.
- **Timeout auto-confirms bypass signatures.** When a player's turn times out, the host auto-confirms the current shader state with a placeholder signature (`timeout-auto-confirm`). This is necessary because only the active player holds the private key to sign. Other peers accept these entries because they trust the host.
- **Ephemeral identities.** Identities are generated fresh on each page load and are not tied to any persistent account. There is no Sybil resistance — a user can open multiple tabs to get multiple identities (multiple audience votes, for example).
- **Relay trust.** Nostr relays see all messages in plaintext (game data is not encrypted). A malicious relay could drop messages (causing gameplay disruption) or observe game state, but cannot forge signed messages. Using multiple relays with redundancy mitigates the impact of any single relay.
- **Room key security.** The player and audience room keys function as shared secrets that grant access to the game. Anyone who knows the key can join. Keys should be shared through a separate secure channel (e.g., direct message) rather than posted publicly.
- **No replay protection across sessions.** Signatures include a round number and timestamp, but there is no session-level nonce. In theory, a signed message from one game session could be replayed in another if the same room key and round number were reused. In practice, ephemeral identities make this unlikely to be exploitable.
- **Client-side shader validation.** Shader compilation is validated client-side via WebGL. All peers independently validate confirmed shaders, but the compilation result depends on each client's GPU driver. A shader that compiles on one machine could theoretically fail on another, though this is rare for the subset of GLSL used in practice.
