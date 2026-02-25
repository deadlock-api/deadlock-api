export interface BoxHeaderProps {
  userName?: string;
  showMatchHistory?: boolean;
  themeClasses: {
    headerClasses: (showMatchHistory?: boolean) => string;
    userNameClasses: string;
  };
}
