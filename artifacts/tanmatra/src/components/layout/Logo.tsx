interface LogoProps {
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

export default function Logo({ className, "aria-hidden": ariaHidden }: LogoProps) {
  const src = `${import.meta.env.BASE_URL}tanmatra-logo.png`;
  const decorative = ariaHidden === true || ariaHidden === "true";
  return (
    <span
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": "Tanmatra" })}
      className={className}
      style={{
        display: "inline-block",
        aspectRatio: "1600 / 397",
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
