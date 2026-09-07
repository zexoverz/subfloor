/// The slices of the deployment the taker touches. Written out rather than imported from build
/// artifacts, so the bot does not need the Foundry output to run.
export const ROUTER_ABI = [
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [
      { name: "order", type: "tuple", components: [
        { name: "maker", type: "address" },
        { name: "traits", type: "uint256" },
        { name: "data", type: "bytes" },
      ] },
      { name: "amount", type: "uint256" },
      { name: "takerTraitsAndData", type: "bytes" },
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOut", type: "uint256" },
      { name: "orderHash", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "swap",
    stateMutability: "payable",
    inputs: [
      { name: "order", type: "tuple", components: [
        { name: "maker", type: "address" },
        { name: "traits", type: "uint256" },
        { name: "data", type: "bytes" },
      ] },
      { name: "amount", type: "uint256" },
      { name: "takerTraitsAndData", type: "bytes" },
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOut", type: "uint256" },
      { name: "orderHash", type: "bytes32" },
    ],
  },
  {
    type: "error",
    name: "SettledBelowFloor",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "executionRate", type: "uint256" },
      { name: "floorRate", type: "uint256" },
    ],
  },
] as const;

export const AQUA_ABI = [
  {
    type: "event",
    name: "Shipped",
    inputs: [
      { name: "maker", type: "address", indexed: false },
      { name: "app", type: "address", indexed: false },
      { name: "strategyHash", type: "bytes32", indexed: false },
      { name: "strategy", type: "bytes", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Docked",
    inputs: [
      { name: "maker", type: "address", indexed: false },
      { name: "app", type: "address", indexed: false },
      { name: "strategyHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export const AGGREGATOR_ABI = [
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [
    { name: "roundId", type: "uint80" },
    { name: "answer", type: "int256" },
    { name: "startedAt", type: "uint256" },
    { name: "updatedAt", type: "uint256" },
    { name: "answeredInRound", type: "uint80" },
  ] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
