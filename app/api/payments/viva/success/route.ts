import { vivaReturn } from "@/lib/payments/viva-return";

/** Success URL της πηγής πληρωμής στη Viva: <site>/api/payments/viva/success */
export const GET = (req: Request) => vivaReturn(req, false);
