import Link from "next/link";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "schedule", label: "Schedule" },
  { slug: "blockers", label: "Blockers" },
  { slug: "rfis", label: "RFIs" },
  { slug: "documents", label: "Documents" },
  { slug: "materials", label: "Materials" },
  { slug: "budget", label: "Budget" },
  { slug: "admin", label: "Settings" },
] as const;

export function ProjectNav({ projectId, active }: { projectId: string; active: string }) {
  return (
    <nav aria-label="Project sections" className="project-nav">
      {TABS.map((tab) => (
        <Link
          key={tab.slug}
          href={`/projects/${projectId}${tab.slug ? `/${tab.slug}` : ""}`}
          aria-current={active === tab.slug ? "page" : undefined}
          className={active === tab.slug ? "project-nav__tab project-nav__tab--active" : "project-nav__tab"}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
