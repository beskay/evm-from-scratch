import { expect, test } from "@jest/globals";
import evm from "./evm";
import tests from "../evm.json";

for (const t of tests as any) {
  test(t.name, () => {
    // Note: as the test cases get more complex, you'll need to modify this
    // to pass down more arguments to the evm function (e.g. block, state, etc.)
    // and return more data (e.g. state, logs, etc.)
    const result = evm(
      hexStringToUint8Array(t.code.bin),
      t.tx,
      t.state,
      t.block
    );

    if (t.expect.stack !== undefined)
      expect(result.stack).toEqual(t.expect.stack.map((item) => BigInt(item)));
    if (t.expect.success !== undefined)
      expect(result.returnData.success).toEqual(t.expect.success);
    if (t.expect.return !== undefined)
      expect(result.returnData.return).toEqual(t.expect.return);
  });
}

function hexStringToUint8Array(hexString: string) {
  return new Uint8Array(
    (hexString?.match(/../g) || []).map((byte) => parseInt(byte, 16))
  );
}
