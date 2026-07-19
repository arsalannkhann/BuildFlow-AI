"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { submitCaptureAction } from "@/app/actions/capture";

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function CaptureClient({ reportDate }: { reportDate: string }) {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const audioUrl = useMemo(() => (audioBlob ? URL.createObjectURL(audioBlob) : ""), [audioBlob]);
  const photoPreviews = useMemo(
    () => photos.map((photo) => ({ file: photo, url: URL.createObjectURL(photo) })),
    [photos],
  );

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  useEffect(() => () => {
    photoPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [photoPreviews]);

  useEffect(() => () => {
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  async function start() {
    setError("");
    setStatus("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording is not available in this browser. Try a current mobile browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      setAudioBlob(null);
      setSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
      };
      recorder.onerror = () => {
        setError("The recording stopped unexpectedly. Your photos are still safe.");
        setRecording(false);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Microphone access was blocked. Allow microphone access and try again.");
    }
  }

  function stop() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.stop();
    recorder.stream.getTracks().forEach((track) => track.stop());
    setRecording(false);
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
  }

  async function submit() {
    if (!audioBlob) {
      setError("Record a voice note before submitting the update.");
      return;
    }

    setError("");
    setSubmitting(true);
    setStatus("Saved safely · Uploading your update…");
    const formData = new FormData();
    formData.set("reportDate", reportDate);
    formData.set("audio", new File([audioBlob], "site-update.webm", { type: "audio/webm" }));
    photos.forEach((photo) => formData.append("photos", photo));
    const note = document.querySelector<HTMLTextAreaElement>("#capture-note")?.value.trim();
    if (note) formData.set("note", note);

    try {
      await submitCaptureAction(formData);
    } catch {
      setSubmitting(false);
      setStatus("");
      setError("We couldn’t upload the update. Your recording is still here—please try again.");
    }
  }

  return (
    <div className="capture-workspace">
      <section className={`voice-card surface-card ${recording ? "voice-card--recording" : ""}`}>
        <div className="capture-section-label">
          <span>1</span>
          <div>
            <strong>Voice update</strong>
            <small>Usually takes less than 90 seconds</small>
          </div>
          {audioBlob && !recording && <em>Recorded</em>}
        </div>

        <div className="voice-card__center">
          <button
            type="button"
            onClick={recording ? stop : start}
            aria-pressed={recording}
            className={`record-orb ${recording ? "record-orb--active" : ""}`}
          >
            <span className={recording ? "stop-square" : "css-microphone"} aria-hidden="true" />
            <span className="sr-only">
              {recording ? "Stop recording" : audioBlob ? "Re-record voice note" : "Record voice note"}
            </span>
          </button>

          <div className="recording-copy">
            <strong>
              {recording ? "Recording in progress" : audioBlob ? "Voice update ready" : "Tap to record"}
            </strong>
            <span className={recording ? "recording-timer recording-timer--active" : "recording-timer"}>
              {formatDuration(seconds)}
            </span>
            <p>
              {recording
                ? "Speak clearly. Tap the button again when finished."
                : audioBlob
                  ? "Listen below or record again if you missed something."
                  : "Your recording stays on this device until you submit."}
            </p>
          </div>

          {recording && (
            <div className="waveform" aria-hidden="true">
              {Array.from({ length: 25 }, (_, index) => <span key={index} />)}
            </div>
          )}
        </div>

        {!recording && audioBlob && (
          <div className="audio-preview">
            <audio controls src={audioUrl} className="w-full">
              Your browser does not support audio playback.
            </audio>
            <button type="button" onClick={start}>Record again</button>
          </div>
        )}

        <div className="prompt-strip" aria-label="Suggested talking points" tabIndex={0}>
          <span>Work completed</span>
          <span>Labour</span>
          <span>Materials</span>
          <span>Blockers</span>
          <span>Tomorrow</span>
        </div>
      </section>

      <section className="evidence-card surface-card">
        <div className="capture-section-label">
          <span>2</span>
          <div>
            <strong>Site photos</strong>
            <small>Optional, but useful as supporting evidence</small>
          </div>
          {photos.length > 0 && <em>{photos.length} attached</em>}
        </div>

        {photos.length === 0 ? (
          <label htmlFor="site-photos" className="photo-dropzone">
            <span className="photo-dropzone__icon" aria-hidden="true">
              <span />
            </span>
            <strong>Add site photos</strong>
            <small>Choose from your camera or gallery</small>
          </label>
        ) : (
          <div className="photo-grid">
            {photoPreviews.map((preview, index) => (
              <figure key={`${preview.file.name}-${index}`} className="photo-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.url} alt={`Site attachment ${index + 1}`} />
                <button type="button" onClick={() => removePhoto(index)} aria-label={`Remove photo ${index + 1}`}>
                  ×
                </button>
              </figure>
            ))}
            <label htmlFor="site-photos" className="photo-add-more">
              <span aria-hidden="true">+</span>
              Add more
            </label>
          </div>
        )}
        <input
          id="site-photos"
          className="sr-only"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            setPhotos((current) => [...current, ...selected]);
            event.target.value = "";
          }}
        />
      </section>

      <section className="note-card surface-card">
        <div className="capture-section-label">
          <span>3</span>
          <div>
            <strong>Anything else?</strong>
            <small>Optional note for the project manager</small>
          </div>
        </div>
        <label className="sr-only" htmlFor="capture-note">Optional note</label>
        <textarea
          id="capture-note"
          className="text-field capture-note"
          rows={3}
          placeholder="For example: Client inspection is expected tomorrow at 11:00 AM."
        />
      </section>

      {(error || status) && (
        <div className={`capture-message ${error ? "capture-message--error" : "capture-message--status"}`} role="status">
          <span aria-hidden="true">{error ? "!" : "✓"}</span>
          <div>
            <strong>{error ? "Action needed" : "Your update is safe"}</strong>
            <p>{error || status}</p>
          </div>
        </div>
      )}

      <div className="capture-submit-bar">
        <div>
          <strong>{audioBlob ? "Ready to prepare your DPR" : "Voice update required"}</strong>
          <small>
            {audioBlob
              ? `${formatDuration(seconds)} recording · ${photos.length} photo${photos.length === 1 ? "" : "s"}`
              : "Record first, then submit when you’re ready."}
          </small>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!audioBlob || recording || submitting}
          className="primary-button"
        >
          {submitting ? "Uploading…" : "Submit update"}
          {!submitting && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </div>
  );
}
