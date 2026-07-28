// Persistent state for the Node target (feature 93): file-backed SQLite so
// canonical conversation streams, accepted submissions and run records
// survive process restart. Discovered by the flue build at src/db.ts and
// wired into the generated server entry; without it the runtime falls back
// to in-memory SQLite (all state lost on exit).
import { sqlite } from './flue';

export default sqlite('./data/flue.db');
