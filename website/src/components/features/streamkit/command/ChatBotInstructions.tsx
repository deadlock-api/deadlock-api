import { CopyableCode } from "~/components/patterns/code/CopyableCode";
import { Disclosure } from "~/components/patterns/content/Disclosure";
import { Stack } from "~/components/ui/stack";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Text } from "~/components/ui/text";

interface ChatBotInstructionsProps {
  generatedUrl: string;
}

export function ChatBotInstructions({ generatedUrl }: ChatBotInstructionsProps) {
  const chatBots = [
    { name: "StreamElements", command: `$(customapi ${generatedUrl || "https://your-command-url"})` },
    { name: "Fossabot", command: `$(customapi ${generatedUrl || "https://your-command-url"})` },
    { name: "Nightbot", command: `$(urlfetch ${generatedUrl || "https://your-command-url"})` },
  ];

  return (
    <Disclosure variant="bordered" title="How to use?">
      <Stack gap={3}>
        <Text as="p" tone="muted">
          Use the generated URL in your favorite chat bot to create dynamic commands:
        </Text>
        <Tabs defaultValue={chatBots[0].name}>
          <TabsList>
            {chatBots.map(({ name }) => (
              <TabsTrigger key={name} value={name}>
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
          {chatBots.map(({ name, command }) => (
            <TabsContent key={name} value={name}>
              <CopyableCode code={command} copyLabel="Copy command" />
            </TabsContent>
          ))}
        </Tabs>
      </Stack>
    </Disclosure>
  );
}
