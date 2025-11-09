import type { UpgradeV2 } from "assets-deadlock-api-client";
import { CircleQuestionMark } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { cn } from "~/lib/utils";

function extractImageUrl(
  item: UpgradeV2,
  image: "image" | "shop_image" | "shop_image_small",
  format: "webp" | "png",
) {
  if (image === "image") {
    return format === "webp" ? item?.image_webp : item?.image;
  } else if (image === "shop_image") {
    return format === "webp" ? item?.shop_image_webp : item?.shop_image;
  } else {
    return format === "webp"
      ? item?.shop_image_small_webp
      : item?.shop_image_small;
  }
}

export default function UpgradeImage({
  itemId,
  itemAssets,
  image,
  props,
}: {
  itemId: number;
  itemAssets: UpgradeV2[];
  image?: "image" | "shop_image" | "shop_image_small";
  props?: React.ImgHTMLAttributes<HTMLImageElement>;
}) {
  image = image ?? "shop_image_small";
  const item = itemAssets.find((item) => item.id === itemId);
  const [isError, setIsError] = useState(!item);

  if (isError || !item) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted rounded-md",
          props?.className,
        )}
      >
        <CircleQuestionMark className="size-1/2 text-muted-foreground" />
      </div>
    );
  }

  const png = extractImageUrl(item, image, "png");
  const webp = extractImageUrl(item, image, "webp");

  return (
    <picture>
      {webp && <source srcSet={webp} type="image/webp" />}
      {png && <source srcSet={png} type="image/png" />}
      <img
        src={webp ?? ""}
        alt={item?.name}
        title={item?.name}
        {...props}
        className={cn("size-8 aspect-square", props?.className)}
        onError={() => setIsError(true)}
      />
    </picture>
  );
}
