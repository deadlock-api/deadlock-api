import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { FormDots } from "~/components/domain/match/FormDots";
import { KdaLine } from "~/components/domain/match/KdaLine";
import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { SteamAvatar } from "~/components/domain/player/SteamAvatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

const AVATAR = "/favicon.png";
const ACCOUNT_ID = 74963221;

export function Round3DomainPlayer() {
  return (
    <>
      <Specimen
        name="SteamAvatar"
        source="domain/player/SteamAvatar"
        note="A player's Steam avatar, built on ui/avatar. Decorative, so hidden from assistive technology: always pair it with the name. A missing or broken image shows a person glyph."
      >
        <Variants label="size: xs, sm, default, lg">
          <SteamAvatar src={AVATAR} size="xs" />
          <SteamAvatar src={AVATAR} size="sm" />
          <SteamAvatar src={AVATAR} />
          <SteamAvatar src={AVATAR} size="lg" />
        </Variants>
        <Variants label='shape="rounded" (profile header), no image, broken image, loading'>
          <SteamAvatar src={AVATAR} size="lg" shape="rounded" />
          <SteamAvatar size="lg" shape="rounded" />
          <SteamAvatar src={undefined} />
          <SteamAvatar src="/does-not-exist.png" />
          <SteamAvatar loading />
          <SteamAvatar loading size="lg" shape="rounded" />
        </Variants>
      </Specimen>

      <Specimen
        name="PlayerCell"
        source="domain/player/PlayerCell"
        note="A player as the identity of a row: avatar, persona name and optionally the account id. linkToDetail links the name to the player's tracker page; leave it off when the whole row is the link. loading covers the wait for the Steam profiles."
      >
        <Variants label="size: sm, default">
          <PlayerCell size="sm" accountId={ACCOUNT_ID} name="Manuel" avatar={AVATAR} linkToDetail />
          <PlayerCell accountId={ACCOUNT_ID} name="Manuel" avatar={AVATAR} linkToDetail showAccountId />
        </Variants>
        <Variants label="No profile, no account, loading, truncation">
          <PlayerCell accountId={ACCOUNT_ID} />
          <PlayerCell name="#12" />
          <PlayerCell loading />
          <PlayerCell
            accountId={ACCOUNT_ID}
            name="A very long persona name that does not fit"
            avatar={AVATAR}
            linkToDetail
            className="max-w-40"
          />
        </Variants>
      </Specimen>

      <Specimen
        name="KdaLine"
        source="domain/match/KdaLine"
        note="Kills / deaths / assists of one player in one match, the slashes muted. Sized as the headline of a match card."
      >
        <Variants label="A match, a deathless match">
          <KdaLine kills={7} deaths={3} assists={12} />
          <KdaLine kills={12} deaths={0} assists={21} />
        </Variants>
      </Specimen>

      <Specimen
        name="FormDots"
        source="domain/match/FormDots"
        note="A player's last few results, newest first. The tooltip and the screen-reader text carry the counts; an empty form renders nothing."
      >
        <Variants label="Mixed, all wins, one match">
          <FormDots form={["win", "win", "loss", "win", "loss"]} />
          <FormDots form={["win", "win", "win", "win", "win"]} />
          <FormDots form={["loss"]} />
        </Variants>
        <Table density="dense" aria-label="Form in a table">
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead className="text-end">KDA</TableHead>
              <TableHead className="text-end">Form</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                <PlayerCell accountId={ACCOUNT_ID} name="Manuel" avatar={AVATAR} linkToDetail />
              </TableCell>
              <TableCell className="text-end">
                <KdaLine kills={7} deaths={3} assists={12} />
              </TableCell>
              <TableCell>
                <FormDots form={["loss", "win", "win", "loss", "win"]} className="justify-end" />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Specimen>
    </>
  );
}
