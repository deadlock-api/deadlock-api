import { createFileRoute } from "@tanstack/react-router";
import { Download, FolderUp } from "lucide-react";

import { CacheUpload } from "~/components/features/ingest-cache/CacheUpload";
import { INGEST_FAQ, ingestFaqJsonLd } from "~/components/features/ingest-cache/faq";
import { InstallGuide } from "~/components/features/ingest-cache/InstallGuide";
import { WhyInstall } from "~/components/features/ingest-cache/WhyInstall";
import { Disclosure } from "~/components/patterns/content/Disclosure";
import {
  ComparisonCell,
  ComparisonColumn,
  ComparisonHeader,
  ComparisonRow,
  ComparisonTable,
} from "~/components/patterns/data-table/ComparisonTable";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { Button } from "~/components/ui/button";
import { Grid } from "~/components/ui/grid";
import { Stack } from "~/components/ui/stack";
import { TableBody } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { pageTitle, seo } from "~/lib/seo";

export const Route = createFileRoute("/ingest-cache")({
  component: IngestCache,
  head: () =>
    seo({
      title: pageTitle("Get Your Matches on Deadlock Trackers"),
      description:
        "Matches missing on Statlocker, Tracklock or other Deadlock trackers? Send them from your Steam cache with a background tool or a one-time browser upload.",
      path: "/ingest-cache",
      jsonLd: ingestFaqJsonLd(),
    }),
});

function IngestCache() {
  return (
    <PageShell density="content" width="wide">
      <PageHeader
        size="lg"
        title="Get your matches on Deadlock trackers"
        description="Statlocker, Tracklock and other trackers can only show the matches someone has sent in. Install the background tool once and every match you play gets sent."
        actions={
          <>
            <Button asChild size="lg">
              <a href="#install">
                <Download aria-hidden="true" />
                Install the tool
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#upload">
                <FolderUp aria-hidden="true" />
                Upload once instead
              </a>
            </Button>
          </>
        }
      />

      <Section id="install" title="Install the background tool">
        <Grid columns={{ base: 1, lg: 3 }} gap={4}>
          <div className="@2xl:col-span-2">
            <InstallGuide />
          </div>
          <WhyInstall />
        </Grid>
      </Section>

      <Section title="Background tool or one-time upload">
        <ComparisonTable highlightedColumn={0}>
          <ComparisonHeader>
            <ComparisonColumn>Background tool</ComparisonColumn>
            <ComparisonColumn>Cache upload</ComparisonColumn>
          </ComparisonHeader>
          <TableBody>
            <ComparisonRow label="Sends the matches already in your Steam cache">
              <ComparisonCell included />
              <ComparisonCell included />
            </ComparisonRow>
            <ComparisonRow label="Sends every new match by itself">
              <ComparisonCell included />
              <ComparisonCell />
            </ComparisonRow>
            <ComparisonRow label="Finds matches still missing for everyone">
              <ComparisonCell included />
              <ComparisonCell />
            </ComparisonRow>
            <ComparisonRow label="Runs in the browser, nothing to install">
              <ComparisonCell />
              <ComparisonCell included />
            </ComparisonRow>
          </TableBody>
        </ComparisonTable>
      </Section>

      <Section id="upload" title="Upload your Steam cache once">
        <CacheUpload />
      </Section>

      <Section title="Questions">
        <Stack gap={2}>
          {INGEST_FAQ.map(({ question, answer }) => (
            <Disclosure key={question} variant="bordered" title={question} name="ingest-faq">
              <Text as="p" tone="muted">
                {answer}
              </Text>
            </Disclosure>
          ))}
        </Stack>
      </Section>
    </PageShell>
  );
}
