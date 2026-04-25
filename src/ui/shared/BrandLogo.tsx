import React from "react";
import logoFullUrl from "../assets/logo-full.svg";
import logoMarkUrl from "../assets/logo-mark.svg";

type BrandLogoVariant = "mark" | "full";

type BrandLogoProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src" | "onError"
> & {
  variant: BrandLogoVariant;
};

function withBase(path: string) {
  const baseUrl = (import.meta as any)?.env?.BASE_URL ?? "/";
  const base =
    typeof baseUrl === "string" && baseUrl.length > 0 ? baseUrl : "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}

function buildCandidates(variant: BrandLogoVariant) {
  if (variant === "mark") {
    return [
      withBase("brand/logo-mark.png"),
      withBase("brand/logo.png"),
      logoMarkUrl,
    ] as const;
  }
  return [
    withBase("brand/logo-full.png"),
    withBase("brand/logo.png"),
    logoFullUrl,
  ] as const;
}

export function BrandLogo({ variant, ...imgProps }: BrandLogoProps) {
  const fallbackSrc = variant === "mark" ? logoMarkUrl : logoFullUrl;
  const candidates = React.useMemo(
    () => buildCandidates(variant) as readonly string[],
    [variant],
  );
  const [resolvedSrc, setResolvedSrc] = React.useState<string>(fallbackSrc);

  React.useEffect(() => {
    let cancelled = false;

    // Start with the built-in SVG to avoid broken-image flicker while probing
    // for optional public/brand PNGs.
    setResolvedSrc(fallbackSrc);

    let index = 0;
    const tryNext = () => {
      const next = candidates[index];
      index += 1;
      if (!next) return;

      const probe = new Image();
      probe.onload = () => {
        if (!cancelled) setResolvedSrc(next);
      };
      probe.onerror = () => {
        if (cancelled) return;
        if (index < candidates.length) tryNext();
      };
      probe.src = next;
    };

    tryNext();
    return () => {
      cancelled = true;
    };
  }, [candidates, fallbackSrc]);

  return (
    <img
      {...imgProps}
      src={resolvedSrc}
    />
  );
}
