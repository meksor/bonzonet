export const computeCharBudgets = (
  votesByPlayer: Record<string, number>,
  playerPubKeys: string[],
  charsPerPlayer: number,
  minCharFloor: number,
): Record<string, number> => {
  const playerCount = playerPubKeys.length
  if (playerCount === 0) return {}

  const totalVotes = playerPubKeys.reduce((sum, pubKey) => sum + (votesByPlayer[pubKey] ?? 0), 0)

  if (totalVotes === 0) {
    return playerPubKeys.reduce<Record<string, number>>((acc, pubKey) => {
      acc[pubKey] = Math.max(minCharFloor, charsPerPlayer)
      return acc
    }, {})
  }

  return playerPubKeys.reduce<Record<string, number>>((acc, pubKey) => {
    const weight = ((votesByPlayer[pubKey] ?? 0) / totalVotes) * playerCount
    acc[pubKey] = Math.max(minCharFloor, Math.round(charsPerPlayer * weight))
    return acc
  }, {})
}

export const countVotes = (
  votes: Record<string, string>,
  playerPubKeys: string[],
): Record<string, number> => {
  const result = playerPubKeys.reduce<Record<string, number>>((acc, pubKey) => {
    acc[pubKey] = 0
    return acc
  }, {})

  Object.values(votes).forEach((votedForPubKey) => {
    if (result[votedForPubKey] === undefined) return
    result[votedForPubKey] += 1
  })

  return result
}
