import type { HeroV2 } from "assets-deadlock-api-client";
import type { HeroImagesV2 } from "assets-deadlock-api-client/api";
import { CircleQuestionMark } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { cn } from "~/lib/utils";

function extractImageUrl(item: HeroV2, image: keyof HeroImagesV2, format: "webp" | "png") {
  const image_key = format === "webp" ? `${image}_webp` : image.replace("_webp", "");
  return item.images[image_key as keyof HeroImagesV2];
}

export default function HeroImage({
  heroId,
  heroAssets,
  image,
  props,
}: {
  heroId: number;
  heroAssets: HeroV2[];
  image?: keyof HeroImagesV2;
  props?: React.ImgHTMLAttributes<HTMLImageElement>;
}) {
  image = image ?? "minimap_image";
  const hero = heroAssets.find((hero) => hero.id === heroId);
  const [isError, setIsError] = useState(!hero);

  if (isError || !hero) {
    return (
      <div className={cn("flex items-center justify-center bg-muted rounded-md", props?.className)}>
        <CircleQuestionMark className="size-1/2 text-muted-foreground" />
      </div>
    );
  }

  const png = extractImageUrl(hero, image, "png");
  const webp = extractImageUrl(hero, image, "webp");

  return (
    <picture>
      {webp && <source srcSet={webp} type="image/webp" />}
      {png && <source srcSet={png} type="image/png" />}
      <img
        src={webp ?? ""}
        alt={hero?.name}
        title={hero?.name}
        {...props}
        className={cn("size-8 aspect-square", props?.className)}
        onError={() => setIsError(true)}
      />
    </picture>
  );
}
