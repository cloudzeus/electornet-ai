import "server-only";
import { getTable } from "./lookups";
import { findRoot, walkChain } from "./doc-chain-core";

export type { ChainDoc } from "./doc-chain-core";
/** Όλα τα παραστατικά που προέκυψαν από ένα FINDOC (μόνο αναγνώσεις GetTable). */
export const docChain = (findoc: number, opts?: { maxDepth?: number; maxDocs?: number }) => walkChain(findoc, getTable, opts);
/** Η αρχική παραγγελία ενός παραστατικού (για να φαίνεται και ό,τι έγινε πριν από αυτό). */
export const docRoot = (findoc: number) => findRoot(findoc, getTable);
