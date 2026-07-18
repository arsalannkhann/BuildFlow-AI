import { AppHeader } from "@/app/components/AppHeader";
import { CaptureClient } from "./CaptureClient";

export default function CapturePage() {
  return (
    <>
      <AppHeader roleLabel="Site Engineer" canCapture />
      <main id="main-content" className="page-shell page-shell--narrow capture-page">
        <div className="capture-breadcrumb">
          <span>Today</span>
          <span aria-hidden="true">/</span>
          <strong>New site update</strong>
        </div>
        <div className="capture-heading">
          <div>
            <p className="eyebrow">Sector 62 · Tower A</p>
            <h1 className="page-title">Tell us what happened today.</h1>
            <p className="page-lead">
              Speak naturally. Mention work completed, labour, materials, blockers
              and tomorrow&apos;s plan.
            </p>
          </div>
          <div className="capture-date" aria-label="Report date">
            <small>REPORT DATE</small>
            <strong>
              {new Intl.DateTimeFormat("en-IN", {
                day: "2-digit",
                month: "short",
              }).format(new Date())}
            </strong>
          </div>
        </div>
        <CaptureClient />
      </main>
    </>
  );
}
