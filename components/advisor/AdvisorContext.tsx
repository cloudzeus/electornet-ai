"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Dims } from "@/lib/data/dims";

export interface AdvisorProduct {
  id: string;
  brand: string;
  title: string;
  price: number;
  energy?: string;
  dims: Dims | null;
  /** ο έλεγχος «χωράει;» έχει νόημα για τον τύπο του προϊόντος */
  fit?: boolean;
  category: string;
}
interface Ctx {
  product: AdvisorProduct | null;
  setProduct: (p: AdvisorProduct | null) => void;
}
const C = createContext<Ctx | null>(null);

export function AdvisorProvider({ children }: { children: ReactNode }) {
  const [product, setProduct] = useState<AdvisorProduct | null>(null);
  const v = useMemo(() => ({ product, setProduct }), [product]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
export function useAdvisor(): Ctx {
  return useContext(C) ?? { product: null, setProduct: () => {} };
}

/** Placed by the PDP: tells the advisor which product the customer is looking at. */
export function AdvisorContext({ product }: { product: AdvisorProduct }) {
  const { setProduct } = useAdvisor();
  useEffect(() => {
    const t = setTimeout(() => setProduct(product), 0);
    return () => {
      clearTimeout(t);
      setProduct(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);
  return null;
}
