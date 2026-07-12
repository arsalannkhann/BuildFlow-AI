import { CaptureClient } from "./CaptureClient";
export default function CapturePage() {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-4 text-xl font-bold text-brand-900">Record update</h1>
      <CaptureClient />
    </main>
  );
}
