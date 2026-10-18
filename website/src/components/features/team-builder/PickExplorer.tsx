import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { ChartAxisTitle, ChartRegion, ChartStage } from "~/components/patterns/charts/ChartOverlay";
import { PanelBody } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { useElementSize } from "~/components/ui/hooks/use-element-size";
import { Separator } from "~/components/ui/separator";
import type { Recommendation } from "~/lib/team-builder/analysis";
import { formatPoints } from "~/lib/team-builder/format";
import { heroesQueryOptions } from "~/queries/asset-queries";

import { RecommendationTooltip } from "./RecommendationTooltip";

/** About the collapsed list beside it, so the two views of the panel are close in height. */
const HEIGHT = 280;
const PAD = 30;
/** The smallest portrait is still a 24px target. */
const MIN_SIZE = 24;
const MAX_SIZE = 30;
const RELAX_PASSES = 80;

/** A candidate that has both coordinates, which is what makes it plottable at all. */
type PlottableRec = Recommendation & { synergy: number; counter: number };

interface Node {
  rec: PlottableRec;
  x: number;
  y: number;
  size: number;
}

/**
 * Symmetric around zero, so the quadrant divider always lands dead centre while still covering the
 * furthest point on either side. An unpadded data range would push the divider to an edge whenever
 * the candidates all fall on one side of it.
 */
function scaler(values: number[], from: number, to: number) {
  const bound = Math.max(...values.map(Math.abs), 0.25) + 0.25;
  const project = (v: number) => from + ((v + bound) / (bound * 2)) * (to - from);
  return { project, bound };
}

/** Five evenly spaced marks across a symmetric domain, always including the zero in the middle. */
function ticksOf(bound: number): number[] {
  return [-bound, -bound / 2, 0, bound / 2, bound];
}

/**
 * Nudges overlapping portraits apart. Positions stop being exact once a pair collides, which is the
 * accepted trade for keeping every candidate readable — the ranked list beside it stays authoritative.
 */
function relax(nodes: Node[], width: number): Node[] {
  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const needed = (a.size + b.size) / 2 + 5;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        if (distance >= needed) continue;
        const push = (needed - distance) / 2;
        dx /= distance;
        dy /= distance;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        moved = true;
      }
    }
    for (const node of nodes) {
      node.x = Math.max(node.size / 2, Math.min(width - node.size / 2, node.x));
      node.y = Math.max(node.size / 2, Math.min(HEIGHT - node.size / 2, node.y));
    }
    if (!moved) break;
  }
  return nodes;
}

interface PickExplorerProps {
  recommendations: Recommendation[];
  onPick: (heroId: number) => void;
}

export function PickExplorer({ recommendations, onPick }: PickExplorerProps) {
  const { data: names } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => new Map(heroes.map((hero) => [hero.id, hero.name])),
  });
  // The plot fills whatever width the panel has, so the layout is measured rather than fixed.
  const [plotRef, setPlotRef] = useState<HTMLDivElement | null>(null);
  // Rounded: the raw fractional width changes every frame of a resize, and each distinct value re-runs the O(n²)
  // relaxation below.
  const { width } = useElementSize(plotRef, { round: true, initial: { width: 520, height: 0 } });

  const plotted = useMemo(
    () => recommendations.filter((r): r is PlottableRec => r.synergy !== undefined && r.counter !== undefined),
    [recommendations],
  );

  const { nodes, zeroX, zeroY, xTicks, yTicks } = useMemo(() => {
    if (plotted.length === 0) {
      return { nodes: [], zeroX: 0, zeroY: 0, xTicks: [], yTicks: [] };
    }
    const sx = scaler(
      plotted.map((r) => r.synergy),
      PAD,
      width - PAD,
    );
    const sy = scaler(
      plotted.map((r) => r.counter),
      HEIGHT - PAD,
      PAD,
    );
    const maxMatches = Math.max(...plotted.map((r) => r.matches), 1);
    return {
      nodes: relax(
        plotted.map((r) => ({
          rec: r,
          x: sx.project(r.synergy),
          y: sy.project(r.counter),
          size: MIN_SIZE + (MAX_SIZE - MIN_SIZE) * Math.sqrt(r.matches / maxMatches),
        })),
        width,
      ),
      zeroX: sx.project(0),
      zeroY: sy.project(0),
      xTicks: ticksOf(sx.bound).map((value) => ({ value, at: sx.project(value) })),
      yTicks: ticksOf(sy.bound).map((value) => ({ value, at: sy.project(value) })),
    };
  }, [plotted, width]);

  if (nodes.length === 0) {
    return (
      <EmptyState variant="inline" className="px-4 py-6" title="Draft heroes on both sides to plot the candidates." />
    );
  }

  return (
    <PanelBody className="grid grid-cols-[auto_minmax(0,1fr)] gap-1">
      <ChartAxisTitle axis="y">Matchup vs. the enemy →</ChartAxisTitle>
      <Card tone="outline" size="flush" radius="lg">
        <ChartStage
          ref={setPlotRef}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a labelled group of plotted portraits; fieldset and hgroup carry the wrong semantics
          role="group"
          aria-label="Candidates by synergy and matchup"
          style={{ height: HEIGHT }}
        >
          {/* Quadrant tints: the top-right corner is the one worth picking from, and the shading says
              so without the reader having to trace both axes. */}
          <ChartRegion
            tone="positive"
            label="Strong pick"
            start={(zeroX / width) * 100}
            bottom={100 - (zeroY / HEIGHT) * 100}
          />
          <ChartRegion
            tone="negative"
            label="Weak pick"
            end={100 - (zeroX / width) * 100}
            top={(zeroY / HEIGHT) * 100}
          />

          {/* Gridlines carry the scale, the middle one of each axis being the quadrant divider; the
              tints carry the sign. */}
          {xTicks.map((tick) => (
            <Separator
              key={`x${tick.value}`}
              orientation="vertical"
              className="pointer-events-none absolute inset-y-0"
              style={{ left: tick.at }}
            />
          ))}
          {yTicks.map((tick) => (
            <Separator
              key={`y${tick.value}`}
              className="pointer-events-none absolute inset-x-0"
              style={{ top: tick.at }}
            />
          ))}
          {yTicks.map((tick) => (
            <span
              key={`yl${tick.value}`}
              className="pointer-events-none absolute inset-s-1 text-xs text-muted-foreground tabular-nums"
              style={{ top: tick.at - 8 }}
            >
              {formatPoints(tick.value)}
            </span>
          ))}

          {nodes.map((node) => (
            <RecommendationTooltip key={node.rec.heroId} rec={node.rec}>
              <Button
                variant="ghost"
                shape="pill"
                size="icon"
                onClick={() => onPick(node.rec.heroId)}
                aria-label={`Pick ${names?.get(node.rec.heroId) ?? "hero"}: synergy ${formatPoints(node.rec.synergy)}, matchup ${formatPoints(node.rec.counter)}`}
                className="absolute hover:z-10 hover:scale-125 focus-visible:z-10 focus-visible:scale-125"
                style={{
                  insetInlineStart: node.x - node.size / 2,
                  top: node.y - node.size / 2,
                  width: node.size,
                  height: node.size,
                }}
              >
                <HeroImage heroId={node.rec.heroId} shape="circle" decorative className="size-full shrink-0" />
              </Button>
            </RecommendationTooltip>
          ))}
        </ChartStage>
      </Card>

      <span />
      <div className="relative h-4">
        {xTicks.map((tick) => (
          <span
            key={tick.value}
            className="absolute -translate-x-1/2 text-xs text-muted-foreground tabular-nums"
            style={{ left: tick.at }}
          >
            {formatPoints(tick.value)}
          </span>
        ))}
      </div>
      <span />
      <ChartAxisTitle axis="x">Synergy with your picks →</ChartAxisTitle>
    </PanelBody>
  );
}
