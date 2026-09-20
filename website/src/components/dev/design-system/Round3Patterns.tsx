import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  Clock,
  Code2,
  HelpCircle,
  Home,
  LogIn,
  Swords,
  Users,
} from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { BulletItem, BulletList } from "~/components/patterns/content/BulletList";
import { CalloutCard } from "~/components/patterns/content/CalloutCard";
import { Disclosure } from "~/components/patterns/content/Disclosure";
import { LinkCard } from "~/components/patterns/content/LinkCard";
import { LogoWallItem } from "~/components/patterns/content/LogoWall";
import { MetaItem, MetaList } from "~/components/patterns/content/MetaList";
import { Prose } from "~/components/patterns/content/Prose";
import { Step, Steps } from "~/components/patterns/content/Steps";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
} from "~/components/patterns/navigation/Breadcrumb";
import { SideNav, SideNavFooter, SideNavGroup, SideNavItem } from "~/components/patterns/navigation/SideNav";
import {
  SideNavBrand,
  SideNavDrawer,
  SideNavHeader,
  SideNavShell,
} from "~/components/patterns/navigation/SideNavShell";
import { AppBody, AppFrame, PageBackdrop } from "~/components/patterns/page/AppFrame";
import { Hero, HeroActions, HeroLead } from "~/components/patterns/page/Hero";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { IconTile } from "~/components/ui/icon-tile";
import { Inline } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";

/** A box that contains `fixed` descendants, so the app chrome can be shown inside a specimen. */
function Viewport({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Card tone="inset" size="flush" className={`relative transform-gpu ${className ?? "h-72"}`}>
      {children}
    </Card>
  );
}

function PageChromeSpecimens() {
  return (
    <>
      <Specimen
        name="AppBody, PageBackdrop and AppFrame"
        source="patterns/page/AppFrame"
        note="The three layers under every page: the body with its background image and shade, the tilted brand mark, and the glass panel pages are drawn on. Used once, in the root route."
      >
        <Variants label="composed (the body is rendered as a div here)" className="block">
          <Viewport className="h-80">
            <AppBody as="div" backgroundSrc="/background.svg" className="h-full">
              <PageBackdrop src="/logo/hexe.svg" />
              <AppFrame className="min-h-80">
                <PageHeader as="div" title="A page" description="Everything a route renders sits on this panel." />
              </AppFrame>
            </AppBody>
          </Viewport>
        </Variants>
        <Variants label='AppBody variant="bare": the transparent body of an OBS embed' className="block">
          <AppBody as="div" variant="bare">
            <Badge variant="muted">widget content on a transparent body</Badge>
          </AppBody>
        </Variants>
      </Specimen>

      <Specimen
        name="PageShell align and height"
        source="patterns/page/PageShell"
        note='A short page (not found, a route error, a sign-in callback) fills the height the AppFrame has left and centres its message: height="fill" align="center".'
      >
        <Variants label='height="fill" align="center", with a PageHeader figure' className="block">
          <Card tone="inset" size="flush" className="h-96">
            <PageShell density="content" height="fill" align="center">
              <PageHeader
                as="div"
                size="lg"
                figure="404"
                title="Page Not Found"
                description="The page you're looking for doesn't exist or may have been moved."
              />
              <HeroActions>
                <Button>
                  <Home />
                  Go Home
                </Button>
                <Button variant="outline">Go Back</Button>
              </HeroActions>
            </PageShell>
          </Card>
        </Variants>
        <Variants label='align="start" (default), height="auto" (default)' className="block">
          <Card tone="inset" size="xs">
            <CardContent>
              <PageShell>
                <PageHeader as="div" align="start" title="A data page" description="Blocks stack from the top." />
              </PageShell>
            </CardContent>
          </Card>
        </Variants>
      </Specimen>

      <Specimen
        name="Hero"
        source="patterns/page/Hero"
        note="The opening block of a hub or marketing page. It draws its own glow at the matching size. Compose a PageHeader, then HeroLead and HeroActions (calls to action, or a row of pills) as needed."
      >
        <Variants label='size="default": every part' className="block">
          <Hero>
            <PageHeader
              as="div"
              size="lg"
              title={
                <>
                  Your matches. Updated <span className="text-primary">faster</span>.
                </>
              }
              description="Patron accounts get a dedicated queue with reserved resources."
            />
            <HeroActions>
              <Button variant="outline" shape="pill" size="sm">
                <BarChart3 />
                Analytics
              </Button>
              <Button variant="outline" shape="pill" size="sm">
                <Code2 />
                Open API
              </Button>
              <Button variant="outline" shape="pill" size="sm" disabled>
                <BookOpen />
                Disabled
              </Button>
            </HeroActions>
            <HeroLead>
              Track hero win rates, pick rates, item analytics, rank distribution and leaderboards, updated live. This
              paragraph keeps a readable measure however wide the page is.
            </HeroLead>
            <HeroActions>
              <Button size="lg">
                <LogIn />
                Sign in
              </Button>
              <Button size="lg" variant="outline">
                Become a Patron
              </Button>
            </HeroActions>
            <Text as="p" variant="caption" tone="muted">
              Starting at $1.50/month, every cent goes to infrastructure
            </Text>
          </Hero>
        </Variants>
        <Variants label='size="sm": a display title only' className="block">
          <Hero size="sm">
            <PageHeader as="div" size="display" title="Deadlock API" />
          </Hero>
        </Variants>
      </Specimen>
    </>
  );
}

function NavigationSpecimens() {
  const [current, setCurrent] = useState("heroes");
  const item = (id: string) => ({
    href: "#sidenavshell",
    active: current === id,
    onClick: (event: React.MouseEvent) => {
      event.preventDefault();
      setCurrent(id);
    },
  });
  const navigation = (
    <>
      <SideNavHeader>
        <SideNavBrand href="#sidenavshell">
          <img src="/favicon.ico" alt="" width={32} height={32} className="size-8" />
          <span className="truncate">Deadlock API</span>
        </SideNavBrand>
      </SideNavHeader>
      <SideNav aria-label="Example" className="flex-1 overflow-y-auto px-3 py-3">
        <SideNavGroup label="Analytics">
          <SideNavItem {...item("heroes")}>
            <Swords />
            <span className="truncate">Heroes</span>
          </SideNavItem>
          <SideNavItem {...item("players")}>
            <Users />
            <span className="truncate">Players with a very long label that truncates</span>
          </SideNavItem>
        </SideNavGroup>
      </SideNav>
      <SideNavFooter>
        <Button variant="soft" size="sm" className="w-full">
          <Code2 />
          API Documentation
        </Button>
      </SideNavFooter>
    </>
  );
  return (
    <>
      <Specimen
        name="SideNavShell"
        source="patterns/navigation/SideNavShell"
        note="The app navigation's two containers: SideNavShell is the fixed desktop column (md and up), SideNavDrawer the menu button and sliding native dialog below md. Both take the same children: SideNavHeader with a SideNavBrand, a SideNav, SideNavFooters."
      >
        <Variants label="SideNavShell (shown from md up, as on the real page)" className="block">
          <Viewport>
            <SideNavShell>{navigation}</SideNavShell>
            <p className="p-3 text-xs text-muted-foreground md:ps-68">
              The page sits beside the shell, offset by its width (16rem). Below md the shell is hidden and the drawer
              takes over.
            </p>
          </Viewport>
        </Variants>
        <Variants
          label="SideNavDrawer (shown below md: narrow the window, then open it; Escape, the backdrop, the close button or a link closes it)"
          className="block"
        >
          <Viewport className="h-20">
            <SideNavDrawer title="Example navigation">{navigation}</SideNavDrawer>
            <p className="hidden p-3 text-xs text-muted-foreground md:block">Hidden from md up.</p>
          </Viewport>
        </Variants>
      </Specimen>

      <Specimen
        name="Breadcrumb"
        source="patterns/navigation/Breadcrumb"
        note="The trail from the home page to this one. Links come in through asChild; the current page is the part that truncates."
      >
        <Variants label="home icon, ancestors, current page" className="block">
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbLink href="#breadcrumb" aria-label="Home">
                <Home />
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbLink href="#breadcrumb">Analytics</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbPage>Heroes</BreadcrumbPage>
            </BreadcrumbItem>
          </Breadcrumb>
        </Variants>
        <Variants label="overflowing: the current page truncates" className="block max-w-64">
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbLink href="#breadcrumb">Blog</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbPage>How the match ingestion pipeline handles a patch day</BreadcrumbPage>
            </BreadcrumbItem>
          </Breadcrumb>
        </Variants>
      </Specimen>
    </>
  );
}

function ContentSpecimens() {
  const [openSection, setOpenSection] = useState<string | null>("windows");
  return (
    <>
      <Specimen
        name="LinkCard"
        source="patterns/content/LinkCard"
        note="A Card that is one link to one destination: media, title, description, an ArrowLink call to action and a footer. The link comes in through asChild. Hover and focus tint the title, the media and nudge the arrow."
      >
        <Variants label='size="sm" | "default" | "lg"' className="grid items-stretch sm:grid-cols-3">
          <LinkCard
            href="#linkcard"
            size="sm"
            media={
              <IconTile size="sm" hover="card">
                <BarChart3 />
              </IconTile>
            }
            title="Hero Stats"
            description="Win rates, pick rates and trends for every hero."
            cta="View"
          />
          <LinkCard
            href="#linkcard"
            media={
              <IconTile hover="card">
                <Code2 />
              </IconTile>
            }
            title="Game Data API"
            description="Match history, player statistics and hero analytics."
            cta="Open docs"
            external
          />
          <LinkCard
            href="#linkcard"
            size="lg"
            as="h2"
            eyebrow={
              <MetaList>
                <MetaItem icon={<Calendar />}>May 4, 2026</MetaItem>
                <MetaItem icon={<Clock />}>6 min read</MetaItem>
              </MetaList>
            }
            title="A post with a long title that wraps onto a second line"
            description="The description can be clamped to two or three lines with the clamp prop, so that a list of entries stays even however long the text of one of them is."
            clamp={2}
            footer={
              <>
                <Badge variant="chart-1">patch</Badge>
                <Badge variant="chart-3">analysis</Badge>
              </>
            }
            cta="Read more"
            ctaPosition="end"
          />
        </Variants>
        <Variants label='orientation="horizontal", mediaPosition="start" | "end"' className="grid sm:grid-cols-2">
          <LinkCard
            href="#linkcard"
            size="sm"
            orientation="horizontal"
            media={<ArrowLeft />}
            eyebrow="Older post"
            title="Rank distribution after the reset"
          />
          <LinkCard
            href="#linkcard"
            size="sm"
            orientation="horizontal"
            mediaPosition="end"
            media={<ArrowRight />}
            eyebrow="Newer post"
            title="A newer post whose title is too long for one line and truncates"
          />
        </Variants>
        <Variants label="tone, footer opposite the cta, custom body as children">
          <LinkCard
            href="#linkcard"
            size="sm"
            tone="primary"
            title="Daily puzzle"
            cta="Play"
            footer={<Badge variant="positive">Won</Badge>}
          >
            <span className="text-2xs text-muted-foreground">Children land under the description.</span>
          </LinkCard>
        </Variants>
      </Specimen>

      <Specimen
        name="Disclosure"
        source="patterns/content/Disclosure"
        note="A title row that reveals its body. A native details element: the body stays in the document when closed, and name makes a group exclusive. open / defaultOpen / onOpenChange."
      >
        <Variants label='variant="plain", controlled as an exclusive group, size="lg"' className="block">
          <Card size="sm">
            <CardContent className="flex flex-col gap-1">
              {["windows", "macos", "linux"].map((os) => (
                <Disclosure
                  key={os}
                  size="lg"
                  title={os}
                  open={openSection === os}
                  onOpenChange={(open) => setOpenSection(open ? os : null)}
                >
                  <p className="text-sm text-muted-foreground">The cache folder on {os}.</p>
                </Disclosure>
              ))}
            </CardContent>
          </Card>
        </Variants>
        <Variants label='variant="bordered": size sm | default | lg' className="grid items-start sm:grid-cols-3">
          {(["sm", "default", "lg"] as const).map((size) => (
            <Disclosure
              key={size}
              variant="bordered"
              size={size}
              title={`How to use? (${size})`}
              defaultOpen={size === "default"}
            >
              <p className="text-sm text-muted-foreground">Use the generated URL in your chat bot.</p>
            </Disclosure>
          ))}
        </Variants>
        <Variants label='variant="inline", with an icon' className="block">
          <Disclosure variant="inline" icon={<HelpCircle />} title="What's a Steam ID?">
            A number that identifies your account. It is part of your profile URL.
          </Disclosure>
        </Variants>
      </Specimen>

      <Specimen
        name="Prose"
        source="patterns/content/Prose"
        note="Long-form text: a blog post rendered from markdown, a policy written in JSX. One definition for the whole site; everything inside is styled by element."
      >
        <Variants label='align="start" (default)' className="block">
          <Prose>
            {/* ds-allow raw-heading: Prose styles raw elements; that is what this specimen shows */}
            <h2>A second-level heading</h2>
            <p>
              Body text is muted, <strong>bold text is ink</strong>, and <a href="#prose">links take the brand color</a>{" "}
              with an underline on hover. Inline <code>code</code> is ink too.
            </p>
            {/* ds-allow raw-heading: Prose styles raw elements; that is what this specimen shows */}
            <h3>A third-level heading</h3>
            <ul>
              <li>Lists keep the body color.</li>
              <li>Markers are muted.</li>
            </ul>
            <blockquote>A quote has a hairline border.</blockquote>
            <pre>
              <code>curl https://api.deadlock-api.com/v1/info</code>
            </pre>
          </Prose>
        </Variants>
        <Variants label='align="justify": justified, hyphenated paragraphs once the column is wide' className="block">
          <Prose as="article" align="justify">
            <p>
              Justified paragraphs suit an article set in one wide column, where the ragged edge of left-aligned text
              would be the loudest shape on the page. Hyphenation keeps the word spacing even. In a narrow container the
              text stays start-aligned, because justified short lines open rivers of white space.
            </p>
          </Prose>
        </Variants>
      </Specimen>

      <Specimen
        name="Steps"
        source="patterns/content/Steps"
        note="Numbered instructions. The numbers come from a CSS counter, so a step can be conditional. A Step's title is the sentence; its children are what goes under it."
      >
        <Variants label='variant="badge" (default)' className="block">
          <Steps>
            <Step title="Open your assistant's settings." />
            <Step title="Add the server with this command:">
              <Card tone="inset" size="xs" radius="md">
                <CardContent className="font-mono text-xs">
                  claude mcp add deadlock https://mcp.deadlock-api.com
                </CardContent>
              </Card>
            </Step>
            <Step title="Ask a question about the data in plain language. A long instruction wraps under its own first line, never under the number." />
          </Steps>
        </Variants>
        <Variants label='variant="plain": inside an Alert or a Card' className="block">
          <Steps variant="plain">
            <Step title="Add a new browser source in OBS." />
            <Step title="Paste the generated URL into the URL field." />
            <Step title="Click OK." />
          </Steps>
        </Variants>
      </Specimen>

      <Specimen
        name="MetaList"
        source="patterns/content/MetaList"
        note="A line of facts about one thing, divided by bars. Built from spans, so it is valid inside a PageHeader description."
      >
        <Variants label="wraps when narrow">
          <MetaList>
            <MetaItem icon={<Calendar />}>
              <time dateTime="2026-05-04">May 4, 2026</time>
            </MetaItem>
            <MetaItem>Manuel</MetaItem>
            <MetaItem icon={<Clock />}>6 min read</MetaItem>
          </MetaList>
        </Variants>
      </Specimen>

      <Specimen
        name="BulletList"
        source="patterns/content/BulletList"
        note="Short points with a dot each. Numbered instructions are Steps; text with paragraphs is Prose."
      >
        <Variants label='orientation="vertical" (default), tones' className="block">
          <BulletList>
            <BulletItem>Privacy-focused: only match IDs are submitted</BulletItem>
            <BulletItem tone="muted">
              A long point wraps under its own text, and the dot stays on the first line however many lines follow it.
            </BulletItem>
          </BulletList>
        </Variants>
        <Variants label='orientation="horizontal"' className="block">
          <BulletList orientation="horizontal">
            <BulletItem>Lightweight background service</BulletItem>
            <BulletItem>No admin rights required</BulletItem>
            <BulletItem>Open source</BulletItem>
          </BulletList>
        </Variants>
      </Specimen>

      <Specimen
        name="CalloutCard"
        source="patterns/content/CalloutCard"
        note="A centred invitation to do one thing: subscribe, upgrade, sign in. A status message is an Alert."
      >
        <Variants
          label="with media, action and note; without an enabled action"
          className="grid items-start lg:grid-cols-2"
        >
          <CalloutCard
            media={
              <IconTile tone="primary" shape="circle" size="lg">
                <LogIn />
              </IconTile>
            }
            title="Get prioritized fetching"
            description="Subscribe to unlock a dedicated queue with reserved resources."
            action={<Button size="lg">Subscribe</Button>}
            footer="Starting at $1.50/month"
          />
          <CalloutCard
            title="Nothing to do yet"
            description="A callout without an action still renders."
            action={<Button disabled>Disabled action</Button>}
          />
        </Variants>
      </Specimen>

      <Specimen
        name="LogoWallItem"
        source="patterns/content/LogoWall"
        note="A sponsor logo as a link, dimmed until hovered or focused. The wall is an Inline with justify center and gap 8."
      >
        <Inline justify="center" gap={8}>
          {["One", "Two", "Three"].map((name) => (
            <LogoWallItem key={name} href="#logowall" title={`Sponsor ${name}`}>
              <img src="/logo/hexe.svg" alt={`Sponsor ${name} logo`} className="h-10 w-auto object-contain" />
            </LogoWallItem>
          ))}
        </Inline>
      </Specimen>
    </>
  );
}

/** Page chrome, navigation and content patterns added in round 3. */
export function Round3Patterns() {
  return (
    <>
      <PageChromeSpecimens />
      <NavigationSpecimens />
      <ContentSpecimens />
    </>
  );
}
