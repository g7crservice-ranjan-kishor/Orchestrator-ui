import { DiMsqlServer } from 'react-icons/di';
import {
  SiAngular,
  SiAntdesign,
  SiAuth0,
  SiBlazor,
  SiBootstrap,
  SiChakraui,
  SiDjango,
  SiDotnet,
  SiExpress,
  SiFastapi,
  SiFlask,
  SiGo,
  SiJavascript,
  SiJsonwebtokens,
  SiMongodb,
  SiMui,
  SiMysql,
  SiNestjs,
  SiNextdotjs,
  SiNodedotjs,
  SiOpenjdk,
  SiPostgresql,
  SiPython,
  SiReact,
  SiSharp,
  SiSpringboot,
  SiSqlite,
  SiSvelte,
  SiTailwindcss,
  SiTypescript,
  SiVuedotjs,
} from 'react-icons/si';
import {
  VscAzure,
  VscBell,
  VscCreditCard,
  VscDatabase,
  VscFiles,
  VscKey,
  VscMail,
  VscSymbolColor,
  VscTools,
  VscUnlock,
} from 'react-icons/vsc';

/**
 * Every technology this tool recognises, in its own mark and its own brand colour.
 *
 * Keyed by the exact canonical names the API offers (`TECHNICAL_FIELD_OPTIONS`), which are the same
 * names its detector reads out of a requirement — so a list that gains an entry shows a generic
 * mark rather than silently losing the row.
 *
 * Brands whose mark is black use `currentColor` instead: a hard-coded `#000` disappears against a
 * dark background, and these are the marks a reader is most likely to be scanning for.
 */
const ICONS: Record<string, { Icon: typeof VscDatabase; colour: string }> = {
  // Frontend
  'Next.js': { Icon: SiNextdotjs, colour: 'currentColor' },
  React: { Icon: SiReact, colour: '#61dafb' },
  Angular: { Icon: SiAngular, colour: '#dd0031' },
  Vue: { Icon: SiVuedotjs, colour: '#42b883' },
  Svelte: { Icon: SiSvelte, colour: '#ff3e00' },
  Blazor: { Icon: SiBlazor, colour: '#512bd4' },

  // Language
  TypeScript: { Icon: SiTypescript, colour: '#3178c6' },
  JavaScript: { Icon: SiJavascript, colour: '#f7df1e' },
  'C#': { Icon: SiSharp, colour: '#68217a' },
  Python: { Icon: SiPython, colour: '#3776ab' },
  Java: { Icon: SiOpenjdk, colour: '#ed8b00' },
  Go: { Icon: SiGo, colour: '#00add8' },

  // Interface
  'Ant Design': { Icon: SiAntdesign, colour: '#0170fe' },
  'Material UI': { Icon: SiMui, colour: '#007fff' },
  Tailwind: { Icon: SiTailwindcss, colour: '#06b6d4' },
  Bootstrap: { Icon: SiBootstrap, colour: '#7952b3' },
  'Chakra UI': { Icon: SiChakraui, colour: '#319795' },
  'Fluent UI': { Icon: VscSymbolColor, colour: '#0078d4' },

  // Backend
  NestJS: { Icon: SiNestjs, colour: '#e0234e' },
  Express: { Icon: SiExpress, colour: 'currentColor' },
  'Node.js': { Icon: SiNodedotjs, colour: '#339933' },
  'ASP.NET': { Icon: SiDotnet, colour: '#512bd4' },
  Django: { Icon: SiDjango, colour: '#092e20' },
  FastAPI: { Icon: SiFastapi, colour: '#009688' },
  Flask: { Icon: SiFlask, colour: 'currentColor' },
  'Spring Boot': { Icon: SiSpringboot, colour: '#6db33f' },

  // Database — the same marks and colours the projects table already uses.
  'SQL Server': { Icon: DiMsqlServer, colour: '#cc2927' },
  PostgreSQL: { Icon: SiPostgresql, colour: '#336791' },
  MySQL: { Icon: SiMysql, colour: '#00758f' },
  MongoDB: { Icon: SiMongodb, colour: '#47a248' },
  SQLite: { Icon: SiSqlite, colour: '#003b57' },
  'Cosmos DB': { Icon: VscAzure, colour: '#0078d4' },

  // Authentication
  'Entra ID': { Icon: VscAzure, colour: '#0078d4' },
  OAuth: { Icon: VscKey, colour: '#3c4043' },
  Auth0: { Icon: SiAuth0, colour: '#eb5424' },
  JWT: { Icon: SiJsonwebtokens, colour: 'currentColor' },
  'No sign-in': { Icon: VscUnlock, colour: 'var(--text-muted)' },
  'Username and password': { Icon: VscKey, colour: '#3c4043' },

  // Integrations
  Email: { Icon: VscMail, colour: '#0078d4' },
  Payments: { Icon: VscCreditCard, colour: '#635bff' },
  'File storage': { Icon: VscFiles, colour: '#0078d4' },
  Notifications: { Icon: VscBell, colour: '#f0a500' },
};

/**
 * A neutral mark for anything typed rather than picked.
 *
 * Every field here stays free text, so an answer this tool has never heard of is expected, not an
 * error. It keeps the row aligned with its neighbours without dressing an unknown value as a
 * product — the same reason the projects table leaves "let the planner decide" generic.
 */
const FALLBACK = { Icon: VscTools, colour: 'var(--text-muted)' };

export function TechnologyIcon({ name }: { name: string }) {
  const { Icon, colour } = ICONS[name] ?? FALLBACK;
  return <Icon className="tech-icon" style={{ color: colour }} aria-hidden />;
}
