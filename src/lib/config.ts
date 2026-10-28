// Central, tunable settings of the status logic.

export interface StatusConfig {
  /** Assets due within this many days (and not yet in approval) turn the light yellow. */
  dueSoonDays: number;
  /** Time zone that defines "today" and the calendar day of stored dates. */
  timeZone: string;
}

export const statusConfig: StatusConfig = {
  dueSoonDays: 7,
  timeZone: "Europe/Berlin",
};

export const appConfig = {
  locale: "en-GB",
  currency: "EUR",
} as const;
