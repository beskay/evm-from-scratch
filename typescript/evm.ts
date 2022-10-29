export default function evm(code: Uint8Array) {
  let MAX_UINT256 = (1n << 256n) - 1n; // 2**256 - 1

  let stack: bigint[] = [];

  for (let i = 0; i < code.length; i++) {
    //console.log(`opcode ${code[i]} and index ${i}`);
    switch (code[i]) {
      // STOP
      case 0x0: {
        return { stack: stack };
      }
      // ADD
      case 0x01: {
        // pop first two stack items
        let a = stack.shift() as bigint;
        let b = stack.shift() as bigint;

        // push result on top of the stack
        stack.unshift((a + b) & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // MUL
      case 0x02: {
        // pop first two stack items
        let a = stack.shift() as bigint;
        let b = stack.shift() as bigint;

        // push result on top of the stack
        stack.unshift((a * b) & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // SUB
      case 0x03: {
        // pop first two stack items
        let a = stack.shift() as bigint;
        let b = stack.shift() as bigint;

        // push result on top of the stack
        stack.unshift((a - b) & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // DIV
      case 0x04: {
        // pop first two stack items
        let a = stack.shift() as bigint;
        let b = stack.shift() as bigint;

        // if division by zero, return 0
        if (b == 0n) {
          stack.unshift(0n);
          break;
        }

        // push result on top of the stack
        stack.unshift((a / b) & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // SDIV
      case 0x05: {
        const a = BigInt.asIntN(32, stack.shift() as bigint);
        const b = BigInt.asIntN(32, stack.shift() as bigint);

        // if division by zero, return 0
        if (b == 0n) {
          stack.unshift(0n);
          break;
        }

        // push result on top of the stack
        stack.unshift((a / b) & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // MOD
      case 0x06: {
        // pop first two stack items
        let a = stack.shift() as bigint;
        let b = stack.shift() as bigint;

        // if mod zero, return 0
        if (b == 0n) {
          stack.unshift(0n);
          break;
        }

        // push result on top of the stack
        stack.unshift(a % b & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // SMOD
      case 0x07: {
        const a = BigInt.asIntN(32, stack.shift() as bigint);
        const b = BigInt.asIntN(32, stack.shift() as bigint);

        // if mod zero, return 0
        if (b == 0n) {
          stack.unshift(0n);
          break;
        }

        // push result on top of the stack
        stack.unshift(a % b & MAX_UINT256); // & MAX_UINT256 is the same as % MAX_UINT256 + 1
        break;
      }
      // LT
      case 0x10: {
        // pop first two stack items
        let a = stack.shift() as bigint;
        let b = stack.shift() as bigint;

        stack.unshift(a < b ? 1n : 0n);
        break;
      }
      // GT
      case 0x11: {
        // pop first two stack items
        let a = stack.shift() as bigint;
        let b = stack.shift() as bigint;

        stack.unshift(a > b ? 1n : 0n);
        break;
      }
      // SLT
      case 0x12: {
        // pop first two stack items
        const a = BigInt.asIntN(32, stack.shift() as bigint);
        const b = BigInt.asIntN(32, stack.shift() as bigint);

        stack.unshift(a < b ? 1n : 0n);
        break;
      }
      // SGT
      case 0x13: {
        // pop first two stack items
        const a = BigInt.asIntN(32, stack.shift() as bigint);
        const b = BigInt.asIntN(32, stack.shift() as bigint);

        stack.unshift(a > b ? 1n : 0n);
        break;
      }
      // EQ
      case 0x14: {
        // pop first two stack items
        let a = stack.shift() as bigint;
        let b = stack.shift() as bigint;

        stack.unshift(a === b ? 1n : 0n);
        break;
      }
      // ISZERO
      case 0x15: {
        let a = stack.shift() as bigint;

        stack.unshift(a === 0n ? 1n : 0n);
        break;
      }
      // AND
      case 0x16: {
        // pop first two stack items
        let a = stack.shift() as bigint;
        let b = stack.shift() as bigint;

        stack.unshift(a & b);
        break;
      }
      // OR
      case 0x17: {
        // pop first two stack items
        let a = stack.shift() as bigint;
        let b = stack.shift() as bigint;

        stack.unshift(a | b);
        break;
      }
      // XOR
      case 0x18: {
        // pop first two stack items
        let a = stack.shift() as bigint;
        let b = stack.shift() as bigint;

        stack.unshift(a ^ b);
        break;
      }
      // NOT
      case 0x19: {
        let a = stack.shift() as bigint;

        stack.unshift(MAX_UINT256 ^ a);
        break;
      }
      // BYTE
      case 0x1a: {
        // pop first two stack items
        let a = stack.shift() as bigint; // offset
        let b = stack.shift() as bigint; // value

        stack.unshift(a < 32 ? (b >> ((31n - a) * 8n)) & 0xffn : 0n);
        break;
      }
      // POP
      case 0x50: {
        // shift is like pop, but removes the first element in the array
        stack.shift();
        break;
      }
      // JUMP
      case 0x56: {
        let a = stack.shift() as bigint; // JUMPDEST

        // change program counter to jumpdest
        i = Number(a);
        break;
      }
      // JUMPI
      case 0x57: {
        // pop first two stack items
        let a = stack.shift() as bigint; // JUMPDEST
        let b = stack.shift() as bigint; // Condition (1 = jump, 0 = continue as usual)

        if (b != 0n) i = Number(a);
        break;
      }
      // PC
      case 0x58: {
        stack.unshift(BigInt(i));
        break;
      }
      // PUSH1
      case 0x60: {
        // unshift is like push(), except it adds elements to the beginning of an array
        stack.unshift(BigInt(code[++i])); // have to transform to bigint to append an "n"
        break;
      }
      case 0x61: {
        let tmp: string = "";
        for (let j = 0; j < 2; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x62: {
        let tmp: string = "";
        for (let j = 0; j < 3; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x63: {
        let tmp: string = "";
        for (let j = 0; j < 4; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x64: {
        let tmp: string = "";
        for (let j = 0; j < 5; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x65: {
        let tmp: string = "";
        for (let j = 0; j < 6; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x66: {
        let tmp: string = "";
        for (let j = 0; j < 7; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x67: {
        let tmp: string = "";
        for (let j = 0; j < 8; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x68: {
        let tmp: string = "";
        for (let j = 0; j < 9; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x69: {
        let tmp: string = "";
        for (let j = 0; j < 10; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6a: {
        let tmp: string = "";
        for (let j = 0; j < 11; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6b: {
        let tmp: string = "";
        for (let j = 0; j < 12; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6c: {
        let tmp: string = "";
        for (let j = 0; j < 13; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6d: {
        let tmp: string = "";
        for (let j = 0; j < 14; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6e: {
        let tmp: string = "";
        for (let j = 0; j < 15; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x6f: {
        let tmp: string = "";
        for (let j = 0; j < 16; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x70: {
        let tmp: string = "";
        for (let j = 0; j < 17; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x71: {
        let tmp: string = "";
        for (let j = 0; j < 18; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x72: {
        let tmp: string = "";
        for (let j = 0; j < 19; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x73: {
        let tmp: string = "";
        for (let j = 0; j < 20; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x74: {
        let tmp: string = "";
        for (let j = 0; j < 21; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x75: {
        let tmp: string = "";
        for (let j = 0; j < 22; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x76: {
        let tmp: string = "";
        for (let j = 0; j < 23; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x77: {
        let tmp: string = "";
        for (let j = 0; j < 24; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x78: {
        let tmp: string = "";
        for (let j = 0; j < 25; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x79: {
        let tmp: string = "";
        for (let j = 0; j < 26; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7a: {
        let tmp: string = "";
        for (let j = 0; j < 27; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7b: {
        let tmp: string = "";
        for (let j = 0; j < 28; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7c: {
        let tmp: string = "";
        for (let j = 0; j < 29; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7d: {
        let tmp: string = "";
        for (let j = 0; j < 30; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7e: {
        let tmp: string = "";
        for (let j = 0; j < 31; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      case 0x7f: {
        let tmp: string = "";
        // convert the next 32 uint8 vars to hex string and concatenate them
        for (let j = 0; j < 32; j++)
          tmp += code[++i].toString(16).padStart(2, "0");
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
        break;
      }
      // DUP1
      case 0x80: {
        stack.unshift(stack[0]);
        break;
      }
      // DUP2
      case 0x81: {
        stack.unshift(stack[1]);
        break;
      }
      // DUP3
      case 0x82: {
        stack.unshift(stack[2]);
        break;
      }
      // DUP4
      case 0x83: {
        stack.unshift(stack[3]);
        break;
      }
      // DUP5
      case 0x84: {
        stack.unshift(stack[4]);
        break;
      }
      // SWAP1
      case 0x90: {
        let tmp = stack[1];
        stack[1] = stack[0];
        stack[0] = tmp;
        break;
      }
      // SWAP2
      case 0x91: {
        let tmp = stack[2];
        stack[2] = stack[0];
        stack[0] = tmp;
        break;
      }
      // SWAP3
      case 0x92: {
        let tmp = stack[3];
        stack[3] = stack[0];
        stack[0] = tmp;
        break;
      }

      // default case for non implemented opcodes
      default: {
        break;
      }
    }
  }

  //console.log(stack);
  return { stack: stack };
}
