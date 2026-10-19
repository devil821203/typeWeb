/** Documentation-only REST types. Runtime frontend is JavaScript. */
export interface Profile {
  birthday: string;
  phone: string;
  name: string;
  nickname: string;
}
export interface Register extends Profile {
  email: string;
  password: string;
}
export interface Member extends Profile {
  id: number;
  email: string;
}
export interface Course {
  id: number;
  title: string;
  description: string;
}
export interface ArticleMetadata {
  language: 'zh' | 'en';
  id: number;
  course_id: number;
  title: string;
  members_only: boolean;
  character_count: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}
export interface ArticleSummary extends ArticleMetadata {
  personal_average_cpm: number | null;
  personal_average_wpm: number | null;
  personal_attempts: number;
}
export interface Article extends ArticleMetadata {
  content: string;
}
export interface Attempt {
  id: number;
  member_id: number;
  article_id: number;
  content_snapshot: string;
  started_at: string;
  finished_at: string | null;
  elapsed_ms: number | null;
  typed_text: string | null;
  correct_chars: number | null;
  cpm: number | null;
  wpm: number | null;
  accuracy: number | null;
  scoring_mode: 'zh' | 'en' | null;
  chinese_metrics: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
}
export interface HistoryAttempt extends Attempt {
  article_title: string;
  course_title: string;
}
export interface Csrf {
  token: string;
  headerName: string;
}
export interface Finish {
  typedText: string;
  completed: boolean;
  chineseMetrics?: ChineseMetrics | null;
}

/** Interval CPM counts correct Han characters and Chinese/fullwidth punctuation. */
export interface ChineseMetrics {
  backspaces: number;
  selectionErrors: number;
  frequentWords: { word: string; count: number }[];
  firstCpm: number | null;
  lastCpm: number | null;
  declinePercent: number | null;
}

export interface DailySpeed {
  date: string;
  average_cpm: number | null;
  attempts: number;
}
export interface DailyTrend {
  from: string;
  to: string;
  mode: 'zh' | 'en';
  zone: string;
  average_cpm: number | null;
  attempts: number;
  days: DailySpeed[];
}
export interface DailyTrendQuery {
  date: string;
  period?: 'day' | 'week' | 'month' | 'year';
  mode?: 'zh' | 'en';
  zone?: string;
  courseId?: number;
  articleId?: number;
}

export interface SpeedAverage {
  mode: 'zh' | 'en';
  average_cpm: number | null;
  average_wpm: number | null;
  attempts: number;
}
export interface StatisticsGroup {
  id: number;
  title: string;
  course_id: number | null;
  averages: SpeedAverage[];
}
export interface StatisticsSummary {
  from: string | null;
  to: string | null;
  zone: string;
  overall: SpeedAverage[];
  averages: SpeedAverage[];
  courses: StatisticsGroup[];
  articles: StatisticsGroup[];
}
export interface StatisticsQuery {
  date: string;
  period?: 'all' | 'day' | 'week' | 'month' | 'year';
  zone?: string;
  courseId?: number;
  articleId?: number;
}
