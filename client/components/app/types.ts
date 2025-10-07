export type ScreenId = "login" | "jobs" | "create" | "detail";

export interface JobItem {
  id: string;
  title: string;
  price: number;
  summary: string;
  description: string;
  start: string;
  end: string;
  location: string;
}
