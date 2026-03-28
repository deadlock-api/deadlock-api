import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";

export function DirectoryGuide() {
  const [openSection, setOpenSection] = useState<string | null>("windows");

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">📁 Directory Location Guide</CardTitle>
        <CardDescription>
          Find the <code className="rounded bg-muted px-2 py-1">httpcache</code> folder in your Steam installation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Collapsible open={openSection === "windows"} onOpenChange={() => toggleSection("windows")}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card p-4 transition-colors hover:bg-muted">
            <span className="flex items-center gap-2 font-semibold">🪟 Windows</span>
            {openSection === "windows" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 pb-2 pl-4">
            <p className="mb-3 text-sm text-muted-foreground">Default Steam installation path:</p>
            <div className="overflow-x-auto rounded bg-background p-3 font-mono text-sm text-foreground">
              C:\Program Files (x86)\Steam\appcache\httpcache
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={openSection === "macos"} onOpenChange={() => toggleSection("macos")}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card p-4 transition-colors hover:bg-muted">
            <span className="flex items-center gap-2 font-semibold">🍎 macOS</span>
            {openSection === "macos" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 pb-2 pl-4">
            <div className="overflow-x-auto rounded bg-background p-3 font-mono text-sm text-foreground">
              ~/Library/Application Support/Steam/appcache/httpcache
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={openSection === "linux"} onOpenChange={() => toggleSection("linux")}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-card p-4 transition-colors hover:bg-muted">
            <span className="flex items-center gap-2 font-semibold">🐧 Linux</span>
            {openSection === "linux" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 pb-2 pl-4">
            <p className="mb-3 text-sm text-muted-foreground">Common locations (try these in order):</p>
            <div className="space-y-2 text-sm">
              <div className="overflow-x-auto rounded bg-background p-2 font-mono text-foreground">
                ~/.local/share/Steam/appcache/httpcache
              </div>
              <div className="overflow-x-auto rounded bg-background p-2 font-mono text-foreground">
                ~/.steam/steam/appcache/httpcache
              </div>
              <div className="overflow-x-auto rounded bg-background p-2 font-mono text-foreground">
                ~/.var/app/com.valvesoftware.Steam/.local/share/Steam/appcache/httpcache
              </div>
              <details className="cursor-pointer text-xs text-muted-foreground">
                <summary className="hover:text-foreground">Show all possible locations...</summary>
                <div className="mt-2 space-y-2">
                  <div className="overflow-x-auto rounded bg-background p-2 font-mono text-foreground">
                    ~/.var/app/com.valvesoftware.Steam/.steam/steam/appcache/httpcache
                  </div>
                  <div className="overflow-x-auto rounded bg-background p-2 font-mono text-foreground">
                    ~/.var/app/com.valvesoftware.Steam/.steam/root/appcache/httpcache
                  </div>
                  <div className="overflow-x-auto rounded bg-background p-2 font-mono text-foreground">
                    ~/.steam/root/appcache/httpcache
                  </div>
                  <div className="overflow-x-auto rounded bg-background p-2 font-mono text-foreground">
                    ~/.steam/debian-installation/appcache/httpcache
                  </div>
                  <div className="overflow-x-auto rounded bg-background p-2 font-mono text-foreground">
                    ~/snap/steam/common/.local/share/Steam/appcache/httpcache
                  </div>
                  <div className="overflow-x-auto rounded bg-background p-2 font-mono text-foreground">
                    ~/snap/steam/common/.steam/steam/appcache/httpcache
                  </div>
                  <div className="overflow-x-auto rounded bg-background p-2 font-mono text-foreground">
                    ~/snap/steam/common/.steam/root/appcache/httpcache
                  </div>
                </div>
              </details>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
