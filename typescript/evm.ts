const keccak256 = require("keccak256");
const rlp = require("rlp");

const MAX_UINT256 = (1n << 256n) - 1n; // 2**256 - 1

interface Transaction {
  to: string;
  from: string;
  origin: string;
  gasprice: string;
  value: string;
  data: string;
}

interface WorldState {
  [address: string]: AccountState;
}

interface AccountState {
  balance: string;
  code: { asm: string; bin: string };
  nonce: string;
  storage: string;
}

interface Block {
  coinbase: string;
  timestamp: string;
  number: string;
  difficulty: string;
  gaslimit: string;
  chainid: string;
}

// returndata can be undefined
interface ReturnData {
  success?: boolean;
  return?: string;
}

class State {
  worldState = new Map();

  init(state: WorldState) {
    for (const [key, value] of Object.entries(state)) {
      this.worldState.set(key, value);
    }
  }

  // CREATE
  createAccount(key: string, value: AccountState) {
    this.worldState.set(key, value);
  }

  accountState(address: string): AccountState {
    // check if defined, if yes return balance
    let accountState: AccountState = this.worldState.get(address);

    return accountState !== undefined
      ? accountState
      : {
          balance: "0x00",
          code: { asm: "", bin: "" },
          nonce: "0x00",
          storage: "0x00",
        };
  }
}

class Storage {
  storage = new Map();

  store(key: bigint, value: bigint) {
    this.storage.set(key, value);
  }

  load(key: bigint): bigint {
    let value = this.storage.get(key);
    return value === undefined ? 0n : value;
  }
}

class Stack {
  stack: bigint[] = [];

  pop(): bigint {
    if (this.stack.length === 0) throw new Error("Stack underflow");
    // shift is like pop, but removes the first element in the array
    return this.stack.shift() as bigint;
  }

  push(value: bigint) {
    if (value < 0n || value > MAX_UINT256) throw new Error("Invalid value");
    if (this.stack.length + 1 > 1024) throw new Error("MAX_STACK_DEPTH");

    // unshift is like push(), except it adds elements to the beginning of an array
    this.stack.unshift(value);
  }
}

class Memory {
  memory: bigint[] = [];

  // MSTORE8
  store(offset: bigint, value: bigint) {
    if (offset < 0n || offset > MAX_UINT256) throw new Error("Invalid offset");
    if (value < 0n || value > 255) throw new Error("Invalid byte");
    this.check_expand(offset);

    this.memory[Number(offset)] = value;
  }

  // MSTORE
  store_word(offset: bigint, value: bigint) {
    if (offset < 0n || offset > MAX_UINT256) throw new Error("Invalid offset");
    if (value < 0n || value > MAX_UINT256) throw new Error("Invalid word");

    this.check_expand(offset + 31n);

    for (let i = 0; i < 32; i++) {
      this.memory[Number(offset) + 31 - i] =
        (value & (0xffn << (BigInt(i) * 8n))) >> (BigInt(i) * 8n);
    }
  }

  // MLOAD
  // load 32 bytes starting from offset
  load(offset: bigint): bigint {
    if (offset < 0n || offset > MAX_UINT256) throw new Error("Invalid offset");
    this.check_expand(offset + 31n);

    let tmp: string = "";
    for (let i = offset; i < offset + 32n; i++) {
      tmp += this.memory[Number(i)].toString(16).padStart(2, "0");
    }
    return BigInt(`0x${tmp}`);
  }

  // load a single byte from memory
  load_byte(offset: bigint): bigint {
    if (offset < this.size()) return BigInt(this.memory[Number(offset)]);
    else return 0n;
  }

  // memory is increased in chunks of 32 bytes
  // https://docs.soliditylang.org/en/latest/introduction-to-smart-contracts.html#storage-memory-and-the-stack
  // https://www.evm.codes/about#memoryexpansion
  check_expand(offset: bigint) {
    if (offset < this.size()) return;

    // divide offset by 32 and take the whole number, e.g. 65 / 32 => 2
    let wordAccessed: number = parseInt((offset / 32n).toString()); // 1 word = 32 bytes

    // increase by 32 bytes
    let newSizeInBytes: number = (wordAccessed + 1) * 32;
    let currentSizeInBytes: bigint = this.size();
    for (let i = 0; i < newSizeInBytes - Number(currentSizeInBytes); i++)
      this.memory.push(0x00n);

    // make sure length is multiple of 32
    if (this.memory.length % 32 !== 0) throw new Error("invalid memory length");
  }

  // returns the memory size in bytes
  // each index is a 8 bit word, so 1 byte
  size(): bigint {
    return BigInt(this.memory.length);
  }
}

class Calldata {
  calldata = new Uint8Array();

  init(data: string) {
    this.calldata = new Uint8Array(
      (data?.match(/../g) || []).map((byte) => parseInt(byte, 16))
    );
  }

  // CALLDATALOAD
  // load 32 bytes starting from offset
  load(offset: bigint): bigint {
    if (offset < 0n || offset > MAX_UINT256) throw new Error("Invalid offset");

    let tmp: string = "";
    for (let i = offset; i < offset + 32n; i++) {
      if (i < this.size())
        tmp += this.calldata[Number(i)].toString(16).padStart(2, "0");
      else tmp += "00";
    }
    return BigInt(`0x${tmp}`);
  }

  // load a single byte from calldata
  load_byte(offset: bigint): bigint {
    if (offset < this.size()) return BigInt(this.calldata[Number(offset)]);
    else return 0n;
  }

  // returns the calldata size in bytes
  size(): bigint {
    return BigInt(this.calldata.length);
  }
}

export default function evm(
  code: Uint8Array,
  tx: Transaction,
  _state: WorldState,
  block: Block
) {
  const state = new State();
  if (_state !== undefined) {
    state.init(_state);
  }

  const stor = new Storage();
  const stk = new Stack();
  const mem = new Memory();

  const calldata = new Calldata();
  if (tx !== undefined) calldata.init(tx.data);

  // define return data
  const returnData: ReturnData = { success: undefined, return: undefined };

  for (let pc = 0; pc < code.length; pc++) {
    //console.log(`opcode ${code[pc]} and index ${pc}`);
    switch (code[pc]) {
      // STOP
      case 0x0: {
        // exit the current context successfully if address with no code is called
        if (pc === code.length - 1) returnData.success = true;
        return { stack: stk.stack, returnData: returnData };
      }
      // ADD
      case 0x01: {
        // pop first two stack items
        let a = stk.pop();
        let b = stk.pop();

        // push result on top of the stack
        stk.push((a + b) & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // MUL
      case 0x02: {
        // pop first two stack items
        let a = stk.pop();
        let b = stk.pop();

        // push result on top of the stack
        stk.push((a * b) & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // SUB
      case 0x03: {
        // pop first two stack items
        let a = stk.pop();
        let b = stk.pop();

        // push result on top of the stack
        stk.push((a - b) & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // DIV
      case 0x04: {
        // pop first two stack items
        let a = stk.pop();
        let b = stk.pop();

        // if division by zero, return 0
        if (b === 0n) {
          stk.push(0n);
          break;
        }

        // push result on top of the stack
        stk.push((a / b) & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // SDIV
      case 0x05: {
        const a = BigInt.asIntN(32, stk.pop());
        const b = BigInt.asIntN(32, stk.pop());

        // if division by zero, return 0
        if (b === 0n) {
          stk.push(0n);
          break;
        }

        // push result on top of the stack
        stk.push((a / b) & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // MOD
      case 0x06: {
        // pop first two stack items
        let a = stk.pop();
        let b = stk.pop();

        // if mod zero, return 0
        if (b === 0n) {
          stk.push(0n);
          break;
        }

        // push result on top of the stack
        stk.push(a % b & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // SMOD
      case 0x07: {
        const a = BigInt.asIntN(32, stk.pop());
        const b = BigInt.asIntN(32, stk.pop());

        // if mod zero, return 0
        if (b === 0n) {
          stk.push(0n);
          break;
        }

        // push result on top of the stack
        stk.push(a % b & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // LT
      case 0x10: {
        // pop first two stack items
        let a = stk.pop();
        let b = stk.pop();

        stk.push(a < b ? 1n : 0n);
        break;
      }
      // GT
      case 0x11: {
        // pop first two stack items
        let a = stk.pop();
        let b = stk.pop();

        stk.push(a > b ? 1n : 0n);
        break;
      }
      // SLT
      case 0x12: {
        // pop first two stack items
        const a = BigInt.asIntN(32, stk.pop());
        const b = BigInt.asIntN(32, stk.pop());

        stk.push(a < b ? 1n : 0n);
        break;
      }
      // SGT
      case 0x13: {
        // pop first two stack items
        const a = BigInt.asIntN(32, stk.pop());
        const b = BigInt.asIntN(32, stk.pop());

        stk.push(a > b ? 1n : 0n);
        break;
      }
      // EQ
      case 0x14: {
        // pop first two stack items
        let a = stk.pop();
        let b = stk.pop();

        stk.push(a === b ? 1n : 0n);
        break;
      }
      // ISZERO
      case 0x15: {
        let a = stk.pop();

        stk.push(a === 0n ? 1n : 0n);
        break;
      }
      // AND
      case 0x16: {
        // pop first two stack items
        let a = stk.pop();
        let b = stk.pop();

        stk.push(a & b);
        break;
      }
      // OR
      case 0x17: {
        // pop first two stack items
        let a = stk.pop();
        let b = stk.pop();

        stk.push(a | b);
        break;
      }
      // XOR
      case 0x18: {
        // pop first two stack items
        let a = stk.pop();
        let b = stk.pop();

        stk.push(a ^ b);
        break;
      }
      // NOT
      case 0x19: {
        let a = stk.pop();

        stk.push(MAX_UINT256 ^ a);
        break;
      }
      // BYTE
      case 0x1a: {
        // pop first two stack items
        let a = stk.pop(); // offset
        let b = stk.pop(); // value

        stk.push(a < 32 ? (b >> ((31n - a) * 8n)) & 0xffn : 0n);
        break;
      }
      // SHA3
      case 0x20: {
        // pop first two stack items
        let a = stk.pop(); // offset
        let b = stk.pop(); // byte size to read from memory

        let value = mem.load(a);
        let bytesToHash = value >> ((32n - b) * 8n);

        // convert bigint value to hex string and hash it
        let hash = keccak256(`0x${bytesToHash.toString(16)}`).toString("hex");
        // convert hash string back to bigint and push to stack
        stk.push(BigInt(`0x${hash}`));

        break;
      }
      // ADDRESS
      case 0x30: {
        stk.push(BigInt(tx.to));
        break;
      }
      // BALANCE
      case 0x31: {
        let a = stk.pop(); // address

        // convert to hex string
        let address = a.toString(16).padStart(40, "0");
        let accountState: AccountState = state.accountState(`0x${address}`);

        stk.push(BigInt(accountState.balance));
        break;
      }
      // ORIGIN
      case 0x32: {
        stk.push(BigInt(tx.origin));
        break;
      }
      // CALLER
      case 0x33: {
        stk.push(BigInt(tx.from));
        break;
      }
      // CALLVALUE
      case 0x34: {
        stk.push(BigInt(tx.value));
        break;
      }
      // CALLDATALOAD
      case 0x35: {
        let a = stk.pop(); // offset
        stk.push(BigInt(calldata.load(a)));
        break;
      }
      // CALLDATASIZE
      case 0x36: {
        stk.push(calldata.size());
        break;
      }
      // CALLDATACOPY
      case 0x37: {
        let a = stk.pop(); // destOffset (byte offset in memory)
        let b = stk.pop(); // offset (byte offset in the calldata to copy)
        let c = stk.pop(); // size (byte size to copy)

        for (let i = 0; i < Number(c); i++) {
          mem.store(a++, calldata.load_byte(b++));
        }
        break;
      }
      // CODESIZE
      case 0x38: {
        stk.push(BigInt(code.length));
        break;
      }
      // CODECOPY
      case 0x39: {
        let a = stk.pop(); // destOffset (byte offset in memory)
        let b = stk.pop(); // offset (byte offset in the code to copy)
        let c = stk.pop(); // size (byte size to copy)

        for (let i = 0; i < Number(c); i++) {
          let byteToStore: number | undefined = code[Number(b) + i];

          // if undefined, store 0n
          mem.store(a++, byteToStore === undefined ? 0n : BigInt(byteToStore));
        }
        break;
      }
      // GASPRICE
      case 0x3a: {
        stk.push(BigInt(tx.gasprice));
        break;
      }
      // EXTCODESIZE
      case 0x3b: {
        let a = stk.pop(); // address to query

        // convert to hex string
        let address = a.toString(16).padStart(40, "0");

        // divide hex string length by 2 to get size in bytes
        stk.push(
          BigInt(state.accountState(`0x${address}`).code.bin.length / 2)
        );
        break;
      }
      // EXTCODECOPY
      case 0x3c: {
        let a = stk.pop(); // address to query
        let b = stk.pop(); // destOffset (byte offset in memory)
        let c = stk.pop(); // offset (byte offset in the code to copy)
        let d = stk.pop(); // size (byte size to copy)

        // convert to hex string
        let address = a.toString(16).padStart(40, "0");
        // convert code to uint8array
        let codeAsString = state.accountState(`0x${address}`).code.bin;
        let codeAsArray = new Uint8Array(
          (codeAsString?.match(/../g) || []).map((byte) => parseInt(byte, 16))
        );

        for (let i = 0; i < Number(d); i++) {
          let byteToStore: number | undefined = codeAsArray[Number(c) + i];

          // if undefined, store 0n
          mem.store(b++, byteToStore === undefined ? 0n : BigInt(byteToStore));
        }
        break;
      }
      // COINBASE
      case 0x41: {
        stk.push(BigInt(block.coinbase));
        break;
      }
      // TIMESTAMP
      case 0x42: {
        stk.push(BigInt(block.timestamp));
        break;
      }
      // NUMBER
      case 0x43: {
        stk.push(BigInt(block.number));
        break;
      }
      // DIFFICULTY
      case 0x44: {
        stk.push(BigInt(block.difficulty));
        break;
      }
      // GASLIMIT
      case 0x45: {
        stk.push(BigInt(block.gaslimit));
        break;
      }
      // CHAINID
      case 0x46: {
        stk.push(BigInt(block.chainid));
        break;
      }
      // SELFBALANCE
      case 0x47: {
        stk.push(BigInt(state.accountState(tx.to).balance));
        break;
      }
      // POP
      case 0x50: {
        stk.pop();
        break;
      }
      // MLOAD
      case 0x51: {
        let a = stk.pop(); // offset

        stk.push(mem.load(a));
        break;
      }
      // MSTORE
      case 0x52: {
        let a = stk.pop(); // offset
        let b = stk.pop(); // value

        mem.store_word(a, b);
        break;
      }
      // MSTORE8
      case 0x53: {
        let a = stk.pop(); // offset
        let b = stk.pop(); // value

        mem.store(a, b);
        break;
      }
      // SLOAD
      case 0x54: {
        let a = stk.pop(); // key
        stk.push(stor.load(a));
        break;
      }
      // SSTORE
      case 0x55: {
        let a = stk.pop(); // key
        let b = stk.pop(); // key

        stor.store(a, b);
        break;
      }
      // MSIZE
      case 0x59: {
        stk.push(mem.size());
        break;
      }
      // JUMP
      case 0x56: {
        let a = stk.pop(); // JUMPDEST

        // change program counter to jumpdest
        pc = Number(a);
        break;
      }
      // JUMPI
      case 0x57: {
        // pop first two stack items
        let a = stk.pop(); // JUMPDEST
        let b = stk.pop(); // Condition (1 = jump, 0 = continue as usual)

        if (b !== 0n) pc = Number(a);
        break;
      }
      // PC
      case 0x58: {
        stk.push(BigInt(pc));
        break;
      }
      // JUMPDEST
      case 0x5b: {
        // Mark a valid destination for JUMP or JUMPI
        // This operation has no effect on machine state during execution.
        break;
      }
      // PUSH1
      case 0x60: {
        stk.push(BigInt(code[++pc])); // have to transform to bigint to append an "n"
        break;
      }
      case 0x61: {
        let tmp: string = "";
        for (let j = 0; j < 2; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x62: {
        let tmp: string = "";
        for (let j = 0; j < 3; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x63: {
        let tmp: string = "";
        for (let j = 0; j < 4; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x64: {
        let tmp: string = "";
        for (let j = 0; j < 5; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x65: {
        let tmp: string = "";
        for (let j = 0; j < 6; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x66: {
        let tmp: string = "";
        for (let j = 0; j < 7; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x67: {
        let tmp: string = "";
        for (let j = 0; j < 8; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x68: {
        let tmp: string = "";
        for (let j = 0; j < 9; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x69: {
        let tmp: string = "";
        for (let j = 0; j < 10; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6a: {
        let tmp: string = "";
        for (let j = 0; j < 11; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6b: {
        let tmp: string = "";
        for (let j = 0; j < 12; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6c: {
        let tmp: string = "";
        for (let j = 0; j < 13; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6d: {
        let tmp: string = "";
        for (let j = 0; j < 14; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6e: {
        let tmp: string = "";
        for (let j = 0; j < 15; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6f: {
        let tmp: string = "";
        for (let j = 0; j < 16; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x70: {
        let tmp: string = "";
        for (let j = 0; j < 17; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x71: {
        let tmp: string = "";
        for (let j = 0; j < 18; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x72: {
        let tmp: string = "";
        for (let j = 0; j < 19; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x73: {
        let tmp: string = "";
        for (let j = 0; j < 20; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x74: {
        let tmp: string = "";
        for (let j = 0; j < 21; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x75: {
        let tmp: string = "";
        for (let j = 0; j < 22; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x76: {
        let tmp: string = "";
        for (let j = 0; j < 23; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x77: {
        let tmp: string = "";
        for (let j = 0; j < 24; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x78: {
        let tmp: string = "";
        for (let j = 0; j < 25; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x79: {
        let tmp: string = "";
        for (let j = 0; j < 26; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7a: {
        let tmp: string = "";
        for (let j = 0; j < 27; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7b: {
        let tmp: string = "";
        for (let j = 0; j < 28; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7c: {
        let tmp: string = "";
        for (let j = 0; j < 29; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7d: {
        let tmp: string = "";
        for (let j = 0; j < 30; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7e: {
        let tmp: string = "";
        for (let j = 0; j < 31; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7f: {
        let tmp: string = "";
        // convert the next 32 uint8 vars to hex string and concatenate them
        for (let j = 0; j < 32; j++)
          tmp += code[++pc].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stk.push(BigInt(`0x${tmp}`));
        break;
      }
      // DUP1
      case 0x80: {
        stk.push(stk.stack[0]);
        break;
      }
      // DUP2
      case 0x81: {
        stk.push(stk.stack[1]);
        break;
      }
      // DUP3
      case 0x82: {
        stk.push(stk.stack[2]);
        break;
      }
      // DUP4
      case 0x83: {
        stk.push(stk.stack[3]);
        break;
      }
      // DUP5
      case 0x84: {
        stk.push(stk.stack[4]);
        break;
      }
      // SWAP1
      case 0x90: {
        let tmp = stk.stack[1];
        stk.stack[1] = stk.stack[0];
        stk.stack[0] = tmp;
        break;
      }
      // SWAP2
      case 0x91: {
        let tmp = stk.stack[2];
        stk.stack[2] = stk.stack[0];
        stk.stack[0] = tmp;
        break;
      }
      // SWAP3
      case 0x92: {
        let tmp = stk.stack[3];
        stk.stack[3] = stk.stack[0];
        stk.stack[0] = tmp;
        break;
      }
      // CREATE
      case 0xf0: {
        let a = stk.pop(); // value in wei to send to new account
        let b = stk.pop(); // byte offset in memory, initialisation code
        let c = stk.pop(); // byte size to copy, size of initialisation code

        // calculate address of new account
        let nonce: number = Number(state.accountState(tx.to).nonce);
        let address = `0x${keccak256(rlp.encode([tx.to, nonce]))
          .toString("hex")
          .slice(24)}`;
        console.log(address);

        // creation code
        let creationCodeAsString: string = "";
        for (let i = 0; i < Number(c); i++) {
          creationCodeAsString += mem
            .load_byte(b++)
            .toString(16)
            .padStart(2, "0");
        }
        let codeAsBytes = new Uint8Array(
          (creationCodeAsString?.match(/../g) || []).map((byte) =>
            parseInt(byte, 16)
          )
        );

        // call EVM with subcontext
        let result = evm(codeAsBytes, tx, _state, block);
        console.log(result);

        // store return data as runtime code
        let createState: AccountState = {
          balance: a.toString(),
          code: {
            asm: "",
            bin:
              result.returnData.return === undefined
                ? "0x00"
                : result.returnData.return,
          },
          nonce: "0x00",
          storage: "0x00",
        };
        console.log(createState.code.bin);
        // create new account
        state.createAccount(address, createState);

        // push address of the deployed contract, 0 if the deployment failed.
        stk.push(result.returnData.success === false ? 0n : BigInt(address));
        break;
      }
      // CALL
      case 0xf1: {
        let a = stk.pop(); // gas to forward
        let b = stk.pop(); // address to call
        let c = stk.pop(); // value to send
        let d = stk.pop(); // byte offset in memory (call data in sub context)
        let e = stk.pop(); // byte size to copy (size of calldata)
        let f = stk.pop(); // byte offset in memory (where to store return data)
        let g = stk.pop(); // byte size to copy (size of return data)

        // create sub context calldata
        let subCallAsString: string = "";
        for (let i = 0; i < Number(e); i++) {
          subCallAsString += mem
            .load_byte(d++)
            .toString(16)
            .padStart(2, "0");
        }

        // create subcontext tx
        let subTx: Transaction = {
          to: `0x${b.toString(16).padStart(40, "0")}`,
          from: tx !== undefined ? tx.to : "0x00",
          origin: tx !== undefined ? tx.origin : "0x00",
          gasprice: tx !== undefined ? tx.gasprice : "0x00",
          value: c.toString(16),
          data: subCallAsString,
        };

        // address to call
        let address = b.toString(16).padStart(40, "0");
        let subContextCode = state.accountState(`0x${address}`).code.bin;
        let subContextCodeAsUint8 = new Uint8Array(
          (subContextCode?.match(/../g) || []).map((byte) => parseInt(byte, 16))
        );

        // call EVM with subcontext
        let result = evm(subContextCodeAsUint8, subTx, _state, block);

        // convert return string to byte array
        let returnAsBytes = new Uint8Array(
          (result.returnData.return?.match(/../g) || []).map((byte) =>
            parseInt(byte, 16)
          )
        );
        // store byte array in memory
        for (let i = 0; i < Number(g); i++) {
          let byteToStore: number | undefined = returnAsBytes[i];
          // if undefined, store 0n
          mem.store(f++, byteToStore === undefined ? 0n : BigInt(byteToStore));
        }

        // push 0 if sub context reverted, 1 otherwise
        stk.push(result.returnData.success ? 1n : 0n);

        break;
      }
      // RETURN
      case 0xf3: {
        let a = stk.pop(); // offset (byte offset in the memory to copy)
        let b = stk.pop(); // size (byte size to copy)

        let tmp: string = "";
        for (let i = 0; i < Number(b); i++) {
          tmp += mem
            .load_byte(a++)
            .toString(16)
            .padStart(2, "0");
        }

        // exits successfully
        returnData.success = true;
        returnData.return = tmp;

        return { stack: stk.stack, returnData: returnData };
      }
      // REVERT
      case 0xfd: {
        let a = stk.pop(); // offset (byte offset in the memory to copy)
        let b = stk.pop(); // size (byte size to copy)

        let tmp: string = "";
        for (let i = 0; i < Number(b); i++) {
          tmp += mem
            .load_byte(a++)
            .toString(16)
            .padStart(2, "0");
        }

        returnData.success = false;
        returnData.return = tmp;

        return { stack: stk.stack, returnData: returnData };
      }
      // default case for non implemented opcodes
      default: {
        throw new Error("Unimplemented opcode");
      }
    }
  }

  //console.log(stk.stack);
  return { stack: stk.stack, returnData: returnData };
}
