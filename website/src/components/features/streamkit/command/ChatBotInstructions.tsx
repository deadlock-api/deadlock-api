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
    { name: "StreamElements", command: `$(customapi ${generatedUrl})` },
    { name: "Fossabot", command: `$(customapi ${generatedUrl})` },
    { name: "Nightbot", command: `$(urlfetch ${generatedUrl})` },
  ];

  return (
    <Disclosure variant="bordered" title="How to use?">
      <Stack gap={3}>
        <Text as="p" tone="muted">
          Use the generated URL in your favorite chat bot to create dynamic commands:
        </Text>
        {/* No command to copy until the template makes a URL: a half-built one would answer chat with "{foo}". */}
        {!generatedUrl ? (
          <Text as="p" tone="muted">
            The commands appear here once the template above is complete.
          </Text>
        ) : (
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
        )}
      </Stack>
    </Disclosure>
  );
}
