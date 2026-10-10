import { vivaReturn } from "@/lib/payments/viva-return";

/** Failure URL της πηγής πληρωμής στη Viva: <site>/api/payments/viva/failure */
export const GET = (req: Request) => vivaReturn(req, true);
