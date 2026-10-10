/** Η φωτογραφία-ετικέτα του EPREL στη γκαλερί (το όνομα του αρχείου ξεκινά «eprel-label-»). Δεν είναι φωτογραφία του προϊόντος: όχι για AR, όχι στις μετρήσεις. */
export const isEprelLabelUrl = (u: string | null | undefined) => !!u && /\/[^/]*-eprel-label-[^/]*$/.test(u);
