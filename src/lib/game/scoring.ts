export const computeCharBudgets = (
  votesByPlayer: Record<string, number>,
  playerPubKeys: string[],
  charsPerPlayer: number,
  minCharFloor: number,
): Record<string, number> => {
  const playerCount = playerPubKeys.length
  if (playerCount === 0) return {}

  const totalVotes = playerPubKeys.reduce((sum, pubKey) => sum + (votesByPlayer[pubKey] ?? 0), 0)
  const roundTotalChars = charsPerPlayer * playerCount

  if (totalVotes === 0) {
    return playerPubKeys.reduce<Record<string, number>>((acc, pubKey) => {
      acc[pubKey] = charsPerPlayer
      return acc
    }, {})
  }

  if (playerCount === 1) {
    return { [playerPubKeys[0]]: charsPerPlayer }
  }

  // Inverse voting pressure with conservation of total round characters:
  // budget_i = floor + A * (1 - voteShare_i), where
  // A = n * (charsPerPlayer - floor) / (n - 1)
  // This guarantees a player with all votes gets exactly floor,
  // and sum(budget_i) remains n * charsPerPlayer before integer rounding.
  const amplitude = (playerCount * (charsPerPlayer - minCharFloor)) / (playerCount - 1)

  const rawBudgets = playerPubKeys.map((pubKey) => {
    const voteShare = (votesByPlayer[pubKey] ?? 0) / totalVotes
    return minCharFloor + amplitude * (1 - voteShare)
  })

  const baseBudgets = rawBudgets.map((value) => Math.floor(value))
  const baseTotal = baseBudgets.reduce((sum, value) => sum + value, 0)
  let remainder = roundTotalChars - baseTotal

  const withFraction = rawBudgets
    .map((value, index) => ({
      index,
      fraction: value - baseBudgets[index],
    }))
    .sort((a, b) => b.fraction - a.fraction)

  for (let i = 0; i < withFraction.length && remainder > 0; i += 1) {
    baseBudgets[withFraction[i].index] += 1
    remainder -= 1
  }

  return playerPubKeys.reduce<Record<string, number>>((acc, pubKey, index) => {
    acc[pubKey] = baseBudgets[index]
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
