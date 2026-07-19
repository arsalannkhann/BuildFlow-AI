import Link from "next/link";

// Thirteen flat tabs read as a wall; grouping matches how site teams actually split the
// work — what is being built, what it costs, and what has to be evidenced. Labels stay
// short (the full "Measurement Book (e-MB Preview)" wording lives on that page's heading).
const GROUPS = [
  {
    label: "Delivery",
    tabs: [
      { slug: "", label: "Overview" },
      { slug: "schedule", label: "Schedule" },
      { slug: "blockers", label: "Blockers" },
      { slug: "rfis", label: "RFIs" },
    ],
  },
  {
    label: "Commercial",
    tabs: [
      { slug: "materials", label: "Materials" },
      { slug: "procurement", label: "Procurement" },
      { slug: "budget", label: "Budget" },
      { slug: "mb", label: "Measurement" },
    ],
  },
  {
    label: "Site & records",
    tabs: [
      { slug: "labour", label: "Labour" },
      { slug: "equipment", label: "Equipment" },
      { slug: "documents", label: "Documents" },
      { slug: "compliance", label: "Compliance" },
      { slug: "admin", label: "Settings" },
    ],
  },
] as const;

export function ProjectNav({ projectId, active }: { projectId: string; active: string }) {
  return (
    <nav aria-label="Project sections" className="project-nav">
      {GROUPS.map((group) => (
        <div key={group.label} className="project-nav__group">
          <span className="project-nav__group-label" aria-hidden="true">{group.label}</span>
          <div className="project-nav__tabs">
            {group.tabs.map((tab) => (
              <Link
                key={tab.slug}
                href={`/projects/${projectId}${tab.slug ? `/${tab.slug}` : ""}`}
                aria-current={active === tab.slug ? "page" : undefined}
                className={active === tab.slug ? "project-nav__tab project-nav__tab--active" : "project-nav__tab"}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
