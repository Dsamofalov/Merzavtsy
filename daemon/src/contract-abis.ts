export const IDENTITY_ABI = [
  { type: "function", name: "world", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "birth", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "tokenId", type: "uint256" }] },
  { type: "function", name: "tokenOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "tokenId", type: "uint256" }] },
  {
    type: "event", name: "Born", anonymous: false,
    inputs: [
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "genomeSeed", type: "bytes32" },
      { indexed: false, name: "birthBlock", type: "uint64" },
      { indexed: false, name: "birthTimestamp", type: "uint64" },
    ],
  },
] as const;

const CREATURE_STATE_COMPONENTS = [
  { name: "xp", type: "uint64" }, { name: "level", type: "uint16" },
  { name: "lastActivityAt", type: "uint40" }, { name: "lastLifeTickAt", type: "uint40" },
  { name: "stage", type: "uint8" }, { name: "hibernating", type: "bool" },
  { name: "aggression", type: "uint16" }, { name: "curiosity", type: "uint16" },
  { name: "sociability", type: "uint16" }, { name: "greed", type: "uint16" },
  { name: "stability", type: "uint16" }, { name: "chaos", type: "uint16" },
  { name: "adaptability", type: "uint16" }, { name: "memoryBias", type: "uint16" },
  { name: "energy", type: "uint16" }, { name: "mood", type: "uint16" },
  { name: "boredom", type: "uint16" }, { name: "stress", type: "uint16" },
  { name: "socialNeed", type: "uint16" },
] as const;

const EXTENDED_NEEDS_COMPONENTS = [
  { name: "arousal", type: "uint16" },
  { name: "stabilityState", type: "uint16" },
] as const;

const RELATIONSHIP_COMPONENTS = [
  { name: "affinity", type: "int16" }, { name: "trust", type: "int16" },
  { name: "fear", type: "uint16" }, { name: "respect", type: "uint16" },
  { name: "envy", type: "uint16" }, { name: "rivalry", type: "uint16" },
  { name: "interactionCount", type: "uint32" }, { name: "lastInteractionAt", type: "uint40" },
] as const;

export const WORLD_ABI = [
  { type: "function", name: "oracle", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "stateOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: CREATURE_STATE_COMPONENTS }] },
  { type: "function", name: "extendedNeedsOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: EXTENDED_NEEDS_COMPONENTS }] },
  { type: "function", name: "relationshipOf", stateMutability: "view", inputs: [{ name: "actorTokenId", type: "uint256" }, { name: "targetTokenId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: RELATIONSHIP_COMPONENTS }] },
  { type: "function", name: "mutationCounters", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint32[4]" }] },
  { type: "function", name: "memoryCapacity", stateMutability: "pure", inputs: [{ name: "level", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "visibleTraitSlots", stateMutability: "pure", inputs: [{ name: "level", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "intentUnlocked", stateMutability: "pure", inputs: [{ name: "level", type: "uint256" }, { name: "intent", type: "uint8" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "lifeTick", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [] },
] as const;

const ACTIVITY_ATTESTATION_COMPONENTS = [
  { name: "wallet", type: "address" }, { name: "tokenId", type: "uint256" },
  { name: "chainId", type: "uint256" }, { name: "fromBlock", type: "uint64" },
  { name: "toBlock", type: "uint64" }, { name: "epochId", type: "bytes32" },
  { name: "activityDigest", type: "bytes32" }, { name: "xpDelta", type: "uint64" },
  { name: "personalityDeltas", type: "int16[8]" }, { name: "needDeltas", type: "int16[5]" },
  { name: "categoryCounters", type: "uint16[10]" }, { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

const MUTATION_METRICS_COMPONENTS = [
  { name: "wallet", type: "address" }, { name: "tokenId", type: "uint256" },
  { name: "chainId", type: "uint256" }, { name: "epochId", type: "bytes32" },
  { name: "activityDigest", type: "bytes32" }, { name: "mutationCounters", type: "uint16[4]" },
  { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
] as const;

const PEER_ATTESTATION_COMPONENTS = [
  { name: "actorWallet", type: "address" }, { name: "actorTokenId", type: "uint256" },
  { name: "peerWallet", type: "address" }, { name: "peerTokenId", type: "uint256" },
  { name: "chainId", type: "uint256" }, { name: "blockNumber", type: "uint64" },
  { name: "encounterDigest", type: "bytes32" }, { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

export const ORACLE_ABI = [
  { type: "function", name: "identity", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "world", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "mutationNonces", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "peerNonces", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "processedEpoch", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }, { name: "epochId", type: "bytes32" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "processedMutationEpoch", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }, { name: "epochId", type: "bytes32" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "processedPeerEncounter", stateMutability: "view", inputs: [{ name: "encounterDigest", type: "bytes32" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "submit", stateMutability: "nonpayable", inputs: [{ name: "attestation", type: "tuple", components: ACTIVITY_ATTESTATION_COMPONENTS }, { name: "signature", type: "bytes" }], outputs: [] },
  { type: "function", name: "submitMutationMetrics", stateMutability: "nonpayable", inputs: [{ name: "attestation", type: "tuple", components: MUTATION_METRICS_COMPONENTS }, { name: "signature", type: "bytes" }], outputs: [] },
  { type: "function", name: "submitPeer", stateMutability: "nonpayable", inputs: [{ name: "attestation", type: "tuple", components: PEER_ATTESTATION_COMPONENTS }, { name: "signature", type: "bytes" }], outputs: [] },
] as const;
