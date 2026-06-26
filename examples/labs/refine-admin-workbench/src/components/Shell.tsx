import type { PropsWithChildren, ReactNode } from "react"
import { Link, NavLink } from "react-router"
import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CheckSquare,
  Clock3,
  Command,
  FileText,
  Inbox,
  Lightbulb,
  MessageCircle,
  Plus,
  Search,
  Users,
  Zap,
} from "lucide-react"

import { Button } from "./ui/Button"
import { getRenderablePluginUi } from "../plugins/pluginUi"

export function Shell({ children }: PropsWithChildren) {
  const pluginNavItems = getRenderablePluginUi("workspace.nav")

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">B</span>
          <span>
            <strong>Bare CRM</strong>
            <small>Admin workbench lab</small>
          </span>
        </Link>

        <nav className="nav-list" aria-label="Main navigation">
          <NavItem to="/dashboard" icon={<Inbox size={17} />} label="Up next" />
          <NavItem to="/inbox" icon={<Bell size={17} />} label="Notifications" />
          <NavItem to="/workflows" icon={<BookOpen size={17} />} label="Knowledge" badge="9" />
          <NavItem to="/gmail-addon" icon={<Zap size={17} />} label="Skills" />

          <NavGroup label="Records" />
          <NavItem to="/companies" icon={<Building2 size={17} />} label="Accounts" />
          <NavItem to="/deals" icon={<BriefcaseBusiness size={17} />} label="Opportunities" />
          <NavItem to="/contacts" icon={<Users size={17} />} label="Contacts" />

          <NavGroup label="Resources" />
          <NavItem to="/activities" icon={<CheckSquare size={17} />} label="Tasks" />
          <NavItem to="/workflows" icon={<Clock3 size={17} />} label="Meetings" />
          <NavItem to="/dashboard" icon={<FileText size={17} />} label="Notes" />

          <NavGroup label="Lists" />
          <NavItem to="/deals" icon={<Plus size={17} />} label="New list" />

          <NavGroup label="Chats" />
          {pluginNavItems.map(({ contribution, registry }) =>
            registry.navItem
              ? (
                <registry.navItem
                  key={`${contribution.pluginId}:${contribution.id}`}
                  contribution={contribution}
                />
              )
              : null
          )}
          <NavItem
            to="/"
            icon={<MessageCircle size={17} />}
            label="Write emails to stalled deals..."
            end
          />
          <NavItem
            to="/inbox"
            icon={<MessageCircle size={17} />}
            label="Engaging Emails for Potential..."
          />
          <NavItem
            to="/gmail-addon"
            icon={<MessageCircle size={17} />}
            label="Follow-Up Outreach to Intere..."
          />
          <NavItem
            to="/workflows"
            icon={<Lightbulb size={17} />}
            label="Nurturing Warm Leads with..."
          />
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          <span>Local workbench API</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="search-box">
            <Search size={16} />
            <input placeholder="Search contacts, deals, threads..." />
            <kbd>
              <Command size={13} />K
            </kbd>
          </div>
          <div className="topbar-actions">
            <Button variant="ghost" aria-label="Notifications">
              <Bell size={17} />
            </Button>
            <Button variant="primary">
              <Plus size={16} />
              New
            </Button>
            <div className="avatar">DC</div>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  )
}

function NavGroup({ label }: { label: string }) {
  return <span className="nav-group">{label}</span>
}

function NavItem(props: {
  to: string
  icon: ReactNode
  label: string
  badge?: string
  end?: boolean
}) {
  return (
    <NavLink
      to={props.to}
      end={props.end}
      className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
    >
      <span className="nav-icon">{props.icon}</span>
      <span className="nav-label">{props.label}</span>
      {props.badge ? <span className="nav-badge">{props.badge}</span> : null}
    </NavLink>
  )
}
