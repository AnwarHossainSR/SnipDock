import { useState } from "react";
import ProjectsPanel from "./ProjectsPanel";
import TagsPanel from "./TagsPanel";

type OrganizationView = "projects" | "categories-tags";

export default function LibraryOrganization() {
  const [view, setView] = useState<OrganizationView>("projects");
  return (
    <section className="library-organization" aria-labelledby="library-organization-title">
      <header className="content-heading"><div><p>Library organization</p><h2 id="library-organization-title">Organize</h2></div>
        <div className="view-switch" role="group" aria-label="Organization view"><button className="filter-chip" type="button" aria-pressed={view === "projects"} onClick={() => setView("projects")}>Projects</button><button className="filter-chip" type="button" aria-pressed={view === "categories-tags"} onClick={() => setView("categories-tags")}>Categories & tags</button></div>
      </header>
      {view === "projects" ? <ProjectsPanel /> : <TagsPanel />}
    </section>
  );
}
