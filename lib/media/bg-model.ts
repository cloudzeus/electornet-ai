import "server-only";
import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { ensureBgModel } from "./bg-model-file";

/**
 * Αφαίρεση φόντου μέσα στην εφαρμογή: isnet-general-use (ίδιο μοντέλο με το rembg) σε onnxruntime-node, χωρίς Python.
 * Διαχείριση μνήμης (ο server μοιράζεται τη βάση με άλλα projects):
 *  - το μοντέλο τρέχει σε ΞΕΧΩΡΙΣΤΗ διεργασία (lib/media/bg-worker.mjs) που ξεκινά μόνο όταν χρειαστεί και ΚΛΕΙΝΕΙ
 *    μετά από IDLE_MS χωρίς χρήση — τότε το λειτουργικό παίρνει πίσω όλη τη μνήμη· ο server της εφαρμογής δεν μεγαλώνει·
 *  - μία φωτογραφία τη φορά (ουρά), ώς 2 threads, χωρίς memory arena — ποτέ δύο αιχμές μαζί·
 *  - όριο χρόνου ανά φωτογραφία· αν η διεργασία κολλήσει ή πέσει, κλείνει και ξαναξεκινά στην επόμενη.
 * Μετρημένο: ~2″ ανά φωτογραφία, ~0,8–0,9 GB όσο είναι ανοιχτή, 0 σε αδράνεια.
 */
const IDLE_MS = Number(process.env.BG_IDLE_MS) || 5 * 60_000, JOB_MS = 60_000;
const WORKER = path.join(process.cwd(), "lib", "media", "bg-worker.mjs");

let child: Promise<ChildProcess> | null = null;
let idle: NodeJS.Timeout | null = null;
let queue: Promise<unknown> = Promise.resolve();
let seq = 0;

function stop() {
  const c = child;
  child = null;
  void c?.then((p) => p.kill()).catch(() => {});
}

function start(): Promise<ChildProcess> {
  return ensureBgModel().then((model) => new Promise<ChildProcess>((resolve, reject) => {
    const p = fork(WORKER, [model], { serialization: "advanced", stdio: ["ignore", "ignore", "inherit", "ipc"] });
    const fail = (e: Error) => { child = null; reject(e); };
    p.once("error", fail);
    p.once("exit", (code) => fail(new Error(`η διεργασία αφαίρεσης φόντου έκλεισε (${code})`)));
    p.on("message", function ready(m: { ready?: boolean; fatal?: string }) {
      if (m.ready) { p.off("message", ready); resolve(p); }
      else if (m.fatal) fail(new Error(`μοντέλο αφαίρεσης φόντου: ${m.fatal}`));
    });
  }));
}

/** PNG με διαφάνεια (μάσκα του μοντέλου ως alpha), στην ανάλυση του πρωτοτύπου. Οι κλήσεις μπαίνουν σε σειρά. */
export function removeBackgroundLocal(bytes: Buffer): Promise<Buffer> {
  const job = queue.then(() => run(bytes));
  queue = job.catch(() => {});
  return job;
}

async function run(bytes: Buffer): Promise<Buffer> {
  if (idle) clearTimeout(idle);
  try {
    child ??= start();
    const p = await child;
    const id = ++seq;
    return await new Promise<Buffer>((resolve, reject) => {
      const done = () => { clearTimeout(timer); p.off("message", on); p.off("exit", died); };
      const died = () => { done(); reject(new Error("Η διεργασία αφαίρεσης φόντου σταμάτησε απρόσμενα.")); };
      const timer = setTimeout(() => { done(); stop(); reject(new Error("Η αφαίρεση φόντου άργησε πάνω από 60″.")); }, JOB_MS);
      function on(m: { id?: number; png?: Uint8Array; error?: string }) {
        if (m.id !== id) return;
        done();
        if (m.png) resolve(Buffer.from(m.png)); else reject(new Error(m.error ?? "Η αφαίρεση φόντου απέτυχε."));
      }
      p.on("message", on);
      p.once("exit", died);
      p.send({ id, bytes });
    });
  } finally {
    idle = setTimeout(stop, IDLE_MS);
    idle.unref();
  }
}
