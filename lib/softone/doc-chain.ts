import "server-only";
import { getTable } from "./lookups";
import { walkChain } from "./doc-chain-core";

export type { ChainDoc } from "./doc-chain-core";
/** Όλα τα παραστατικά που προέκυψαν από ένα FINDOC (μόνο αναγνώσεις GetTable). */
export const docChain = (findoc: number, opts?: { maxDepth?: number; maxDocs?: number }) => walkChain(findoc, getTable, opts);
