import { Refine } from "@refinedev/core"
import routerProvider from "@refinedev/react-router"
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router"
import {
  Activity,
  BarChart3,
  Building2,
  Inbox,
  LayoutDashboard,
  MailCheck,
  Users,
  Workflow,
} from "lucide-react"

import { Shell } from "./components/Shell"
import { dataProvider } from "./data/dataProvider"
import { ContactsPage } from "./pages/ContactsPage"
import { ContactShowPage } from "./pages/ContactShowPage"
import { DashboardPage } from "./pages/DashboardPage"
import { DealsPage } from "./pages/DealsPage"
import { GmailAddonPreviewPage } from "./pages/GmailAddonPreviewPage"
import { InboxPage } from "./pages/InboxPage"
import { WorkflowsPage } from "./pages/WorkflowsPage"
import { WorkbenchPage } from "./pages/WorkbenchPage"
import { getRenderablePluginUi } from "./plugins/pluginUi"

export function App() {
  const pluginRoutes = getRenderablePluginUi("workspace.route")

  return (
    <BrowserRouter>
      <Refine
        routerProvider={routerProvider}
        dataProvider={dataProvider}
        resources={[
          {
            name: "dashboard",
            list: "/dashboard",
            meta: { label: "Dashboard", icon: <LayoutDashboard size={18} /> },
          },
          {
            name: "contacts",
            list: "/contacts",
            show: "/contacts/show/:id",
            create: "/contacts/create",
            meta: { label: "Contacts", icon: <Users size={18} /> },
          },
          {
            name: "companies",
            list: "/companies",
            meta: { label: "Companies", icon: <Building2 size={18} /> },
          },
          {
            name: "deals",
            list: "/deals",
            show: "/deals/show/:id",
            meta: { label: "Deals", icon: <BarChart3 size={18} /> },
          },
          {
            name: "inbox",
            list: "/inbox",
            meta: { label: "Inbox", icon: <Inbox size={18} /> },
          },
          {
            name: "gmail-addon",
            list: "/gmail-addon",
            meta: { label: "Gmail add-on", icon: <MailCheck size={18} /> },
          },
          {
            name: "workflows",
            list: "/workflows",
            meta: { label: "Workflows", icon: <Workflow size={18} /> },
          },
          {
            name: "activities",
            list: "/activities",
            meta: { label: "Activity", icon: <Activity size={18} /> },
          },
        ]}
        options={{
          syncWithLocation: true,
          warnWhenUnsavedChanges: true,
        }}
      >
        <Routes>
          <Route
            element={
              <Shell>
                <Outlet />
              </Shell>
            }
          >
            <Route index element={<WorkbenchPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="contacts/show/:id" element={<ContactShowPage />} />
            <Route path="companies" element={<ContactsPage mode="companies" />} />
            <Route path="deals" element={<DealsPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="gmail-addon" element={<GmailAddonPreviewPage />} />
            <Route path="workflows" element={<WorkflowsPage />} />
            <Route path="activities" element={<DashboardPage focus="activity" />} />
            {pluginRoutes.map(({ contribution, registry }) =>
              registry.routeComponent && contribution.route
                ? (
                  <Route
                    key={`${contribution.pluginId}:${contribution.id}`}
                    path={contribution.route.replace(/^\//, "")}
                    element={<registry.routeComponent />}
                  />
                )
                : null
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Refine>
    </BrowserRouter>
  )
}
