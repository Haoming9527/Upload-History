export type View = 'popup' | 'history' | 'options';

export type Action = (work: () => Promise<unknown>, success?: string) => Promise<boolean>;

export type Confirmation = {
  title: string;
  description: string;
  label: string;
  perform: () => Promise<unknown>;
  success: string;
};
