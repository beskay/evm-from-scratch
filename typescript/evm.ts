export default function evm(code: Uint8Array) {
  let stack: bigint[] = [];

  for (let i = 0; i < code.length; i++) {
    console.log(`opcode ${code[i]} and index ${i}`);
    switch (code[i]) {
      // STOP
      case 0x0: {
        return { stack: stack };
      }
      // ADD
      case 0x01: {
        // pop first two stack items
        let a = stack.shift();
        let b = stack.shift();

        // if vars are undefined, set result to zero
        let res: bigint;
        if (a != undefined && b != undefined) res = a + b;
        else res = 0n;

        // push result on top of the stack
        stack.unshift(res);
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
      // default case for non implemented opcodes
      default: {
        break;
      }
    }
  }

  console.log(stack);
  return { stack: stack };
}
