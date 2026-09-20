import { useState } from "react";

import { CopyableCode } from "~/components/patterns/code/CopyableCode";
import { Disclosure } from "~/components/patterns/content/Disclosure";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Code } from "~/components/ui/code";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";

function PathBlock({ path }: { path: string }) {
  return <CopyableCode size="sm" code={path} copyLabel={`Copy ${path}`} />;
}

export function DirectoryGuide() {
  const [openSection, setOpenSection] = useState<string | null>("windows");

  const sectionProps = (section: string) => ({
    size: "lg" as const,
    open: openSection === section,
    onOpenChange: (open: boolean) => setOpenSection(open ? section : null),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">📁 Directory Location Guide</CardTitle>
        <CardDescription>
          Find the <Code size="lg">httpcache</Code> folder in your Steam installation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap={3}>
          <Disclosure title="🪟 Windows" {...sectionProps("windows")}>
            <Stack gap={3}>
              <Text as="p" tone="muted">
                Default Steam installation path:
              </Text>
              <PathBlock path="C:\Program Files (x86)\Steam\appcache\httpcache" />
            </Stack>
          </Disclosure>

          <Disclosure title="🍎 macOS" {...sectionProps("macos")}>
            <PathBlock path="~/Library/Application Support/Steam/appcache/httpcache" />
          </Disclosure>

          <Disclosure title="🐧 Linux" {...sectionProps("linux")}>
            <Stack gap={3}>
              <Text as="p" tone="muted">
                Common locations (try these in order):
              </Text>
              <Stack gap={2}>
                <PathBlock path="~/.local/share/Steam/appcache/httpcache" />
                <PathBlock path="~/.steam/steam/appcache/httpcache" />
                <PathBlock path="~/.var/app/com.valvesoftware.Steam/.local/share/Steam/appcache/httpcache" />
                <Disclosure variant="inline" size="sm" title="Show all possible locations...">
                  <Stack gap={2}>
                    <PathBlock path="~/.var/app/com.valvesoftware.Steam/.steam/steam/appcache/httpcache" />
                    <PathBlock path="~/.var/app/com.valvesoftware.Steam/.steam/root/appcache/httpcache" />
                    <PathBlock path="~/.steam/root/appcache/httpcache" />
                    <PathBlock path="~/.steam/debian-installation/appcache/httpcache" />
                    <PathBlock path="~/snap/steam/common/.local/share/Steam/appcache/httpcache" />
                    <PathBlock path="~/snap/steam/common/.steam/steam/appcache/httpcache" />
                    <PathBlock path="~/snap/steam/common/.steam/root/appcache/httpcache" />
                  </Stack>
                </Disclosure>
              </Stack>
            </Stack>
          </Disclosure>
        </Stack>
      </CardContent>
    </Card>
  );
}
