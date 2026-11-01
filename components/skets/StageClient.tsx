"use client";

import dynamic from "next/dynamic";

/** Η σκηνή μόνο στον browser: κανένα style attribute στο HTML του server (CSP) και ήχος/χάρτης που θέλουν window. */
const StageClient = dynamic(() => import("./Stage"), { ssr: false });
export default StageClient;
