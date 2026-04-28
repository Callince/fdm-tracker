"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabList, TabButton, TabPanel } from "@/components/ui/tabs";
import { OrgTab } from "./_components/OrgTab";
import { MeTab } from "./_components/MeTab";

type Tab = "org" | "me";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("org");

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        kicker="Configuration"
        title="Settings"
        subtitle="Organisation-wide tracking behaviour, and your own admin profile."
      />

      <Tabs value={tab} onChange={setTab}>
        <TabList>
          <TabButton value="org">Organization</TabButton>
          <TabButton value="me">My account</TabButton>
        </TabList>

        <TabPanel value="org" current={tab}>
          <OrgTab />
        </TabPanel>
        <TabPanel value="me" current={tab}>
          <MeTab />
        </TabPanel>
      </Tabs>
    </div>
  );
}
