import { DiMsqlServer } from 'react-icons/di';
import { SiMongodb, SiMysql, SiPostgresql } from 'react-icons/si';
import { VscDatabase } from 'react-icons/vsc';
import type { DatabaseChoice } from '../../lib/types';

/**
 * Each database in its own mark and its own brand colour, so the column is readable at a glance
 * rather than by reading every row.
 *
 * `unset` deliberately keeps the neutral generic icon: "let the planner decide" is the absence of a
 * choice, and dressing it as a product would imply one was made.
 */
const ICONS: Record<DatabaseChoice, { Icon: typeof VscDatabase; colour: string }> = {
  sqlserver: { Icon: DiMsqlServer, colour: '#cc2927' },
  postgres: { Icon: SiPostgresql, colour: '#336791' },
  mysql: { Icon: SiMysql, colour: '#00758f' },
  mongodb: { Icon: SiMongodb, colour: '#47a248' },
  unset: { Icon: VscDatabase, colour: 'var(--text-muted)' },
};

export function DatabaseIcon({ database }: { database: DatabaseChoice }) {
  const { Icon, colour } = ICONS[database] ?? ICONS.unset;
  return <Icon className="pp-db-icon" style={{ color: colour }} aria-hidden />;
}
