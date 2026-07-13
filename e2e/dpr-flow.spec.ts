import { test, expect } from "@playwright/test";

test("capture -> process -> review -> approve -> issue -> download", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);

  // This host's macOS TCC blocks getUserMedia({audio}) for the headless Chrome-for-Testing
  // binary non-interactively (video resolves, audio hangs forever), so Chromium's own fake
  // audio device never produces a stream. Inject a Web-Audio-synthesized MediaStream to stand
  // in for the OS audio *source* only. Everything downstream is exercised for real:
  // MediaRecorder -> Blob -> FormData -> submitCaptureAction (server) -> storage -> mock pipeline.
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    const orig = md.getUserMedia?.bind(md);
    md.getUserMedia = async (constraints: MediaStreamConstraints) => {
      if (constraints && (constraints as MediaStreamConstraints).audio) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const dst = ctx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();
        return dst.stream;
      }
      if (!orig) throw new Error("getUserMedia unavailable");
      return orig(constraints);
    };
  });

  // Sign in as engineer. The first login is the coldest step in the run: Next.js dev is
  // compiling the /login route + the loginAction server action for the first time AND the
  // server boots PGlite (migrate + seed) on first DB access, which can exceed the default
  // 5s expect timeout — allow generously for the redirect.
  await page.goto("/login");
  await page.getByRole("button", { name: /Site Engineer/i }).click();
  await expect(page).toHaveURL(/\/reports/, { timeout: 30000 });

  // Record a short note, wait for the audio to be ready, then submit
  await page.getByRole("link", { name: /Record update/i }).click();
  await expect(page).toHaveURL(/\/capture/);
  await page.getByRole("button", { name: /Record voice note/i }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Stop recording/i }).click();
  // The <audio> preview appears only once the recorded blob is ready — wait for it before submitting.
  await expect(page.locator("audio")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /Submit update/i }).click();

  // Lands on the report; mock processing already completed -> AWAITING_REVIEW + mock work item.
  await expect(page).toHaveURL(/\/reports\/.+/, { timeout: 30000 });
  await expect(page.getByText("AWAITING_REVIEW")).toBeVisible();
  // "Casting of column C4" appears twice on the review page (the work-item card AND the
  // raw transcript text) — .first() avoids a strict-mode multi-match violation.
  await expect(page.getByText(/Casting of column C4/i).first()).toBeVisible();
  const reportUrl = page.url();
  const reportId = reportUrl.split("/reports/")[1];

  // Switch to manager, open the report, approve, issue
  await page.goto("/login");
  await page.getByRole("button", { name: /Project Manager/i }).click();
  await expect(page).toHaveURL(/\/reports/, { timeout: 30000 });
  await page.goto(reportUrl);
  await page.getByRole("button", { name: /Approve report/i }).click();
  await expect(page.getByText("APPROVED")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /Issue PDF/i }).click();
  // exact:true targets the status badge ("ISSUED"); a plain substring match would also hit
  // the "Download issued PDF" link and trip Playwright's strict-mode check.
  await expect(page.getByText("ISSUED", { exact: true })).toBeVisible({ timeout: 30000 });

  // Issued PDF is retrievable (same cookie session as the page).
  const pdf = await page.request.get(`/api/reports/${reportId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
});
