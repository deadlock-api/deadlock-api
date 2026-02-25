export interface Variable {
  name: string;
  description: string;
  default_label?: string | null;
  extra_args?: string[];
  category?: string;
}

export interface CommandBuilderProps {
  region: string;
  accountId: string;
}
