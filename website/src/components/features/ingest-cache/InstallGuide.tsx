import { CopyableCode } from "~/components/patterns/code/CopyableCode";
import { Disclosure } from "~/components/patterns/content/Disclosure";
import { Step, Steps } from "~/components/patterns/content/Steps";
import { Card, CardContent } from "~/components/ui/card";
import { Code } from "~/components/ui/code";
import { Kbd } from "~/components/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { TextLink } from "~/components/ui/text-link";

const REPO = "https://github.com/deadlock-api/deadlock-api-ingest";

const WINDOWS_INSTALL = `irm https://raw.githubusercontent.com/deadlock-api/deadlock-api-ingest/master/install-windows.ps1 | iex`;
const WINDOWS_UNINSTALL = `& "$env:LOCALAPPDATA\\deadlock-api-ingest\\uninstall-windows.ps1"`;
const LINUX_INSTALL = `curl -fsSL https://raw.githubusercontent.com/deadlock-api/deadlock-api-ingest/master/install-linux.sh | bash`;
const LINUX_UNINSTALL = "~/.local/share/deadlock-api-ingest/uninstall-linux.sh";
const DOCKER_INSTALL = `docker run -d --restart unless-stopped --name deadlock-api-ingest \\
  -v ~/.steam/steam/appcache/httpcache:/root/.steam/steam/appcache/httpcache \\
  ghcr.io/deadlock-api/deadlock-api-ingest:latest`;
const DOCKER_UNINSTALL = "docker rm -f deadlock-api-ingest";

function Uninstall({ code }: { code: string }) {
  return (
    <Disclosure variant="inline" title="Uninstall">
      <CopyableCode size="sm" language="bash" code={code} copyLabel="Copy uninstall command" />
    </Disclosure>
  );
}

/** The background tool's install steps, one tab per platform; every note sits in the tab it is about. */
export function InstallGuide() {
  return (
    <Card className="h-full">
      <CardContent>
        <Tabs defaultValue="windows" className="gap-5">
          <TabsList aria-label="Platform">
            <TabsTrigger value="windows">Windows</TabsTrigger>
            <TabsTrigger value="linux">Linux</TabsTrigger>
            <TabsTrigger value="docker">Docker</TabsTrigger>
          </TabsList>

          <TabsContent value="windows" className="flex flex-col gap-4">
            <Steps>
              <Step title="Open PowerShell as administrator: right-click Start, then Terminal (Admin) or Windows PowerShell (Admin)." />
              <Step title="Paste the installer and press Enter.">
                <CopyableCode language="bash" code={WINDOWS_INSTALL} copyLabel="Copy Windows install command" />
              </Step>
              <Step
                title={
                  <>
                    Press <Kbd>Y</Kbd> when it asks about auto-start, or wait 10 seconds. It then starts by itself every
                    time you sign in.
                  </>
                }
              />
              <Step title="Play Deadlock. Your matches are sent while you play." />
            </Steps>
            <Uninstall code={WINDOWS_UNINSTALL} />
          </TabsContent>

          <TabsContent value="linux" className="flex flex-col gap-4">
            <Steps>
              <Step title="Paste the installer into a terminal. It installs into your home folder and starts on login, no sudo needed.">
                <CopyableCode language="bash" code={LINUX_INSTALL} copyLabel="Copy Linux install command" />
              </Step>
              <Step title="Play Deadlock. Your matches are sent while you play." />
            </Steps>
            <Uninstall code={LINUX_UNINSTALL} />
          </TabsContent>

          <TabsContent value="docker" className="flex flex-col gap-4">
            <Steps>
              <Step
                title={
                  <>
                    Start the container. If Steam lives somewhere else, change the folder before the <Code>:</Code>.
                  </>
                }
              >
                <CopyableCode language="bash" code={DOCKER_INSTALL} copyLabel="Copy Docker command" />
              </Step>
              <Step title="Play Deadlock. Your matches are sent while you play." />
            </Steps>
            <Uninstall code={DOCKER_UNINSTALL} />
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardContent>
        <TextLink href={REPO} external className="text-sm">
          Source code on GitHub
        </TextLink>
      </CardContent>
    </Card>
  );
}
