"use client";
import { useRef, useState } from "react";
import { submitCaptureAction } from "@/app/actions/capture";

export function CaptureClient() {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [status, setStatus] = useState<string>("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => chunksRef.current.push(e.data);
    rec.onstop = () => setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
  }
  function stop() { recorderRef.current?.stop(); recorderRef.current?.stream.getTracks().forEach((t) => t.stop()); setRecording(false); }

  async function submit() {
    if (!audioBlob) { setStatus("Record a voice note first."); return; }
    setStatus("Saved on this device → Uploading…");
    const fd = new FormData();
    fd.set("reportDate", new Date().toISOString().slice(0, 10));
    fd.set("audio", new File([audioBlob], "audio.webm", { type: "audio/webm" }));
    photos.forEach((p) => fd.append("photos", p));
    await submitCaptureAction(fd);
  }

  return (
    <div className="space-y-4">
      <button onClick={recording ? stop : start}
        className={`h-16 w-full rounded-control text-white ${recording ? "bg-danger-700" : "bg-accent-600"}`}>
        {recording ? "Stop recording" : audioBlob ? "Re-record" : "Record voice note"}
      </button>
      {audioBlob && <audio controls src={URL.createObjectURL(audioBlob)} className="w-full" />}
      <input type="file" accept="image/*" multiple
        onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
      <p className="text-sm text-[var(--neutral-500)]">{photos.length} photo(s) attached</p>
      <button onClick={submit} className="w-full rounded-control bg-brand-700 py-3 text-white">Submit update</button>
      {status && <p className="text-sm text-warning-700">{status}</p>}
    </div>
  );
}
