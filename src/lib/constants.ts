import type { BetStatus, BetType, CurrencyCode, DateFormat, DateRangePreset, TransactionType } from '../types';

export const APP_NAME = 'EdgeTrack';
export const APP_TAGLINE = 'Know your numbers. Every bet counts.';

export const BET_TYPE_LABELS: Record<BetType, string> = {
  moneyline: 'Moneyline / Match Winner',
  spread: 'Spread / Handicap',
  over_under: 'Over / Under',
  player_props: 'Player Props',
  parlay: 'Parlay',
  live: 'Live Bet',
  futures: 'Futures',
  other: 'Other',
};

export const BET_TYPE_SHORT_LABELS: Record<BetType, string> = {
  moneyline: 'Moneyline',
  spread: 'Spread',
  over_under: 'Over/Under',
  player_props: 'Props',
  parlay: 'Parlay',
  live: 'Live',
  futures: 'Futures',
  other: 'Other',
};

export const STATUS_LABELS: Record<BetStatus, string> = {
  pending: 'Pending',
  won: 'Won',
  lost: 'Lost',
  void: 'Void / Push',
  half_won: 'Half Won',
  half_lost: 'Half Lost',
  cashed_out: 'Cashed Out',
};

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  initial: 'Initial bankroll',
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
};

export const CURRENCY_META: Record<CurrencyCode, { symbol: string; locale: string; name: string }> = {
  INR: { symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
  USD: { symbol: '$', locale: 'en-US', name: 'US Dollar' },
  EUR: { symbol: '€', locale: 'de-DE', name: 'Euro' },
  GBP: { symbol: '£', locale: 'en-GB', name: 'British Pound' },
  AUD: { symbol: 'A$', locale: 'en-AU', name: 'Australian Dollar' },
  CAD: { symbol: 'C$', locale: 'en-CA', name: 'Canadian Dollar' },
  NZD: { symbol: 'NZ$', locale: 'en-NZ', name: 'New Zealand Dollar' },
  ZAR: { symbol: 'R', locale: 'en-ZA', name: 'South African Rand' },
  NGN: { symbol: '₦', locale: 'en-NG', name: 'Nigerian Naira' },
  KES: { symbol: 'KSh', locale: 'en-KE', name: 'Kenyan Shilling' },
  BRL: { symbol: 'R$', locale: 'pt-BR', name: 'Brazilian Real' },
  JPY: { symbol: '¥', locale: 'ja-JP', name: 'Japanese Yen' },
};

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  'dd MMM yyyy': '26 Oct 2026',
  'dd/MM/yyyy': '26/10/2026',
  'MM/dd/yyyy': '10/26/2026',
  'yyyy-MM-dd': '2026-10-26',
};

export const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  today: 'Today',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  ytd: 'Year to date',
  all: 'All time',
  custom: 'Custom range',
};

export const SPORT_SUGGESTIONS = [
  'Cricket',
  'Football',
  'Basketball',
  'Tennis',
  'American Football',
  'Baseball',
  'Ice Hockey',
  'Kabaddi',
  'Esports',
  'MMA',
  'Boxing',
  'Golf',
  'Horse Racing',
  'Formula 1',
  'Table Tennis',
  'Badminton',
  'Rugby',
  'Volleyball',
];

export const BOOKMAKER_SUGGESTIONS = ['Bet365', 'Betway', 'Stake', '1xBet', 'Dafabet', 'Parimatch', 'Pinnacle', 'Betfair'];

export const MIN_ODDS = 1.01;
export const MAX_ODDS = 1000;
export const MAX_STAKE = 1_000_000_000;
