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
      // POP
      case 0x50: {
        // shift is like pop, but removes the first element in the array
        stack.shift();
        break;
      }
      // PUSH1
      case 0x60: {
        // unshift is like push(), except it adds elements to the beginning of an array
        stack.unshift(BigInt(code[++i])); // have to transform to bigint to append an "n"
        break;
      }
      // PUSH32
      case 0x7f: {
        let tmp: string = "";
        // convert the next 32 uint8 vars to hex string and concatenate them
        for (let j = 0; j < 32; j++) tmp += code[++i].toString(16);
        // convert from hex string to bigint and push to stack
        stack.unshift(BigInt(`0x${tmp}`));
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
