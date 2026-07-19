import "./globals.css";
import type { ReactNode } from "react";

// BuildFlow's pages are backed by request-scoped tenant context and a runtime database.
// Rendering the app shell dynamically prevents Next from opening PGlite (and its pgvector
// runtime extension) while generating static pages during a production build.
export const dynamic = "force-dynamic";

export const metadata = {
  title: {
    default: "BuildFlow",
    template: "%s · BuildFlow",
  },
  description: "Turn site voice notes and photos into trusted daily progress reports.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="sr-only focus:not-sr-only">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
