//done contract: 0x9240c584618248Ad615aBaa14d91C9B87fBd2BB6
//done 2: 0x155eB34fAC3278A77aBc9F620460239A5BF7Ac04
//done 3: 0x720c58893B1FB1164192774E3FeF976a6964eCEf
export const AUCTION_ADDRESS =
  "0x91F787324139d7204D02C15b09A0b7B2A8401F13" as const;

export const AUCTION_ABI = [
  {
    type: "function",
    name: "getCurrentPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "getRemainingTokens",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "endTime",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "finalized",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
  },
  {
    type: "function",
    name: "clearingPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "seller",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
  },
  {
    type: "function",
    name: "sellerProceeds",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "bids",
    stateMutability: "view",
    inputs: [
      {
        name: "",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "ethCommitted",
        type: "uint256",
      },
      {
        name: "tokenAmount",
        type: "uint256",
      },
      {
        name: "claimed",
        type: "bool",
      },
    ],
  },
  {
    type: "function",
    name: "getRefund",
    stateMutability: "view",
    inputs: [
      {
        name: "",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "bid",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeAuction",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawProceeds",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;