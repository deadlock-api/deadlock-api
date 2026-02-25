import type { BoxBrandingProps } from "./BoxBranding.types";

export const BoxBranding = ({ themeClasses }: BoxBrandingProps) => {
  return (
    <div className="flex justify-end">
      <a
        href="https://deadlock-api.com"
        target="_blank"
        rel="noopener noreferrer"
        className={themeClasses.brandingLinkClasses}
        aria-label="Visit deadlock-api.com"
        tabIndex={0}
      >
        <span className={themeClasses.brandingTextClasses.primary}>Powered by</span>
        <span className={themeClasses.brandingTextClasses.secondary}>deadlock-api.com</span>
        <img src="/streamkit/icon-small.png" alt="Logo" className="w-5 h-5 align-middle ml-2" />
      </a>
    </div>
  );
};
