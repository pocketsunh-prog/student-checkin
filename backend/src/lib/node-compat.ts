/**
 * Node.js 26 compatibility shims.
 *
 * TensorFlow.js Node 4.22 (still the latest release) calls the legacy
 * `util.isNullOrUndefined()` helper, which Node.js 23+ removed. TFJS is loaded
 * lazily only for the `human` face provider, but the shim is imported by the
 * server entrypoint and by `face/human.ts` so it is always installed before
 * `@tensorflow/tfjs-node` is required. The shim has no effect on older Node
 * versions, where the function still exists.
 */
import util from 'node:util';

type LegacyUtil = typeof util & {
  isNullOrUndefined?: (value: unknown) => boolean;
};

const legacyUtil = util as LegacyUtil;

if (typeof legacyUtil.isNullOrUndefined !== 'function') {
  legacyUtil.isNullOrUndefined = (value: unknown): boolean => value === null || value === undefined;
}
