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
          Find the <code className="bg-muted px-2 py-1 rounded">httpcache</code> folder in your Steam installation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Collapsible open={openSection === "windows"} onOpenChange={() => toggleSection("windows")}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-card rounded-lg hover:bg-muted transition-colors">
            <span className="font-semibold flex items-center gap-2">🪟 Windows</span>
            {openSection === "windows" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 pl-4 pb-2">
            <p className="text-sm text-muted-foreground mb-3">Default Steam installation path:</p>
            <div className="bg-background text-foreground p-3 rounded font-mono text-sm overflow-x-auto">
              C:\Program Files (x86)\Steam\appcache\httpcache
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={openSection === "macos"} onOpenChange={() => toggleSection("macos")}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-card rounded-lg hover:bg-muted transition-colors">
            <span className="font-semibold flex items-center gap-2">🍎 macOS</span>
            {openSection === "macos" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 pl-4 pb-2">
            <div className="bg-background text-foreground p-3 rounded font-mono text-sm overflow-x-auto">
              ~/Library/Application Support/Steam/appcache/httpcache
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={openSection === "linux"} onOpenChange={() => toggleSection("linux")}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-card rounded-lg hover:bg-muted transition-colors">
            <span className="font-semibold flex items-center gap-2">🐧 Linux</span>
            {openSection === "linux" ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 pl-4 pb-2">
            <p className="text-sm text-muted-foreground mb-3">Common locations (try these in order):</p>
            <div className="space-y-2 text-sm">
              <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                ~/.local/share/Steam/appcache/httpcache
              </div>
              <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                ~/.steam/steam/appcache/httpcache
              </div>
              <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                ~/.var/app/com.valvesoftware.Steam/.local/share/Steam/appcache/httpcache
              </div>
              <details className="text-xs text-muted-foreground cursor-pointer">
                <summary className="hover:text-foreground">Show all possible locations...</summary>
                <div className="space-y-2 mt-2">
                  <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                    ~/.var/app/com.valvesoftware.Steam/.steam/steam/appcache/httpcache
                  </div>
                  <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                    ~/.var/app/com.valvesoftware.Steam/.steam/root/appcache/httpcache
                  </div>
                  <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                    ~/.steam/root/appcache/httpcache
                  </div>
                  <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                    ~/.steam/debian-installation/appcache/httpcache
                  </div>
                  <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                    ~/snap/steam/common/.local/share/Steam/appcache/httpcache
                  </div>
                  <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
                    ~/snap/steam/common/.steam/steam/appcache/httpcache
                  </div>
                  <div className="bg-background text-foreground p-2 rounded font-mono overflow-x-auto">
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
